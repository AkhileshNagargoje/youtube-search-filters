// Shared logic for YouTube Filter, used by the content script and the popup.
// Exposes a single global: window.YTYF.

(function () {
  const STORAGE_KEY = "ytFilterSettings";
  const LEGACY_KEY = "ytYearFilterRange"; // v1.x stored only {from,to}
  const FIRST_YEAR = 2005; // YouTube launched in 2005.

  // chrome.storage.sync allows 120 writes/minute (1,800/hour); over-quota
  // writes fail and set runtime.lastError. Debounce so typing in a text field
  // can never approach that.
  const SAVE_DEBOUNCE_MS = 800;

  function currentYear() {
    return new Date().getFullYear();
  }

  // Localized string with an English fallback (works even without chrome.i18n).
  function t(key, fallback) {
    try {
      const m = chrome.i18n && chrome.i18n.getMessage(key);
      if (m) return m;
    } catch (e) {}
    return fallback;
  }

  function defaults() {
    return {
      from: "",
      to: "",
      hideShorts: false,
      minDuration: "",
      maxDuration: "",
      minViews: "",
      hideWatched: false,
      blockKeywords: "",
      blockChannels: "",
    };
  }

  function normalize(obj) {
    if (!obj) return defaults();
    return {
      from: obj.from || "",
      to: obj.to || "",
      hideShorts: Boolean(obj.hideShorts),
      minDuration: obj.minDuration || "",
      maxDuration: obj.maxDuration || "",
      minViews: obj.minViews || "",
      hideWatched: Boolean(obj.hideWatched),
      blockKeywords: obj.blockKeywords || "",
      blockChannels: obj.blockChannels || "",
    };
  }

  function load(callback) {
    try {
      chrome.storage.sync.get([STORAGE_KEY, LEGACY_KEY], (res) => {
        res = res || {};
        callback(normalize(res[STORAGE_KEY] || res[LEGACY_KEY] || {}));
      });
    } catch (e) {
      callback(defaults());
    }
  }

  // ---- debounced, error-checked persistence --------------------------------

  let saveTimer = null;
  let pending = null;

  function writeNow() {
    if (!pending) return;
    const value = pending;
    pending = null;
    try {
      chrome.storage.sync.set({ [STORAGE_KEY]: value }, () => {
        const err = chrome.runtime && chrome.runtime.lastError;
        if (!err) return;
        // Most likely the sync write quota. Fall back to local storage so the
        // user's settings are never silently lost.
        console.warn("[YouTube Filter] sync write failed:", err.message);
        try {
          chrome.storage.local.set({ [STORAGE_KEY]: value });
        } catch (e) {}
      });
    } catch (e) {
      try {
        chrome.storage.local.set({ [STORAGE_KEY]: value });
      } catch (e2) {}
    }
  }

  // save() coalesces rapid calls (e.g. every keystroke) into one write.
  function save(settings, immediate) {
    pending = normalize(settings);
    if (saveTimer) clearTimeout(saveTimer);
    if (immediate) {
      saveTimer = null;
      writeNow();
      return;
    }
    saveTimer = setTimeout(() => {
      saveTimer = null;
      writeNow();
    }, SAVE_DEBOUNCE_MS);
  }

  // Force any pending write out (call before the page unloads).
  function flush() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    writeNow();
  }

  function onChanged(callback) {
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if ((area === "sync" || area === "local") && changes[STORAGE_KEY]) {
          callback(normalize(changes[STORAGE_KEY].newValue));
        }
      });
    } catch (e) {}
  }

  // ---- query building (year range → search operators) ----------------------

  function stripDateOperators(query) {
    return query
      .replace(/\s*\bbefore:\d{4}-\d{2}-\d{2}\b/gi, "")
      .replace(/\s*\bafter:\d{4}-\d{2}-\d{2}\b/gi, "")
      .trim();
  }

  function buildQuery(rawQuery, s) {
    const parts = [stripDateOperators(rawQuery)];
    if (s.from) parts.push(`after:${parseInt(s.from, 10) - 1}-12-31`);
    if (s.to) parts.push(`before:${parseInt(s.to, 10) + 1}-01-01`);
    return parts.filter(Boolean).join(" ").trim();
  }

  // ---- locale-aware number parsing -----------------------------------------

  // Compact-number suffixes across YouTube's supported locales. Ordered so that
  // longer tokens are tested first ("mio" before "mi" before "m").
  const MULTIPLIERS = [
    ["млрд", 1e9], ["млн", 1e6], ["тыс", 1e3],
    ["mrd", 1e9], ["mld", 1e9], ["mio", 1e6], ["mln", 1e6],
    ["mil", 1e3], ["mi", 1e6], ["tys", 1e3],
    ["crore", 1e7], ["lakh", 1e5],
    ["करोड़", 1e7], ["लाख", 1e5], ["हज़ार", 1e3], ["हजार", 1e3],
    ["مليار", 1e9], ["مليون", 1e6], ["ألف", 1e3],
    ["میلیون", 1e6], ["هزار", 1e3],
    ["億", 1e8], ["亿", 1e8], ["억", 1e8],
    ["萬", 1e4], ["万", 1e4], ["만", 1e4],
    ["千", 1e3], ["천", 1e3],
    ["k", 1e3], ["m", 1e6], ["b", 1e9], ["t", 1e12],
  ];

  // Locales where a single letter means something different than in English.
  // Turkish "B" = bin = 1,000 (not billion); "Mn" = milyon.
  const LOCALE_MULTIPLIERS = {
    tr: [["mn", 1e6], ["mr", 1e9], ["b", 1e3]],
  };

  // "1.2" → 1.2, "1,2" → 1.2, "1,234" → 1234, "1.234.567" → 1234567.
  // YouTube's compact format uses at most one decimal digit, so a separator
  // followed by exactly three digits is a thousands separator.
  function parseNumberToken(token) {
    const hasDot = token.includes(".");
    const hasComma = token.includes(",");

    if (hasDot && hasComma) {
      // Whichever separator comes last is the decimal one.
      return token.lastIndexOf(".") > token.lastIndexOf(",")
        ? parseFloat(token.replace(/,/g, ""))
        : parseFloat(token.replace(/\./g, "").replace(",", "."));
    }
    const sep = hasComma ? "," : hasDot ? "." : null;
    if (!sep) return parseFloat(token);

    const parts = token.split(sep);
    if (parts.length > 2) return parseFloat(token.split(sep).join("")); // grouped
    if (parts[1].length === 3) return parseFloat(parts.join("")); // thousands
    return parseFloat(parts[0] + "." + parts[1]); // decimal
  }

  function multiplierFor(rest, lang) {
    const s = rest.trim().toLowerCase();
    if (!s) return 1;
    const code = (lang || "").slice(0, 2).toLowerCase();
    const table = (LOCALE_MULTIPLIERS[code] || []).concat(MULTIPLIERS);
    for (const [token, factor] of table) {
      if (s.startsWith(token)) return factor;
    }
    return 1;
  }

  // Parse a localized view count: "1.2M views", "1,2 Mio. Aufrufe",
  // "12万 回視聴", "1.2 लाख व्यू", "12 B görüntüleme" (tr) → absolute number.
  function parseViews(text, lang) {
    if (!text) return null;
    const m = String(text).match(/(\d[\d.,\s ]*)/);
    if (!m) return 0; // e.g. "No views" / "Keine Aufrufe"
    // Trim trailing separators/spaces that belong to the following words.
    const token = m[1].replace(/[\s ]/g, "").replace(/[.,]+$/, "");
    const n = parseNumberToken(token);
    if (isNaN(n)) return null;
    const rest = String(text).slice(m.index + m[1].length);
    return Math.round(n * multiplierFor(rest, lang));
  }

  // "12:34" → 754, "1:02:03" → 3723. Colons are locale-independent.
  function parseDuration(text) {
    if (!text) return null;
    const s = String(text).trim();
    if (!/^\d{1,3}(:\d{2}){1,2}$/.test(s)) return null;
    return s.split(":").reduce((acc, p) => acc * 60 + parseInt(p, 10), 0);
  }

  // Comma/newline separated list → array of lowercased tokens.
  function parseList(str) {
    return (str || "")
      .split(/[,\n]/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }

  // ---- state helpers -------------------------------------------------------

  function hasYearFilter(s) {
    return Boolean(s && (s.from || s.to));
  }

  function hasDomFilter(s) {
    return Boolean(
      s &&
        (s.hideShorts ||
          s.minDuration ||
          s.maxDuration ||
          s.minViews ||
          s.hideWatched ||
          s.blockKeywords ||
          s.blockChannels)
    );
  }

  function isActive(s) {
    return hasYearFilter(s) || hasDomFilter(s);
  }

  function describeYear(s) {
    if (!hasYearFilter(s)) return "Any year";
    if (s.from && s.to) return `${s.from} – ${s.to}`;
    if (s.to) return `up to ${s.to}`;
    return `from ${s.from}`;
  }

  window.YTYF = {
    STORAGE_KEY,
    FIRST_YEAR,
    SAVE_DEBOUNCE_MS,
    currentYear,
    t,
    defaults,
    normalize,
    load,
    save,
    flush,
    onChanged,
    stripDateOperators,
    buildQuery,
    parseNumberToken,
    parseViews,
    parseDuration,
    parseList,
    hasYearFilter,
    hasDomFilter,
    isActive,
    describeYear,
  };
})();
