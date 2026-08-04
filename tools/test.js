// Integration test for the content script, run under jsdom against a mock
// YouTube DOM. Verifies UI injection, panel open/close, and the DOM filters.
//
//   npm install    # installs jsdom (devDependency)
//   npm test
//
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const REPO = path.join(__dirname, "..");
const common = fs.readFileSync(path.join(REPO, "common.js"), "utf8");
const content = fs.readFileSync(path.join(REPO, "content.js"), "utf8");

const html = `<!doctype html><html><body>
  <ytd-searchbox><input id="search"></ytd-searchbox>

  <ytd-reel-shelf-renderer id="shortsShelf"><a href="/shorts/aaa">short</a></ytd-reel-shelf-renderer>

  <ytd-reel-shelf-renderer id="reelNoLink"><span>Shorts</span></ytd-reel-shelf-renderer>

  <ytd-video-renderer id="vidLowShort"><a href="/shorts/bbb">short vid</a></ytd-video-renderer>

  <ytd-video-renderer id="vidLow">
    <span class="badge-shape-wiz__text">2:00</span>
    <div id="metadata-line"><span class="inline-metadata-item">500 views</span></div>
  </ytd-video-renderer>

  <ytd-video-renderer id="vidHigh">
    <span class="badge-shape-wiz__text">15:00</span>
    <div id="metadata-line"><span class="inline-metadata-item">1.2M views</span></div>
  </ytd-video-renderer>

  <ytd-video-renderer id="vidWatched">
    <span class="badge-shape-wiz__text">5:00</span>
    <div id="progress"></div>
    <div id="metadata-line"><span class="inline-metadata-item">50K views</span></div>
  </ytd-video-renderer>

  <ytd-video-renderer id="vidReaction">
    <a id="video-title">Epic REACTION to the finale</a>
    <div id="metadata-line"><span class="inline-metadata-item">50K views</span></div>
  </ytd-video-renderer>

  <!-- Reproduces the real bug: YouTube returned a 6-day-old video for a
       "before:2020-01-01" query. -->
  <ytd-video-renderer id="vidRecent">
    <a id="video-title">Elon Musk Rolls Out X Money</a>
    <div id="metadata-line"><span class="inline-metadata-item">241k views</span><span class="inline-metadata-item">6 days ago</span></div>
  </ytd-video-renderer>

  <ytd-video-renderer id="vidOld">
    <a id="video-title">Elon Musk: Work twice as hard</a>
    <div id="metadata-line"><span class="inline-metadata-item">3.4m views</span><span class="inline-metadata-item">12 years ago</span></div>
  </ytd-video-renderer>

  <ytd-video-renderer id="vidBadChannel">
    <a id="video-title">Some ordinary video</a>
    <ytd-channel-name><a>ClickbaitCentral</a></ytd-channel-name>
    <div id="metadata-line"><span class="inline-metadata-item">50K views</span></div>
  </ytd-video-renderer>
</body></html>`;

const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true });
const { window } = dom;

const store = {};
let syncWrites = 0;
window.chrome = {
  runtime: {},
  storage: {
    sync: {
      get: (keys, cb) => cb(store),
      set: (obj, cb) => { syncWrites++; Object.assign(store, obj); if (cb) cb(); },
    },
    local: { set: (obj, cb) => { Object.assign(store, obj); if (cb) cb(); } },
    onChanged: { addListener: () => {} },
  },
};
window.requestAnimationFrame = (cb) => setTimeout(cb, 0);

window.eval(common);
window.eval(content);
// jsdom leaves readyState "loading" under manual eval; the real extension runs
// at document_idle. Fire the event the content script waits on.
window.document.dispatchEvent(new window.Event("DOMContentLoaded"));

const doc = window.document;
const $ = (id) => doc.getElementById(id);
const hidden = (id) => $(id).style.display === "none";
const fire = (el, type, EventCtor) =>
  el.dispatchEvent(new window[EventCtor](type, { bubbles: true }));

let pass = 0, fail = 0;
const check = (label, cond) => {
  console.log((cond ? "PASS" : "FAIL") + "  " + label);
  cond ? pass++ : fail++;
};

