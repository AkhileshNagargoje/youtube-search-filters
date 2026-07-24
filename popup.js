const YTYF = window.YTYF;

const el = (id) => document.getElementById(id);
const fromSel = el("from");
const toSel = el("to");
const hideShorts = el("hideShorts");
const minDuration = el("minDuration");
const maxDuration = el("maxDuration");
const minViews = el("minViews");
const summary = el("summary");
const clearBtn = el("clear");

let settings = YTYF.defaults();

function populateYears(sel) {
  const any = document.createElement("option");
  any.value = "";
  any.textContent = "Any";
  sel.appendChild(any);
  for (let y = YTYF.currentYear(); y >= YTYF.FIRST_YEAR; y--) {
    const opt = document.createElement("option");
    opt.value = String(y);
    opt.textContent = String(y);
    sel.appendChild(opt);
  }
}

function fmtViews(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(n % 1e3 ? 1 : 0) + "K";
  return String(n);
}

function describe(s) {
  const bits = [];
  bits.push(YTYF.describeYear(s));
  if (s.hideShorts) bits.push("no Shorts");
  const min = parseInt(s.minDuration, 10);
  const max = parseInt(s.maxDuration, 10);
  if (!isNaN(min) && !isNaN(max)) bits.push(`${min}–${max} min`);
  else if (!isNaN(min)) bits.push(`≥ ${min} min`);
  else if (!isNaN(max)) bits.push(`≤ ${max} min`);
  const mv = parseInt(s.minViews, 10);
  if (!isNaN(mv)) bits.push(`≥ ${fmtViews(mv)} views`);
  return bits;
}

function render() {
  fromSel.value = settings.from;
  toSel.value = settings.to;
  hideShorts.checked = settings.hideShorts;
  minDuration.value = settings.minDuration;
  maxDuration.value = settings.maxDuration;
  minViews.value = settings.minViews;

  const bits = describe(settings);
  summary.innerHTML =
    YTYF.isActive(settings) && bits.length
      ? "Active: " + bits.map((b) => "<b>" + b + "</b>").join(" · ")
      : "No filters active.";
}

function commit() {
  settings = {
    from: fromSel.value,
    to: toSel.value,
    hideShorts: hideShorts.checked,
    minDuration: minDuration.value,
    maxDuration: maxDuration.value,
    minViews: minViews.value,
  };
  YTYF.save(settings);
  render();
}

populateYears(fromSel);
populateYears(toSel);

[fromSel, toSel, hideShorts].forEach((n) => n.addEventListener("change", commit));
[minDuration, maxDuration, minViews].forEach((n) =>
  n.addEventListener("input", commit)
);

clearBtn.addEventListener("click", () => {
  settings = YTYF.defaults();
  YTYF.save(settings);
  render();
});

YTYF.load((s) => {
  settings = s;
  render();
});
