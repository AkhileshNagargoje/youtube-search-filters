// Shared logic for YouTube Year Filter, used by both the content script and the
// popup. Exposes a single global: window.YTYF.

(function () {
  const STORAGE_KEY = "ytYearFilterRange";
  const FIRST_YEAR = 2005; // YouTube launched in 2005.

  function currentYear() {
    return new Date().getFullYear();
  }

  // Default (inclusive) filter: no bounds.
  function emptyFilter() {
    return { from: "", to: "" };
  }

  function loadFilter(callback) {
    try {
      chrome.storage.sync.get(STORAGE_KEY, (res) => {
        const stored = (res && res[STORAGE_KEY]) || {};
        callback({ from: stored.from || "", to: stored.to || "" });
      });
    } catch (e) {
      callback(emptyFilter());
    }
  }

  function saveFilter(filter) {
    try {
      chrome.storage.sync.set({ [STORAGE_KEY]: filter });
    } catch (e) {}
  }

  function onFilterChanged(callback) {
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "sync" && changes[STORAGE_KEY]) {
          const v = changes[STORAGE_KEY].newValue || {};
          callback({ from: v.from || "", to: v.to || "" });
        }
      });
    } catch (e) {}
  }

  // Strip any before:/after: tokens so we never stack duplicates.
  function stripDateOperators(query) {
    return query
      .replace(/\s*\bbefore:\d{4}-\d{2}-\d{2}\b/gi, "")
      .replace(/\s*\bafter:\d{4}-\d{2}-\d{2}\b/gi, "")
      .trim();
  }

  // Build the final YouTube query string from a raw query + a {from,to} filter.
  function buildQuery(rawQuery, filter) {
    let q = stripDateOperators(rawQuery);
    const parts = [q];
    if (filter.from) {
      // Include all of the "from" year: after the last day of the prior year.
      const y = parseInt(filter.from, 10) - 1;
      parts.push(`after:${y}-12-31`);
    }
    if (filter.to) {
      // Include all of the "to" year: before Jan 1 of the following year.
      const y = parseInt(filter.to, 10) + 1;
      parts.push(`before:${y}-01-01`);
    }
    return parts.filter(Boolean).join(" ").trim();
  }

  function isActive(filter) {
    return Boolean(filter && (filter.from || filter.to));
  }

  // Human-readable summary, e.g. "2015 – 2019", "up to 2019", "from 2015".
  function describe(filter) {
    if (!isActive(filter)) return "Any year";
    if (filter.from && filter.to) return `${filter.from} – ${filter.to}`;
    if (filter.to) return `up to ${filter.to}`;
    return `from ${filter.from}`;
  }

  window.YTYF = {
    STORAGE_KEY,
    FIRST_YEAR,
    currentYear,
    emptyFilter,
    loadFilter,
    saveFilter,
    onFilterChanged,
    stripDateOperators,
    buildQuery,
    isActive,
    describe,
  };
})();
