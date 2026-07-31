// Shared logic for YouTube Filter, used by the content script and the popup.
// Exposes a single global: window.YTYF.

(function () {
  const STORAGE_KEY = "ytFilterSettings";
  const LEGACY_KEY = "ytYearFilterRange"; // v1.x stored only {from,to}
  const FIRST_YEAR = 2005; // YouTube launched in 2005.

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
    const d = defaults();
    if (!obj) return d;
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

  function save(settings) {
    try {
      chrome.storage.sync.set({ [STORAGE_KEY]: normalize(settings) });
    } catch (e) {}
  }

  function onChanged(callback) {
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "sync" && changes[STORAGE_KEY]) {
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

  // ---- parsers -------------------------------------------------------------

  function parseViews(text) {
    if (!text) return null;
    if (/^\s*no views/i.test(text)) return 0;
    const m = text.match(/([\d.,]+)\s*([KMB])?/i);
    if (!m) return null;
    let n = parseFloat(m[1].replace(/,/g, ""));
    if (isNaN(n)) return null;
    const suffix = (m[2] || "").toUpperCase();
    if (suffix === "K") n *= 1e3;
    else if (suffix === "M") n *= 1e6;
    else if (suffix === "B") n *= 1e9;
    return Math.round(n);
  }

  function parseDuration(text) {
    if (!text) return null;
    const t2 = text.trim();
    if (!/^\d{1,2}(:\d{2}){1,2}$/.test(t2)) return null;
    return t2.split(":").reduce((acc, p) => acc * 60 + parseInt(p, 10), 0);
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
    currentYear,
    t,
    defaults,
    normalize,
    load,
    save,
    onChanged,
    stripDateOperators,
    buildQuery,
    parseViews,
    parseDuration,
    parseList,
    hasYearFilter,
    hasDomFilter,
    isActive,
    describeYear,
  };
})();
