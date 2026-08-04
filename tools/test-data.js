// Tests for render-time filtering (injected.js) — the MAIN-world script that
// strips entries out of YouTube's response data before anything is rendered.
// Uses realistic (trimmed) renderer shapes from /youtubei/v1/search.
//
//   npm run test:data
//
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const REPO = path.join(__dirname, "..");
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  runScripts: "outside-only",
  url: "https://www.youtube.com/results?search_query=test",
});
const { window } = dom;
window.chrome = {
  storage: {
    sync: { get: (k, cb) => cb({}), set: () => {} },
    local: { set: () => {} },
    onChanged: { addListener: () => {} },
  },
  runtime: {},
};

window.eval(fs.readFileSync(path.join(REPO, "common.js"), "utf8"));
window.eval(fs.readFileSync(path.join(REPO, "injected.js"), "utf8"));

const D = window.YTYF_DATA;
let pass = 0,
  fail = 0;
const check = (label, ok) => {
  console.log((ok ? "PASS" : "FAIL") + "  " + label);
  ok ? pass++ : fail++;
};

const setSettings = (s) =>
  window.localStorage.setItem("ytyfSettings", JSON.stringify(s));

// ---- renderer fixtures ----------------------------------------------------

const video = (o) => ({
  videoRenderer: {
    videoId: o.id || "abc",
    title: { runs: [{ text: o.title || "A video" }] },
    ownerText: {
      runs: [
        {
          text: o.channel || "Some Channel",
          navigationEndpoint: {
            browseEndpoint: { browseId: o.channelId || "UC_default" },
          },
        },
      ],
    },
    viewCountText: { simpleText: o.views || "1,234,567 views" },
    publishedTimeText: { simpleText: o.published || "3 years ago" },
    lengthText: { simpleText: o.length || "12:34" },
    thumbnailOverlays: o.watched
      ? [{ thumbnailOverlayResumePlaybackRenderer: { percentDurationWatched: 40 } }]
      : [],
    navigationEndpoint: o.short
      ? { reelWatchEndpoint: { videoId: o.id || "abc" } }
      : { commandMetadata: { webCommandMetadata: { url: "/watch?v=abc" } } },
  },
});

// A realistic nesting: contents -> sectionList -> itemSection -> contents[]
const response = (items) => ({
  contents: {
    twoColumnSearchResultsRenderer: {
      primaryContents: {
        sectionListRenderer: {
          contents: [{ itemSectionRenderer: { contents: items } }],
        },
      },
    },
  },
});

const itemsOf = (data) =>
  data.contents.twoColumnSearchResultsRenderer.primaryContents
    .sectionListRenderer.contents[0].itemSectionRenderer.contents;

// ---- field extraction -----------------------------------------------------

check("reads simpleText", D.textOf({ simpleText: "hello" }) === "hello");
check("reads runs", D.textOf({ runs: [{ text: "a" }, { text: "b" }] }) === "ab");
check("handles missing nodes", D.textOf(undefined) === "");

// ---- individual decisions -------------------------------------------------

const S = (o) => window.YTYF.normalize(o);