check("button injected", !!$("ytyf-btn"));
check("panel injected", !!$("ytyf-panel"));
check("panel hidden initially", !$("ytyf-panel").classList.contains("ytyf-open"));

fire($("ytyf-btn"), "click", "MouseEvent");
check("panel opens on button click", $("ytyf-panel").classList.contains("ytyf-open"));

fire(doc.body, "click", "MouseEvent");
check("panel closes on outside click", !$("ytyf-panel").classList.contains("ytyf-open"));

// Apply button exists and closes the panel (no year filter → no navigation)
fire($("ytyf-btn"), "click", "MouseEvent");
check("apply button present", !!doc.querySelector(".ytyf-apply"));
doc.querySelector(".ytyf-apply").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
check("apply closes the panel", !$("ytyf-panel").classList.contains("ytyf-open"));

const cb = $("ytyf-hideshorts");
cb.checked = true;
fire(cb, "change", "Event");
check("hideShorts hides shorts shelf", hidden("shortsShelf"));
check("hideShorts hides linkless reel shelf", hidden("reelNoLink"));
check("hideShorts hides shorts video", hidden("vidLowShort"));
check("hideShorts keeps normal videos", !hidden("vidLow") && !hidden("vidHigh"));

cb.checked = false;
fire(cb, "change", "Event");
const mv = $("ytyf-minviews");
mv.value = "1000";
fire(mv, "input", "Event");
check("minViews hides low-view video", hidden("vidLow"));
check("minViews keeps high-view video", !hidden("vidHigh"));

mv.value = "";
fire(mv, "input", "Event");
const md = $("ytyf-mindur");
md.value = "10";
fire(md, "input", "Event");
check("minDuration hides short video", hidden("vidLow"));
check("minDuration keeps long video", !hidden("vidHigh"));

mv.value = "";
fire(mv, "input", "Event");
md.value = "";
fire(md, "input", "Event");

// Hide watched
const hw = $("ytyf-hidewatched");
hw.checked = true;
fire(hw, "change", "Event");
check("hideWatched hides watched video", hidden("vidWatched"));
check("hideWatched keeps unwatched video", !hidden("vidHigh"));
hw.checked = false;
fire(hw, "change", "Event");

// Keyword blocklist
const kwIn = $("ytyf-keywords");
kwIn.value = "reaction";
fire(kwIn, "input", "Event");
check("keyword block hides matching title", hidden("vidReaction"));
check("keyword block keeps others", !hidden("vidHigh"));
kwIn.value = "";
fire(kwIn, "input", "Event");

// Channel blocklist
const chIn = $("ytyf-channels");
chIn.value = "clickbaitcentral";
fire(chIn, "input", "Event");
check("channel block hides matching channel", hidden("vidBadChannel"));
check("channel block keeps others", !hidden("vidHigh"));
chIn.value = "";
fire(chIn, "input", "Event");

doc.querySelector(".ytyf-clear").dispatchEvent(
  new window.MouseEvent("click", { bubbles: true })
);
check("clear all restores vidLow", !hidden("vidLow"));
check("clear all restores shortsShelf", !hidden("shortsShelf"));
check("clear all restores vidReaction", !hidden("vidReaction"));

// ---- locale-aware view parsing -------------------------------------------
const Y = window.YTYF;
[
  ["1.2M views", null, 1200000],
  ["1,234 views", null, 1234],
  ["No views", null, 0],
  ["1,2 Mio. Aufrufe", "de", 1200000],
  ["12.345 Aufrufe", "de", 12345],
  ["1,2 M de vues", "fr", 1200000],
  ["12万 回視聴", "ja", 120000],
  ["1.2 लाख व्यू", "hi", 120000],
  ["12 B görüntüleme", "tr", 12000],
  ["1,2 млн просмотров", "ru", 1200000],
  ["12 mil visualizações", "pt", 12000],
].forEach(([txt, lang, want]) =>
  check("parseViews " + (lang || "en") + " " + JSON.stringify(txt), Y.parseViews(txt, lang) === want)
);

