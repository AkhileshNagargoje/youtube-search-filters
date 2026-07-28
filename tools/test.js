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

  <ytd-video-renderer id="vidBadChannel">
    <a id="video-title">Some ordinary video</a>
    <ytd-channel-name><a>ClickbaitCentral</a></ytd-channel-name>
    <div id="metadata-line"><span class="inline-metadata-item">50K views</span></div>
  </ytd-video-renderer>
</body></html>`;

const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true });
const { window } = dom;

const store = {};
window.chrome = {
  storage: {
    sync: {
      get: (keys, cb) => cb(store),
      set: (obj, cb) => { Object.assign(store, obj); if (cb) cb(); },
    },
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

// Presets: save then confirm it persisted to storage
window.YTYF.savePreset("mypreset", { minViews: "5000" }, () => {});
check("preset saved to storage", !!(store.ytFilterPresets && store.ytFilterPresets.mypreset));

doc.querySelector(".ytyf-clear").dispatchEvent(
  new window.MouseEvent("click", { bubbles: true })
);
check("clear all restores vidLow", !hidden("vidLow"));
check("clear all restores shortsShelf", !hidden("shortsShelf"));
check("clear all restores vidReaction", !hidden("vidReaction"));

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