check(
  "exact viewCountText is used (1,234,567 -> below 2M threshold)",
  D.blocked(video({}).videoRenderer, S({ minViews: "2000000" }))
);
check(
  "video above the view threshold is kept",
  !D.blocked(video({}).videoRenderer, S({ minViews: "1000000" }))
);
check(
  "shorts are detected via reelWatchEndpoint",
  D.blocked(video({ short: true }).videoRenderer, S({ hideShorts: true }))
);
check(
  "non-shorts survive hideShorts",
  !D.blocked(video({}).videoRenderer, S({ hideShorts: true }))
);
check(
  "watched videos detected via resume overlay",
  D.blocked(video({ watched: true }).videoRenderer, S({ hideWatched: true }))
);
check(
  "duration below the minimum is blocked",
  D.blocked(video({ length: "2:00" }).videoRenderer, S({ minDuration: "10" }))
);
check(
  "duration above the minimum is kept",
  !D.blocked(video({ length: "22:00" }).videoRenderer, S({ minDuration: "10" }))
);
check(
  "keyword in the title is blocked",
  D.blocked(video({ title: "Epic REACTION video" }).videoRenderer, S({ blockKeywords: "reaction" }))
);
check(
  "channel name is blocked",
  D.blocked(video({ channel: "ClickbaitCentral" }).videoRenderer, S({ blockChannels: "clickbaitcentral" }))
);
check(
  "channel ID is blocked (names change, IDs don't)",
  D.blocked(
    video({ channel: "Renamed Channel", channelId: "UCabc123" }).videoRenderer,
    S({ blockChannels: "ucabc123" })
  )
);
check(
  "recent upload blocked by an 'up to' year",
  D.blocked(video({ published: "6 days ago" }).videoRenderer, S({ to: "2019" }))
);
check(
  "old upload kept by an 'up to' year",
  !D.blocked(video({ published: "12 years ago" }).videoRenderer, S({ to: "2019" }))
);
check(
  "a malformed renderer is never dropped",
  !D.blocked({}, S({ minViews: "1000", blockKeywords: "x" }))
);

// ---- pruning a whole response --------------------------------------------

setSettings({ hideShorts: true });
let data = response([
  video({ id: "keep1" }),
  video({ id: "short1", short: true }),
  video({ id: "keep2" }),
  { reelShelfRenderer: { items: [] } },
]);
data = D.filterData(data);
let ids = itemsOf(data).map((i) => i.videoRenderer && i.videoRenderer.videoId);
check("shorts video removed from the response", !ids.includes("short1"));
check("normal videos survive", ids.includes("keep1") && ids.includes("keep2"));
check("shorts shelf removed", !itemsOf(data).some((i) => i.reelShelfRenderer));
check("array is compacted, no holes", itemsOf(data).every((i) => i != null));

// Nested layouts (rich grid) are handled too.
setSettings({ blockKeywords: "spam" });
let grid = response([
  { richItemRenderer: { content: video({ id: "ok", title: "Clean title" }) } },
  { richItemRenderer: { content: video({ id: "bad", title: "SPAM everywhere" }) } },
]);
grid = D.filterData(grid);
const gridIds = itemsOf(grid).map(
  (i) => i.richItemRenderer.content.videoRenderer.videoId
);
check("richItemRenderer wrapper is unwrapped and filtered", !gridIds.includes("bad"));
check("clean rich item kept", gridIds.includes("ok"));

// No active filter → data returned untouched.
setSettings({});
const untouched = response([video({ id: "a" }), video({ id: "b", short: true })]);
check("inactive settings leave data alone", itemsOf(D.filterData(untouched)).length === 2);

// ---- the ytInitialData hook (kills first-paint flicker) ------------------
// YouTube assigns this global in an inline script; we intercept the assignment
// and hand back filtered data, so blocked cards are never built at all.
setSettings({ blockKeywords: "spam" });
window.ytInitialData = response([
  video({ id: "good", title: "Clean title" }),
  video({ id: "spammy", title: "SPAM everywhere" }),
]);
const initialIds = itemsOf(window.ytInitialData).map(
  (i) => i.videoRenderer.videoId
);
check("ytInitialData assignment is intercepted", initialIds.includes("good"));
check("blocked video never reaches ytInitialData", !initialIds.includes("spammy"));

// Non-object assignments pass through untouched.
window.ytInitialData = null;
check("null assignment is passed through", window.ytInitialData === null);

// Corrupt data must not throw.
setSettings({ hideShorts: true });
let threw = false;
try {
  D.filterData({ a: { b: [null, undefined, 1, "x"] } });
} catch (e) {
  threw = true;
}
check("malformed data does not throw", !threw);

// Deeply nested self-reference must not hang (depth cap).
const deep = { contents: [] };
let cur = deep;
for (let i = 0; i < 60; i++) {
  cur.next = { contents: [] };
  cur = cur.next;
}
threw = false;
try {
  D.filterData(deep);
} catch (e) {
  threw = true;
}
check("very deep structures are bounded", !threw);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
