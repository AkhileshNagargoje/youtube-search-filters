// YouTube Year Filter — content script.
// Injects "From / To" year pills next to the search bar and rewrites the search
// query using YouTube's built-in before:/after: operators.

(function () {
  const YTYF = window.YTYF;
  const WRAPPER_ID = "ytyf-wrapper";
  const FROM_ID = "ytyf-from";
  const TO_ID = "ytyf-to";

  let filter = YTYF.emptyFilter();

  // ---- query submission ----------------------------------------------------

  function getSearchInput() {
    return (
      document.querySelector("input#search") ||
      document.querySelector("ytd-searchbox input") ||
      document.querySelector('input[name="search_query"]')
    );
  }

  function runSearch(rawQuery) {
    const finalQuery = YTYF.buildQuery(rawQuery, filter);
    if (!finalQuery) return;
    window.location.href =
      "https://www.youtube.com/results?search_query=" +
      encodeURIComponent(finalQuery);
  }

  function handleKeydown(e) {
    if (e.key !== "Enter" || !YTYF.isActive(filter)) return;
    const input = getSearchInput();
    if (!input || e.target !== input) return;
    const raw = input.value.trim();
    if (!raw) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    runSearch(raw);
  }

  function handleClick(e) {
    if (!YTYF.isActive(filter)) return;
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

  // ---- UI -------------------------------------------------------------------

  function makeSelect(id, placeholder, isFrom) {
    const sel = document.createElement("select");
    sel.id = id;
    sel.className = "ytyf-select";
    sel.setAttribute("aria-label", placeholder);

    const anyOpt = document.createElement("option");
    anyOpt.value = "";
    anyOpt.textContent = placeholder;
    sel.appendChild(anyOpt);

    for (let y = YTYF.currentYear(); y >= YTYF.FIRST_YEAR; y--) {
      const opt = document.createElement("option");
      opt.value = String(y);
      opt.textContent = String(y);
      sel.appendChild(opt);
    }

    sel.addEventListener("change", () => {
      filter[isFrom ? "from" : "to"] = sel.value;
      YTYF.saveFilter(filter);
      updateActiveState();
    });
    return sel;
  }

  function updateActiveState() {
    const wrapper = document.getElementById(WRAPPER_ID);
    if (wrapper) wrapper.classList.toggle("ytyf-active", YTYF.isActive(filter));
  }

  function syncSelects() {
    const from = document.getElementById(FROM_ID);
    const to = document.getElementById(TO_ID);
    if (from) from.value = filter.from;
    if (to) to.value = filter.to;
    updateActiveState();
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
    wrapper.title = "Filter YouTube results by upload year";

    const icon = document.createElement("span");
    icon.className = "ytyf-icon";
    icon.textContent = "📅";
    wrapper.appendChild(icon);

    wrapper.appendChild(makeSelect(FROM_ID, "From", true));

    const dash = document.createElement("span");
    dash.className = "ytyf-dash";
    dash.textContent = "–";
    wrapper.appendChild(dash);

    wrapper.appendChild(makeSelect(TO_ID, "To", false));

    searchbox.parentElement.insertBefore(wrapper, searchbox.nextSibling);
    syncSelects();
  }

  // ---- boot & SPA handling -------------------------------------------------

  function init() {
    YTYF.loadFilter((f) => {
      filter = f;
      injectUI();
      syncSelects();
    });
  }

  // Re-inject when YouTube re-renders its masthead.
  const observer = new MutationObserver(() => {
    if (!document.getElementById(WRAPPER_ID)) injectUI();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Keep pills in sync when changed from the popup.
  YTYF.onFilterChanged((f) => {
    filter = f;
    syncSelects();
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
