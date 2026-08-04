// YouTube Filter — content script.
// A "Filters" button next to the search bar opens a panel with:
// - Year range (rewrites the search query with before:/after:)
// - Hide Shorts / duration / min-views / hide-watched / keyword & channel blocks
//   (these hide non-matching results live on the page)
// The panel is a fixed, <body>-attached element positioned under the button, so
// YouTube's layout can never clip or dismiss it.

(function () {
  const YTYF = window.YTYF;
  const t = YTYF.t;
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
    hideWatched: "ytyf-hidewatched",
    blockKeywords: "ytyf-keywords",
    blockChannels: "ytyf-channels",
  };

  const RENDERER_SEL = [
    "ytd-video-renderer",
    "ytd-grid-video-renderer",
    "ytd-rich-item-renderer",
    "ytd-compact-video-renderer",
  ].join(",");

  const DURATION_SEL = [
    "ytd-thumbnail-overlay-time-status-renderer #text",
    "ytd-thumbnail-overlay-time-status-renderer span",
    ".badge-shape-wiz__text",
    ".yt-badge-shape__text",
    "#time-status #text",
    "#time-status span",
  ].join(",");

  const WATCHED_SEL = [
    "#progress",
    "ytd-thumbnail-overlay-resume-playback-renderer",
    ".ytd-thumbnail-overlay-resume-playback-renderer",
    ".ytThumbnailOverlayProgressBarHost",
  ].join(",");

  const META_SEL =
    "#metadata-line span, .inline-metadata-item, " +
    "#metadata-line .inline-metadata-item, " +
    ".yt-content-metadata-view-model-wiz__metadata-text";

  // "views" in the languages YouTube ships. Used to pick the right metadata
  // item; if none matches we fall back to position (views come first).
  const VIEW_WORDS =
    /(view|aufruf|vues|visualiza|visning|näyttö|megtekint|zobrazen|wyświetl|görüntülem|izlenme|просмотр|перегляд|視聴|观看|觀看|조회|व्यू|बार देखा|مشاهدة|بازدید|lượt xem|ครั้ง|dilihat|weergaven|visualizzazioni)/i;

  let settings = YTYF.defaults();
  // Bumped whenever settings change, so already-evaluated cards are re-checked.
  let epoch = 0;

  function pageLang() {
    return (
      (document.documentElement && document.documentElement.lang) ||
      navigator.language ||
      "en"
    );
  }

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
  function textOf(el, sel) {
    const n = el.querySelector(sel);
    return n ? (n.textContent || "").trim() : "";
  }
  function isShort(el) {
    return (
      !!el.querySelector('a[href*="/shorts/"]') ||
      el.tagName.toLowerCase().includes("reel")
    );
  }
  function isWatched(el) {
    return !!el.querySelector(WATCHED_SEL);
  }
  function getDurationSeconds(el) {
    const nodes = el.querySelectorAll(DURATION_SEL);
    for (const n of nodes) {
      const d = YTYF.parseDuration(n.textContent);
      if (d != null) return d;
    }
    return null;
  }
  function getViews(el) {
    const items = el.querySelectorAll(META_SEL);
    const lang = pageLang();
    // Preferred: the item that actually says "views" in this locale.
    for (const it of items) {
      if (VIEW_WORDS.test(it.textContent)) {
        return YTYF.parseViews(it.textContent, lang);
      }
    }
    // Fallback for locales/layouts we don't recognise: view count is rendered
    // before the upload date, so take the first item containing a digit.
    for (const it of items) {
      if (/\d/.test(it.textContent)) {
        return YTYF.parseViews(it.textContent, lang);
      }
    }
    return null;
  }
  function getTitle(el) {
    return (
      textOf(el, "#video-title") ||
      textOf(el, "a#video-title-link") ||
      textOf(el, ".yt-lockup-metadata-view-model-wiz__title") ||
      textOf(el, "h3 a")
    );
  }
  function getChannel(el) {
    return (
      textOf(el, "ytd-channel-name #text") ||
      textOf(el, "ytd-channel-name a") ||
      textOf(el, ".ytd-channel-name") ||
      textOf(el, ".yt-content-metadata-view-model-wiz__metadata-text")
    );
  }

  // true = keep visible, false = hide. Never throws — on error, keep the video.
  function matches(el, s) {
    try {
      if (s.hideShorts && isShort(el)) return false;
      if (s.hideWatched && isWatched(el)) return false;

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

      const kw = YTYF.parseList(s.blockKeywords);
      if (kw.length) {
        const title = getTitle(el).toLowerCase();
        if (title && kw.some((k) => title.includes(k))) return false;
      }

      const ch = YTYF.parseList(s.blockChannels);
      if (ch.length) {
        const chan = getChannel(el).toLowerCase();
        if (chan && ch.some((c) => chan.includes(c))) return false;
      }
      return true;
    } catch (e) {
      return true;
    }
  }

  // Robustly remove Shorts: whole shelves/sections, plus any individual Shorts
  // card found by its /shorts/ link (covers search, home, and sidebar layouts).
  function hideShortsUI() {
    document
      .querySelectorAll(
        "ytd-reel-shelf-renderer, ytd-rich-shelf-renderer[is-shorts], grid-shelf-view-model, ytd-rich-section-renderer"
      )
      .forEach((sh) => {
        const tag = sh.tagName.toLowerCase();
        if (tag.includes("reel") || sh.querySelector('a[href*="/shorts/"]')) hide(sh);
      });
    document.querySelectorAll('a[href*="/shorts/"]').forEach((a) => {
      const c = a.closest(
        "ytd-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer," +
          "ytd-compact-video-renderer, ytm-shorts-lockup-view-model, ytd-reel-item-renderer"
      );
      if (c) hide(c);
    });
  }

  // full=true re-evaluates every card (settings changed or page navigated).
  // full=false only evaluates cards we haven't seen yet — this is what runs on
  // every DOM mutation, so it must stay cheap on long infinite-scroll pages.
  function applyDomFilters(full) {
    if (full !== false) {
      epoch++;
      document.querySelectorAll("[data-ytf-hidden]").forEach(show);
    }

    if (YTYF.hasDomFilter(settings)) {
      const stamp = String(epoch);
      if (settings.hideShorts) hideShortsUI();
      document.querySelectorAll(RENDERER_SEL).forEach((el) => {
        if (el.dataset.ytfEpoch === stamp) return; // already judged this pass
        el.dataset.ytfEpoch = stamp;
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
      applyDomFilters(false); // incremental: only newly added cards
    });
  }

  // ---- UI: button + panel --------------------------------------------------

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
    sel.setAttribute("aria-label", key === "from" ? t("fromYear", "From year") : t("toYear", "Up to year"));
    const any = document.createElement("option");
    any.value = "";
    any.textContent = t("any", "Any");
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
    inp.setAttribute("aria-label", placeholder);
    inp.addEventListener("input", () => setField(key, inp.value.trim()));
    return inp;
  }
  function textInput(id, key, placeholder) {
    const inp = document.createElement("input");
    inp.type = "text";
    inp.id = id;
    inp.className = "ytyf-input ytyf-input-wide";
    inp.placeholder = placeholder;
    inp.setAttribute("aria-label", placeholder);
    inp.addEventListener("input", () => setField(key, inp.value));
    return inp;
  }
  function toggle(id, key) {
    const sw = document.createElement("label");
    sw.className = "ytyf-switch";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = id;
    cb.addEventListener("change", () => setField(key, cb.checked));
    const sl = document.createElement("span");
    sl.className = "ytyf-slider";
    sw.appendChild(cb);
    sw.appendChild(sl);
    return sw;
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
  function rowStacked(labelText, control) {
    const r = document.createElement("div");
    r.className = "ytyf-row ytyf-row-stacked";
    const l = document.createElement("span");
    l.className = "ytyf-label";
    l.textContent = labelText;
    r.appendChild(l);
    r.appendChild(control);
    return r;
  }
  function dash() {
    const d = document.createElement("span");
    d.className = "ytyf-dash";
    d.textContent = "–";
    return d;
  }

  function buildPanel() {
    const panel = document.createElement("div");
    panel.className = "ytyf-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", t("panelTitle", "Filter YouTube results"));

    const title = document.createElement("div");
    title.className = "ytyf-title";
    title.textContent = t("panelTitle", "Filter YouTube results");
    panel.appendChild(title);

    // Year range
    panel.appendChild(
      row(
        t("uploadYear", "Upload year"),
        yearSelect(F.from, "from"),
        dash(),
        yearSelect(F.to, "to")
      )
    );

    // Toggles
    panel.appendChild(row(t("hideShorts", "Hide Shorts"), toggle(F.hideShorts, "hideShorts")));
    panel.appendChild(row(t("hideWatched", "Hide watched"), toggle(F.hideWatched, "hideWatched")));

    // Duration
    panel.appendChild(
      row(
        t("durationMin", "Duration (min)"),
        numInput(F.minDuration, "minDuration", t("min", "min")),
        dash(),
        numInput(F.maxDuration, "maxDuration", t("max", "max"))
      )
    );

    // Min views
    panel.appendChild(
      row(t("minViews", "Min views"), numInput(F.minViews, "minViews", "e.g. 10000"))
    );

    // Blocklists
    panel.appendChild(
      rowStacked(
        t("blockKeywords", "Hide titles containing"),
        textInput(F.blockKeywords, "blockKeywords", t("keywordsPlaceholder", "e.g. reaction, tier list"))
      )
    );
    panel.appendChild(
      rowStacked(
        t("blockChannels", "Hide channels"),
        textInput(F.blockChannels, "blockChannels", t("channelsPlaceholder", "e.g. channel name, another"))
      )
    );

    // Footer
    const footer = document.createElement("div");
    footer.className = "ytyf-footer";

    const clear = document.createElement("button");
    clear.className = "ytyf-clear";
    clear.type = "button";
    clear.textContent = t("clearAll", "Clear all");
    clear.addEventListener("click", () => {
      settings = YTYF.defaults();
      YTYF.save(settings);
      syncPanel();
      applyDomFilters();
    });

    const apply = document.createElement("button");
    apply.className = "ytyf-apply";
    apply.type = "button";
    apply.textContent = t("apply", "Apply");
    apply.addEventListener("click", () => {
      applyDomFilters();
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
    set(F.blockKeywords, settings.blockKeywords);
    set(F.blockChannels, settings.blockChannels);
    const hs = document.getElementById(F.hideShorts);
    if (hs) hs.checked = settings.hideShorts;
    const hw = document.getElementById(F.hideWatched);
    if (hw) hw.checked = settings.hideWatched;
    updateBadges();
  }

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
    const btn = document.getElementById(BTN_ID);
    if (!panel) return;
    const open =
      force != null ? force : !panel.classList.contains("ytyf-open");
    panel.classList.toggle("ytyf-open", open);
    if (btn) btn.setAttribute("aria-expanded", String(open));
    if (open) {
      positionPanel();
      const first = panel.querySelector("select, input, button");
      if (first) try { first.focus(); } catch (e) {}
    } else if (btn) {
      try { btn.focus(); } catch (e) {}
    }
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

    const orphan = document.getElementById(PANEL_ID);
    if (orphan) orphan.remove();

    const wrapper = document.createElement("span");
    wrapper.id = WRAPPER_ID;

    const btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    btn.title = t("panelTitle", "Filter YouTube results");
    btn.setAttribute("aria-haspopup", "dialog");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true">' +
      '<path d="M3 5h18l-7 8v5l-4 2v-7z"/></svg>' +
      '<span class="ytyf-btext">' + t("filters", "Filters") + "</span>" +
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

  function handleEsc(e) {
    if (e.key !== "Escape") return;
    const panel = document.getElementById(PANEL_ID);
    if (panel && panel.classList.contains("ytyf-open")) togglePanel(false);
  }

  window.addEventListener("resize", () => {
    const panel = document.getElementById(PANEL_ID);
    if (panel && panel.classList.contains("ytyf-open")) positionPanel();
  });

  // ---- boot & SPA handling -------------------------------------------------

  function init() {
    YTYF.load((s) => {
      settings = s;
      injectUI();
      observeRoot();
      syncPanel();
      applyDomFilters(true); // full pass: YouTube recycles cards across views
    });
  }

  // Observe the app root rather than the whole document: YouTube mutates
  // <head> and the player constantly, and none of that affects our filters.
  const observer = new MutationObserver(() => {
    if (!document.getElementById(BTN_ID)) injectUI();
    scheduleApply();
  });

  let observedRoot = null;
  function observeRoot() {
    const root =
      document.querySelector("ytd-app") ||
      document.body ||
      document.documentElement;
    if (!root || root === observedRoot) return;
    observer.disconnect();
    observedRoot = root;
    // childList only — we never observe attributes, so our own display/dataset
    // writes can't re-trigger this callback.
    observer.observe(root, { childList: true, subtree: true });
  }

  YTYF.onChanged((s) => {
    settings = s;
    syncPanel();
    applyDomFilters();
  });

  document.addEventListener("keydown", handleKeydown, true);
  document.addEventListener("keydown", handleEsc);
  document.addEventListener("click", handleSearchClick, true);
  document.addEventListener("click", handleOutsideClick);
  document.addEventListener("yt-navigate-finish", init);

  // Don't lose a debounced write if the user navigates away mid-edit.
  window.addEventListener("pagehide", () => YTYF.flush());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") YTYF.flush();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
