(function () {
  const YTYF = window.YTYF;
  const el = (id) => document.getElementById(id);

  // Fail gracefully if the shared module didn't load.
  if (!YTYF) {
    document.body.innerHTML =
      '<p style="font:13px sans-serif;padding:12px">Could not load extension logic. Try reloading the extension.</p>';
    return;
  }

  const fromEl = el("from");
  const toEl = el("to");
  const hideShorts = el("hideShorts");
  const hideWatched = el("hideWatched");
  const minDuration = el("minDuration");
  const maxDuration = el("maxDuration");
  const minViews = el("minViews");
  const blockKeywords = el("blockKeywords");
  const blockChannels = el("blockChannels");
  const summary = el("summary");
  const clearBtn = el("clear");

  const numInputs = [fromEl, toEl, minDuration, maxDuration, minViews];
  const textInputs = [blockKeywords, blockChannels];

  // Set max years dynamically.
  fromEl.max = String(YTYF.currentYear());
  toEl.max = String(YTYF.currentYear());

  let settings = YTYF.defaults();

  function fmtViews(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(n % 1e3 ? 1 : 0) + "K";
    return String(n);
  }

  function describe(s) {
    const bits = [YTYF.describeYear(s)];
    if (s.hideShorts) bits.push("no Shorts");
    const min = parseInt(s.minDuration, 10);
    const max = parseInt(s.maxDuration, 10);
    if (!isNaN(min) && !isNaN(max)) bits.push(`${min}–${max} min`);
    else if (!isNaN(min)) bits.push(`≥ ${min} min`);
    else if (!isNaN(max)) bits.push(`≤ ${max} min`);
    const mv = parseInt(s.minViews, 10);
    if (!isNaN(mv)) bits.push(`≥ ${fmtViews(mv)} views`);
    if (s.hideWatched) bits.push("no watched");
    const kw = YTYF.parseList(s.blockKeywords);
    if (kw.length) bits.push(`${kw.length} keyword${kw.length > 1 ? "s" : ""} blocked`);
    const ch = YTYF.parseList(s.blockChannels);
    if (ch.length) bits.push(`${ch.length} channel${ch.length > 1 ? "s" : ""} blocked`);
    return bits;
  }

  // Only the summary updates on every keystroke — never rewrite the inputs
  // mid-type (that moves the caret / can drop focus).
  function renderSummary() {
    const bits = describe(settings);
    summary.innerHTML =
      YTYF.isActive(settings) && bits.length
        ? "Active: " + bits.map((b) => "<b>" + b + "</b>").join(" · ")
        : "No filters active.";
  }

  // Full push of values into the inputs — only on load and Clear.
  function renderInputs() {
    fromEl.value = settings.from;
    toEl.value = settings.to;
    hideShorts.checked = settings.hideShorts;
    hideWatched.checked = settings.hideWatched;
    minDuration.value = settings.minDuration;
    maxDuration.value = settings.maxDuration;
    minViews.value = settings.minViews;
    blockKeywords.value = settings.blockKeywords;
    blockChannels.value = settings.blockChannels;
    renderSummary();
  }

  function readSettings() {
    return {
      from: fromEl.value.trim(),
      to: toEl.value.trim(),
      hideShorts: hideShorts.checked,
      hideWatched: hideWatched.checked,
      minDuration: minDuration.value.trim(),
      maxDuration: maxDuration.value.trim(),
      minViews: minViews.value.trim(),
      blockKeywords: blockKeywords.value,
      blockChannels: blockChannels.value,
    };
  }

  function commit() {
    settings = YTYF.normalize(readSettings());
    YTYF.save(settings);
    renderSummary();
  }

  // Clamp year fields into a sensible range when the user finishes editing.
  function clampYear(input) {
    const v = parseInt(input.value, 10);
    if (isNaN(v)) {
      input.value = "";
      return;
    }
    const clamped = Math.min(Math.max(v, YTYF.FIRST_YEAR), YTYF.currentYear());
    input.value = String(clamped);
  }

  numInputs.forEach((n) => n.addEventListener("input", commit));
  textInputs.forEach((n) => n.addEventListener("input", commit));
  hideShorts.addEventListener("change", commit);
  hideWatched.addEventListener("change", commit);

  [fromEl, toEl].forEach((n) =>
    n.addEventListener("change", () => {
      clampYear(n);
      commit();
    })
  );

  clearBtn.addEventListener("click", () => {
    settings = YTYF.defaults();
    YTYF.save(settings);
    renderInputs();
  });

  YTYF.load((s) => {
    settings = s;
    renderInputs();
  });
})();
