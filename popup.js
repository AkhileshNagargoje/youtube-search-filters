const YTYF = window.YTYF;

const fromSel = document.getElementById("from");
const toSel = document.getElementById("to");
const summary = document.getElementById("summary");
const clearBtn = document.getElementById("clear");

let filter = YTYF.emptyFilter();

function populate(sel, placeholder) {
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
}

function render() {
  fromSel.value = filter.from;
  toSel.value = filter.to;
  summary.innerHTML = "Showing <b>" + YTYF.describe(filter) + "</b>";
}

function commit() {
  filter.from = fromSel.value;
  filter.to = toSel.value;
  YTYF.saveFilter(filter);
  render();
}

populate(fromSel, "Any");
populate(toSel, "Any");

fromSel.addEventListener("change", commit);
toSel.addEventListener("change", commit);
clearBtn.addEventListener("click", () => {
  filter = YTYF.emptyFilter();
  YTYF.saveFilter(filter);
  render();
});

YTYF.loadFilter((f) => {
  filter = f;
  render();
});