// ---- relative upload-date parsing ----------------------------------------
const NOW = new Date(2026, 7, 5).getTime(); // 5 Aug 2026
const range = (txt) => Y.parseUploadYearRange(txt, NOW);
check("6 days ago -> 2026", range("6 days ago").minYear === 2026 && range("6 days ago").maxYear === 2026);
check("12 years ago -> 2013..2014", range("12 years ago").minYear === 2013 && range("12 years ago").maxYear === 2014);
check("8 years ago -> 2017..2018", range("8 years ago").minYear === 2017 && range("8 years ago").maxYear === 2018);
check("3 months ago -> 2026", range("3 months ago").maxYear === 2026);
check("vor 3 Jahren (de)", range("vor 3 Jahren").minYear === 2022);
check("hace 2 meses (es)", range("hace 2 meses").maxYear === 2026);
check("view counts are not dates", range("3.4m views") === null);
check("channel-ish text is not a date", range("Vator") === null);

// Only hides what is CERTAINLY outside the range
const upTo2019 = { from: "", to: "2019" };
check("would hide a 6-day-old video when up to 2019", Y.outsideYearRange(range("6 days ago"), upTo2019));
check("would keep a 12-year-old video when up to 2019", !Y.outsideYearRange(range("12 years ago"), upTo2019));
check("keeps ambiguous cards (no date parsed)", !Y.outsideYearRange(null, upTo2019));

// ---- end-to-end: the exact failure from the screenshot -------------------
const toSel = $("ytyf-to");
toSel.value = "2019";
fire(toSel, "change", "Event");
check("E2E: recent video hidden despite YouTube returning it", hidden("vidRecent"));
check("E2E: 12-year-old video still shown", !hidden("vidOld"));
toSel.value = "";
fire(toSel, "change", "Event");
check("E2E: clearing the year restores the recent video", !hidden("vidRecent"));

// ---- sort (YouTube's native `sp` parameter) ------------------------------
const spOf = (opts) =>
  new window.URL(Y.searchUrl("ai", Y.normalize(opts))).searchParams.get("sp");
const qOf = (opts) =>
  new window.URL(Y.searchUrl("ai", Y.normalize(opts))).searchParams.get("search_query");

check("relevance adds no sp param", spOf({}) === null);
// Regression: the value must decode to "CAM=", not the literal "CAM%3D".
// Storing it pre-encoded produced sp=CAM%253D, which YouTube ignores.
check("sort by upload date decodes to CAI=", spOf({ sort: "date" }) === "CAI=");
check("sort by views decodes to CAM=", spOf({ sort: "views" }) === "CAM=");
check("sort by rating decodes to CAE=", spOf({ sort: "rating" }) === "CAE=");
check("sp is not double-encoded", !Y.searchUrl("ai", Y.normalize({ sort: "views" })).includes("%25"));
check(
  "sort combines with the year range",
  spOf({ sort: "views", to: "2019" }) === "CAM=" &&
    qOf({ sort: "views", to: "2019" }) === "ai before:2020-01-01"
);
check("an unknown sort value is ignored", Y.normalize({ sort: "bogus" }).sort === "");
check("sort alone triggers a search re-run", Y.needsSearchRerun(Y.normalize({ sort: "date" })));
check("no sort and no year -> no re-run", !Y.needsSearchRerun(Y.normalize({})));
check("sort alone marks the filter active", Y.isActive(Y.normalize({ sort: "date" })));

const sortSel = $("ytyf-sort");
check("sort dropdown is in the panel", !!sortSel);
check("sort dropdown offers 4 options", sortSel && sortSel.options.length === 4);

// ---- debounced writes (storage.sync allows only 120/min) -----------------
syncWrites = 0;
const kw2 = $("ytyf-keywords");
"abcdefghij".split("").forEach((c) => {
  kw2.value += c;
  fire(kw2, "input", "Event");
});
check("10 keystrokes do not write immediately", syncWrites === 0);
Y.flush();
check("flush coalesces them into one write", syncWrites === 1);
kw2.value = "";
fire(kw2, "input", "Event");
Y.flush();

// ---- incremental filtering marks cards so they aren't re-judged ----------
const hs2 = $("ytyf-hideshorts");
hs2.checked = true;
fire(hs2, "change", "Event");
const stamped = doc.querySelectorAll("[data-ytf-epoch]").length;
check("cards are stamped with an epoch", stamped > 0);
hs2.checked = false;
fire(hs2, "change", "Event");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
