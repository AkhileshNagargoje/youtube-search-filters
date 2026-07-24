// YouTube Filter — content script.
// A floating "Filters" button (fixed to the page corner) opens a panel with:
// - Year range: rewrites the search query with before:/after: operators.
// - Hide Shorts / duration / min-views: hides non-matching results on the page.
// The button/panel are attached to <body> with position:fixed, so YouTube's
// layout can never clip, hide, or dismiss them.

(function () {
  const YTYF = window.YTYF;
  const WRAPPER_ID = "ytyf-wrapper";
  const PANEL_ID = "ytyf-panel";
  const BTN_ID = "ytyf-btn";
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

  // ---- DOM filters ---------------------------------------------------------

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
    const raf =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame
        : (cb) => setTimeout(cb, 16);
    raf(() => {
      scheduled = false;
      applyDomFilters();
    });
  }

  // ---- floating button + panel ---------------------------------------------

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

  function setField(key, value) {
    settings[key] = value;
    settings = YTYF.normalize(settings);
    YTYF.save(settings);
    applyDomFilters();
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

  function buildPanel() {
    const panel = document.createElement("div");
    panel.className = "ytyf-panel";

    const title = document.createElement("div");
    title.className = "ytyf-title";
    title.textContent = "Filter YouTube results";
    panel.appendChild(title);

    const dash1 = document.createElement("span");
    dash1.className = "ytyf-dash";
    dash1.textContent = "–";
    panel.appendChild(
      row("Upload year", yearSelect(F.from, "from"), dash1, yearSelect(F.to, "to"))
    );

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

    const dash2 = document.createElement("span");
    dash2.className = "ytyf-dash";
    dash2.textContent = "–";
    panel.appendChild(
      row(
        "Duration (min)",
        numInput(F.minDuration, "minDuration", "min"),
        dash2,
        numInput(F.maxDuration, "maxDuration", "max")
      )
    );

    panel.appendChild(
      row("Min views", numInput(F.minViews, "minViews", "e.g. 10000"))
    );

    const footer = document.createElement("div");
    footer.className = "ytyf-footer";

    const clear = document.createElement("button");
    clear.className = "ytyf-clear";
    clear.type = "button";
    clear.textContent = "Clear all";
    clear.addEventListener("click", () => {
      settings = YTYF.defaults();
      YTYF.save(settings);
      syncPanel();
      applyDomFilters();
    });

    const apply = document.createElement("button");
    apply.className = "ytyf-apply";
    apply.type = "button";
    apply.textContent = "Apply";
    apply.addEventListener("click", () => {
      applyDomFilters();
      // If a year range is set and there's a query, re-run the search now so the
      // year filter takes effect immediately instead of on the next Enter.
      const input = getSearchInput();
      const raw = input ? input.value.trim() : "";
      if (YTYF.hasYearFilter(settings) && raw) {
        runSearch(raw);
        return;
      }
      togglePanel(false);
    });

    footer.appendChild(clear);
    footer.appendChild(apply);
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

  // Position the (body-attached, fixed) panel just under the Filters button, so
  // it sits next to the search bar but is never clipped by YouTube's layout.
  function positionPanel() {
    const btn = document.getElementById(BTN_ID);
    const panel = document.getElementById(PANEL_ID);
    if (!btn || !panel) return;
    const r = btn.getBoundingClientRect();
    const width = panel.offsetWidth || 300;
    let left = r.right - width;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    panel.style.top = r.bottom + 8 + "px";
    panel.style.left = left + "px";
  }

  function togglePanel(force) {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    const open =
      force != null ? force : !panel.classList.contains("ytyf-open");
    panel.classList.toggle("ytyf-open", open);
    if (open) positionPanel();
  }

  function injectUI() {
    if (document.getElementById(BTN_ID) || !document.body) return;
    const input = getSearchInput();
    if (!input) return;

    const searchbox =
      document.querySelector("ytd-searchbox") ||
      input.closest("form") ||
      input.parentElement;
    if (!searchbox || !searchbox.parentElement) return;

    // Clear any orphaned panel from a previous SPA navigation.
    const orphan = document.getElementById(PANEL_ID);
    if (orphan) orphan.remove();

    const wrapper = document.createElement("span");
    wrapper.id = WRAPPER_ID;

    const btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    btn.title = "Filter YouTube results";
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true">' +
      '<path d="M3 5h18l-7 8v5l-4 2v-7z"/></svg>' +
      '<span class="ytyf-btext">Filters</span>' +
      '<span id="' + COUNT_ID + '" class="ytyf-count" style="display:none"></span>';
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      togglePanel();
    });
    wrapper.appendChild(btn);
    searchbox.parentElement.insertBefore(wrapper, searchbox.nextSibling);

    const panel = buildPanel();
    panel.id = PANEL_ID;
    panel.addEventListener("click", (e) => e.stopPropagation());
    document.body.appendChild(panel);

    syncPanel();
  }

  function handleOutsideClick(e) {
    const panel = document.getElementById(PANEL_ID);
    const btn = document.getElementById(BTN_ID);
    if (
      panel &&
      panel.classList.contains("ytyf-open") &&
      !panel.contains(e.target) &&
      (!btn || !btn.contains(e.target))
    ) {
      togglePanel(false);
    }
  }

  // Reposition while open if the viewport changes.
  window.addEventListener("resize", () => {
    const panel = document.getElementById(PANEL_ID);
    if (panel && panel.classList.contains("ytyf-open")) positionPanel();
  });

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
    if (!document.getElementById(BTN_ID)) injectUI();
    scheduleApply();
  });
  if (document.documentElement) {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

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
