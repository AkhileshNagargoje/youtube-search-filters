// YouTube Year Filter — content script.
// - Year range: rewrites the search query with before:/after: operators.
// - Hide Shorts / duration / min-views: hides non-matching results on the page.

(function () {
  const YTYF = window.YTYF;
  const WRAPPER_ID = "ytyf-wrapper";
  const FROM_ID = "ytyf-from";
  const TO_ID = "ytyf-to";
  const COUNT_ID = "ytyf-count";

  const RENDERER_SEL = [
    "ytd-video-renderer",
    "ytd-grid-video-renderer",
    "ytd-rich-item-renderer",
    "ytd-compact-video-renderer",
  ].join(",");

  let settings = YTYF.defaults();

  // ---- search submission (year range) --------------------------------------

  function getSearchInput() {
    return (
      document.querySelector("input#search") ||
      document.querySelector("ytd-searchbox input") ||
      document.querySelector('input[name="search_query"]')
    );
  }

  function runSearch(rawQuery) {
    const finalQuery = YTYF.buildQuery(rawQuery, settings);
    if (!finalQuery) return;
    window.location.href =
      "https://www.youtube.com/results?search_query=" +
      encodeURIComponent(finalQuery);
  }

  function handleKeydown(e) {
    if (e.key !== "Enter" || !YTYF.hasYearFilter(settings)) return;
    const input = getSearchInput();
    if (!input || e.target !== input) return;
    const raw = input.value.trim();
    if (!raw) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    runSearch(raw);
  }

  function handleClick(e) {
    if (!YTYF.hasYearFilter(settings)) return;
    const btn = e.target.closest(
      "#search-icon-legacy, button[aria-label='Search'], ytd-searchbox button"
    );
    if (!btn) return;
    const input = getSearchInput();
    if (!input) return;
    const raw = input.value.trim();
    if (!raw) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    runSearch(raw);
  }

  // ---- DOM filters (hide shorts / duration / views) ------------------------

  function hide(el) {
    el.style.display = "none";
    el.dataset.ytfHidden = "1";
  }

  function show(el) {
    if (el.dataset.ytfHidden) {
      el.style.display = "";
      delete el.dataset.ytfHidden;
    }
  }

  function isShort(el) {
    return (
      !!el.querySelector('a[href*="/shorts/"]') ||
      el.tagName.toLowerCase().includes("reel")
    );
  }

  function getDurationSeconds(el) {
    const badge = el.querySelector(
      "ytd-thumbnail-overlay-time-status-renderer #text," +
        "ytd-thumbnail-overlay-time-status-renderer span," +
        ".badge-shape-wiz__text," +
        "#time-status #text"
    );
    return badge ? YTYF.parseDuration(badge.textContent) : null;
  }

  function getViews(el) {
    const items = el.querySelectorAll(
      "#metadata-line span, .inline-metadata-item, #metadata-line .inline-metadata-item"
    );
    for (const it of items) {
      if (/view/i.test(it.textContent)) return YTYF.parseViews(it.textContent);
    }
    return null;
  }

  // true = keep visible, false = hide
  function matches(el, s) {
    if (s.hideShorts && isShort(el)) return false;

    const min = parseInt(s.minDuration, 10);
    const max = parseInt(s.maxDuration, 10);
    if (!isNaN(min) || !isNaN(max)) {
      const secs = getDurationSeconds(el);
      if (secs != null) {
        if (!isNaN(min) && secs < min * 60) return false;
        if (!isNaN(max) && secs > max * 60) return false;
      }
    }

    const minV = parseInt(s.minViews, 10);
    if (!isNaN(minV)) {
      const v = getViews(el);
      if (v != null && v < minV) return false;
    }
    return true;
  }

  function applyDomFilters() {
    // Restore everything first, then re-hide — avoids stale hidden state when a
    // filter is relaxed. Runs synchronously so no intermediate paint/flicker.
    document.querySelectorAll("[data-ytf-hidden]").forEach(show);

    if (YTYF.hasDomFilter(settings)) {
      if (settings.hideShorts) {
        document
          .querySelectorAll("ytd-reel-shelf-renderer, ytd-rich-shelf-renderer")
          .forEach((shelf) => {
            if (shelf.querySelector('a[href*="/shorts/"]')) hide(shelf);
          });
      }
      document.querySelectorAll(RENDERER_SEL).forEach((el) => {
        if (!matches(el, settings)) hide(el);
      });
    }
    updateCount();
  }

  let scheduled = false;
  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      applyDomFilters();
    });
  }

  function updateCount() {
    const badge = document.getElementById(COUNT_ID);
    if (!badge) return;
    const n = document.querySelectorAll("[data-ytf-hidden]").length;
    if (YTYF.hasDomFilter(settings) && n > 0) {
      badge.textContent = `${n} hidden`;
      badge.style.display = "";
    } else {
      badge.style.display = "none";
    }
  }

  // ---- inline UI (year pills next to the search bar) -----------------------

  function makeSelect(id, placeholder, key) {
    const sel = document.createElement("select");
    sel.id = id;
    sel.className = "ytyf-select";
    sel.setAttribute("aria-label", placeholder);

    const any = document.createElement("option");
    any.value = "";
    any.textContent = placeholder;
    sel.appendChild(any);

    for (let y = YTYF.currentYear(); y >= YTYF.FIRST_YEAR; y--) {
      const opt = document.createElement("option");
      opt.value = String(y);
      opt.textContent = String(y);
      sel.appendChild(opt);
    }

    sel.addEventListener("change", () => {
      settings[key] = sel.value;
      YTYF.save(settings);
      updateActive();
    });
    return sel;
  }

  function updateActive() {
    const wrapper = document.getElementById(WRAPPER_ID);
    if (wrapper)
      wrapper.classList.toggle("ytyf-active", YTYF.isActive(settings));
  }

  function syncUI() {
    const from = document.getElementById(FROM_ID);
    const to = document.getElementById(TO_ID);
    if (from) from.value = settings.from;
    if (to) to.value = settings.to;
    updateActive();
    updateCount();
  }

  function injectUI() {
    if (document.getElementById(WRAPPER_ID)) return;
    const input = getSearchInput();
    if (!input) return;

    const searchbox =
      document.querySelector("ytd-searchbox") ||
      input.closest("form") ||
      input.parentElement;
    if (!searchbox || !searchbox.parentElement) return;

    const wrapper = document.createElement("span");
    wrapper.id = WRAPPER_ID;
    wrapper.title = "Filter YouTube results (year, Shorts, duration, views)";

    const icon = document.createElement("span");
    icon.className = "ytyf-icon";
    icon.textContent = "📅";
    wrapper.appendChild(icon);

    wrapper.appendChild(makeSelect(FROM_ID, "From", "from"));

    const dash = document.createElement("span");
    dash.className = "ytyf-dash";
    dash.textContent = "–";
    wrapper.appendChild(dash);

    wrapper.appendChild(makeSelect(TO_ID, "To", "to"));

    const count = document.createElement("span");
    count.id = COUNT_ID;
    count.className = "ytyf-count";
    count.style.display = "none";
    wrapper.appendChild(count);

    searchbox.parentElement.insertBefore(wrapper, searchbox.nextSibling);
    syncUI();
  }

  // ---- boot & SPA handling -------------------------------------------------

  function init() {
    YTYF.load((s) => {
      settings = s;
      injectUI();
      syncUI();
      applyDomFilters();
    });
  }

  const observer = new MutationObserver(() => {
    if (!document.getElementById(WRAPPER_ID)) injectUI();
    scheduleApply();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  YTYF.onChanged((s) => {
    settings = s;
    syncUI();
    applyDomFilters();
  });

  document.addEventListener("keydown", handleKeydown, true);
  document.addEventListener("click", handleClick, true);
  document.addEventListener("yt-navigate-finish", init);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
