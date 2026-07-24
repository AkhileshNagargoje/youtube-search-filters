// Shared logic for YouTube Year Filter, used by both the content script and the
// popup. Exposes a single global: window.YTYF.

(function () {
  const STORAGE_KEY = "ytFilterSettings";
  const LEGACY_KEY = "ytYearFilterRange"; // v1.x stored only {from,to}
  const FIRST_YEAR = 2005; // YouTube launched in 2005.

  function currentYear() {
    return new Date().getFullYear();
  }

  // Full settings object with sane defaults.
  function defaults() {
    return {
      from: "", // year lower bound (search operator)
      to: "", // year upper bound (search operator)
      hideShorts: false, // remove Shorts from the page
      minDuration: "", // minutes (DOM filter)
      maxDuration: "", // minutes (DOM filter)
      minViews: "", // absolute view count (DOM filter)
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
    };
  }

  function load(callback) {
    try {
      chrome.storage.sync.get([STORAGE_KEY, LEGACY_KEY], (res) => {
        res = res || {};
        // Migrate legacy {from,to} if present and new settings absent.
        const base = res[STORAGE_KEY] || res[LEGACY_KEY] || {};
        callback(normalize(base));
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

  // ---- parsers (used by DOM filters; pure + testable) ----------------------

  // "1.2M views" → 1200000, "12K" → 12000, "1,234 views" → 1234, "No views" → 0
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

  // "12:34" → 754, "1:02:03" → 3723; returns null for "LIVE"/"SHORTS"/etc.
  function parseDuration(text) {
    if (!text) return null;
    const t = text.trim();
    if (!/^\d{1,2}(:\d{2}){1,2}$/.test(t)) return null;
    return t.split(":").reduce((acc, p) => acc * 60 + parseInt(p, 10), 0);
  }

  // ---- state helpers -------------------------------------------------------

  function hasYearFilter(s) {
    return Boolean(s && (s.from || s.to));
  }

  function hasDomFilter(s) {
    return Boolean(
      s && (s.hideShorts || s.minDuration || s.maxDuration || s.minViews)
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
    defaults,
    normalize,
    load,
    save,
    onChanged,
    stripDateOperators,
    buildQuery,
    parseViews,
    parseDuration,
    hasYearFilter,
    hasDomFilter,
    isActive,
    describeYear,
  };
})();
