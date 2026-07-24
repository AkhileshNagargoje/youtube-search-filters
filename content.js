// YouTube Filter — content script.
// Adds a "Filters" button next to the search bar that opens an in-page panel.
// - Year range: rewrites the search query with before:/after: operators.
// - Hide Shorts / duration / min-views: hides non-matching results on the page.

(function () {
  const YTYF = window.YTYF;
  const WRAPPER_ID = "ytyf-wrapper";
  const BTN_ID = "ytyf-btn";
  const PANEL_ID = "ytyf-panel";
  const COUNT_ID = "ytyf-count";

  const F = {
    from: "ytyf-from",
    to: "ytyf-to",
    hideShorts: "ytyf-hideshorts",
    minDuration: "ytyf-mindur",
    maxDuration: "ytyf-maxdur",
    minViews: "ytyf-minviews",
  };

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

  function handleSearchClick(e) {
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
    updateBadges();
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

  // ---- UI: button + in-page panel ------------------------------------------

  function updateBadges() {
    const btn = document.getElementById(BTN_ID);
    if (btn) btn.classList.toggle("ytyf-on", YTYF.isActive(settings));

    const badge = document.getElementById(COUNT_ID);
    if (badge) {
      const n = document.querySelectorAll("[data-ytf-hidden]").length;
      if (YTYF.hasDomFilter(settings) && n > 0) {
        badge.textContent = String(n);
        badge.style.display = "";
      } else {
        badge.style.display = "none";
      }
    }
  }

  function yearSelect(id, key) {
    const sel = document.createElement("select");
    sel.id = id;
    sel.className = "ytyf-input";
    const any = document.createElement("option");
    any.value = "";
    any.textContent = "Any";
    sel.appendChild(any);
    for (let y = YTYF.currentYear(); y >= YTYF.FIRST_YEAR; y--) {
      const o = document.createElement("option");
      o.value = String(y);
      o.textContent = String(y);
      sel.appendChild(o);
    }
    sel.addEventListener("change", () => setField(key, sel.value));
    return sel;
  }

  function numInput(id, key, placeholder) {
    const inp = document.createElement("input");
    inp.type = "number";
    inp.min = "0";
    inp.id = id;
    inp.className = "ytyf-input";
    inp.placeholder = placeholder;
    inp.addEventListener("input", () => setField(key, inp.value.trim()));
    return inp;
  }

  function row(labelText, ...controls) {
    const r = document.createElement("div");
    r.className = "ytyf-row";
    const l = document.createElement("span");
    l.className = "ytyf-label";
    l.textContent = labelText;
    r.appendChild(l);
    const c = document.createElement("div");
    c.className = "ytyf-controls";
    controls.forEach((x) => c.appendChild(x));
    r.appendChild(c);
    return r;
  }

  function setField(key, value) {
    settings[key] = value;
    settings = YTYF.normalize(settings);
    YTYF.save(settings);
    applyDomFilters();
  }

  function buildPanel() {
    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.className = "ytyf-panel";

    const title = document.createElement("div");
    title.className = "ytyf-title";
    title.textContent = "Filter results";
    panel.appendChild(title);

    // Year range
    const dash = document.createElement("span");
    dash.className = "ytyf-dash";
    dash.textContent = "–";
    panel.appendChild(
      row("Upload year", yearSelect(F.from, "from"), dash, yearSelect(F.to, "to"))
    );

    // Hide Shorts toggle
    const sw = document.createElement("label");
    sw.className = "ytyf-switch";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = F.hideShorts;
    cb.addEventListener("change", () => setField("hideShorts", cb.checked));
    const sl = document.createElement("span");
    sl.className = "ytyf-slider";
    sw.appendChild(cb);
    sw.appendChild(sl);
    panel.appendChild(row("Hide Shorts", sw));

    // Duration
    const dsep = document.createElement("span");
    dsep.className = "ytyf-dash";
    dsep.textContent = "–";
    panel.appendChild(
      row(
        "Duration (min)",
        numInput(F.minDuration, "minDuration", "min"),
        dsep,
        numInput(F.maxDuration, "maxDuration", "max")
      )
    );

    // Min views
    panel.appendChild(
      row("Min views", numInput(F.minViews, "minViews", "e.g. 10000"))
    );

    // Footer
    const footer = document.createElement("div");
    footer.className = "ytyf-footer";
    const clear = document.createElement("button");
    clear.className = "ytyf-clear";
    clear.textContent = "Clear all";
    clear.addEventListener("click", () => {
      settings = YTYF.defaults();
      YTYF.save(settings);
      syncPanel();
      applyDomFilters();
    });
    footer.appendChild(clear);
    panel.appendChild(footer);

    return panel;
  }

  function syncPanel() {
    const set = (id, v) => {
      const e = document.getElementById(id);
      if (e) e.value = v;
    };
    set(F.from, settings.from);
    set(F.to, settings.to);
    set(F.minDuration, settings.minDuration);
    set(F.maxDuration, settings.maxDuration);
    set(F.minViews, settings.minViews);
    const cb = document.getElementById(F.hideShorts);
    if (cb) cb.checked = settings.hideShorts;
    updateBadges();
  }

  function togglePanel(force) {
    const wrapper = document.getElementById(WRAPPER_ID);
    if (!wrapper) return;
    const open = force != null ? force : !wrapper.classList.contains("ytyf-open");
    wrapper.classList.toggle("ytyf-open", open);
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

    const btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    btn.title = "Filter YouTube results";
    btn.innerHTML =
      '<span class="ytyf-fico">☰</span><span class="ytyf-btext">Filters</span>' +
      '<span id="' + COUNT_ID + '" class="ytyf-count" style="display:none"></span>';
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      togglePanel();
    });
    wrapper.appendChild(btn);

    const panel = buildPanel();
    panel.addEventListener("click", (e) => e.stopPropagation());
    wrapper.appendChild(panel);

    searchbox.parentElement.insertBefore(wrapper, searchbox.nextSibling);
    syncPanel();
  }

  // Close the panel when clicking anywhere outside it.
  function handleOutsideClick(e) {
    const wrapper = document.getElementById(WRAPPER_ID);
    if (wrapper && !wrapper.contains(e.target)) togglePanel(false);
  }

  // ---- boot & SPA handling -------------------------------------------------

  function init() {
    YTYF.load((s) => {
      settings = s;
      injectUI();
      syncPanel();
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
    syncPanel();
    applyDomFilters();
  });

  document.addEventListener("keydown", handleKeydown, true);
  document.addEventListener("click", handleSearchClick, true);
  document.addEventListener("click", handleOutsideClick);
  document.addEventListener("yt-navigate-finish", init);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
