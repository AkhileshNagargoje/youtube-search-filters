// Render-time filtering — runs in YouTube's own JS context (MAIN world) at
// document_start, before YouTube parses its data.
//
// Instead of hiding cards after the browser has painted them, we remove the
// entries from YouTube's response data, so the cards are never created:
//   * window.ytInitialData  — the results embedded in the first page load
//   * fetch() / XHR to /youtubei/v1/* — infinite scroll and SPA navigations
//
// The DOM-based filtering in content.js stays as a fallback: if YouTube changes
// its JSON shape, this quietly stops matching and the DOM pass still catches it.

(function () {
  const YTYF = window.YTYF; // shared parsers (loaded alongside this file)
  if (!YTYF) return;

  const SETTINGS_KEY = "ytyfSettings";
  let removed = 0;

  // Settings are mirrored into localStorage by the content script because this
  // world has no chrome.storage access, and localStorage can be read
  // synchronously — chrome.storage is async and would arrive after the first
  // paint, which is exactly what we're trying to get ahead of.
  function getSettings() {
    try {
      return YTYF.normalize(JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"));
    } catch (e) {
      return YTYF.defaults();
    }
  }

  // ---- reading YouTube's renderer objects ----------------------------------

  function textOf(node) {
    if (!node) return "";
    if (typeof node === "string") return node;
    if (node.simpleText) return node.simpleText;
    if (Array.isArray(node.runs)) return node.runs.map((r) => r.text || "").join("");
    if (node.content) return node.content;
    return "";
  }

  function overlays(r) {
    return r.thumbnailOverlays || [];
  }

  function durationSeconds(r) {
    const direct = YTYF.parseDuration(textOf(r.lengthText));
    if (direct != null) return direct;
    for (const o of overlays(r)) {
      const t = o.thumbnailOverlayTimeStatusRenderer;
      if (t) {
        const d = YTYF.parseDuration(textOf(t.text));
        if (d != null) return d;
      }
    }
    return null;
  }

  function isWatched(r) {
    return overlays(r).some((o) => {
      const p = o.thumbnailOverlayResumePlaybackRenderer;
      return p && (p.percentDurationWatched || 0) > 0;
    });
  }

  function isShortsRenderer(r) {
    if (r.navigationEndpoint && r.navigationEndpoint.reelWatchEndpoint) return true;
    const url =
      r.navigationEndpoint &&
      r.navigationEndpoint.commandMetadata &&
      r.navigationEndpoint.commandMetadata.webCommandMetadata &&
      r.navigationEndpoint.commandMetadata.webCommandMetadata.url;
    return typeof url === "string" && url.indexOf("/shorts/") === 0;
  }

  function channelOf(r) {
    return (
      textOf(r.ownerText) ||
      textOf(r.longBylineText) ||
      textOf(r.shortBylineText) ||
      ""
    );
  }

  function channelIdOf(r) {
    const src = r.ownerText || r.longBylineText || r.shortBylineText;
    const run = src && Array.isArray(src.runs) && src.runs[0];
    const ep = run && run.navigationEndpoint && run.navigationEndpoint.browseEndpoint;
    return (ep && ep.browseId) || "";
  }

  // viewCountText is usually the exact count ("1,234,567 views"), which beats
  // the abbreviated text the DOM shows ("1.2M views").
  function viewsOf(r) {
    const exact = YTYF.parseViews(textOf(r.viewCountText), navigator.language);
    if (exact != null && exact > 0) return exact;
    return YTYF.parseViews(textOf(r.shortViewCountText), navigator.language);
  }

  // ---- the decision --------------------------------------------------------

  function blocked(r, s) {
    try {
      if (s.hideShorts && isShortsRenderer(r)) return true;
      if (s.hideWatched && isWatched(r)) return true;

      const min = parseInt(s.minDuration, 10);
      const max = parseInt(s.maxDuration, 10);
      if (!isNaN(min) || !isNaN(max)) {
        const secs = durationSeconds(r);
        if (secs != null) {
          if (!isNaN(min) && secs < min * 60) return true;
          if (!isNaN(max) && secs > max * 60) return true;
        }
      }

      const minV = parseInt(s.minViews, 10);
      if (!isNaN(minV)) {
        const v = viewsOf(r);
        if (v != null && v < minV) return true;
      }

      if (YTYF.hasYearFilter(s)) {
        const range = YTYF.parseUploadYearRange(textOf(r.publishedTimeText));
        if (YTYF.outsideYearRange(range, s)) return true;
      }

      const kw = YTYF.parseList(s.blockKeywords);
      if (kw.length) {
        const title = textOf(r.title).toLowerCase();
        if (title && kw.some((k) => title.includes(k))) return true;
      }

      const ch = YTYF.parseList(s.blockChannels);
      if (ch.length) {
        const name = channelOf(r).toLowerCase();
        const id = channelIdOf(r).toLowerCase();
        // Channel IDs are stable; names are not, so match either.
        if ((name && ch.some((c) => name.includes(c))) || (id && ch.includes(id))) {
          return true;
        }
      }
      return false;
    } catch (e) {
      return false; // never drop a video because of a parsing slip
    }
  }

  // Renderer keys that wrap a single video.
  const VIDEO_KEYS = [
    "videoRenderer",
    "compactVideoRenderer",
    "gridVideoRenderer",
    "playlistVideoRenderer",
  ];

  // Whole shelves of Shorts.
  const SHORTS_SHELF_KEYS = ["reelShelfRenderer", "shortsLockupViewModel"];

  function videoIn(item) {
    for (const k of VIDEO_KEYS) if (item[k]) return item[k];
    if (item.richItemRenderer && item.richItemRenderer.content) {
      const c = item.richItemRenderer.content;
      for (const k of VIDEO_KEYS) if (c[k]) return c[k];
    }
    return null;
  }

  function shouldDrop(item, s) {
    if (!item || typeof item !== "object") return false;
    if (s.hideShorts && SHORTS_SHELF_KEYS.some((k) => item[k])) return true;
    const v = videoIn(item);
    return v ? blocked(v, s) : false;
  }

  // Walk the whole response and strip matching entries wherever they appear.
  // Structural (rather than path-based) so it survives YouTube moving things.
  function prune(node, s, depth) {
    if (!node || typeof node !== "object" || depth > 30) return;
    if (Array.isArray(node)) {
      let w = 0;
      for (let i = 0; i < node.length; i++) {
        const item = node[i];
        if (shouldDrop(item, s)) {
          removed++;
          continue;
        }
        prune(item, s, depth + 1);
        node[w++] = item;
      }
      node.length = w;
      return;
    }
    for (const key of Object.keys(node)) prune(node[key], s, depth + 1);
  }

  function filterData(data) {
    const s = getSettings();
    if (!YTYF.isActive(s)) return data;
    const before = removed;
    try {
      prune(data, s, 0);
    } catch (e) {
      return data; // on any error, hand back untouched data
    }
    if (removed > before) {
      window.dispatchEvent(
        new CustomEvent("ytyf-removed", { detail: { count: removed - before } })
      );
    }
    return data;
  }

  // ---- hook 1: the data embedded in the initial page load ------------------

  let initial;
  try {
    Object.defineProperty(window, "ytInitialData", {
      configurable: true,
      enumerable: true,
      get() {
        return initial;
      },
      set(v) {
        initial = v && typeof v === "object" ? filterData(v) : v;
      },
    });
  } catch (e) {}

  // ---- hook 2: continuations and SPA navigations ---------------------------

  const API = /\/youtubei\/v1\/(search|browse|next|guide)/;

  const nativeFetch = window.fetch;
  if (typeof nativeFetch === "function") {
    window.fetch = function (input, init) {
      const url = typeof input === "string" ? input : input && input.url;
      const p = nativeFetch.apply(this, arguments);
      if (!url || !API.test(url)) return p;
      return p.then((res) => {
        if (!res || !res.ok) return res;
        // Read a clone so YouTube still gets an unconsumed body.
        return res
          .clone()
          .json()
          .then((data) => {
            const filtered = filterData(data);
            return new Response(JSON.stringify(filtered), {
              status: res.status,
              statusText: res.statusText,
              headers: res.headers,
            });
          })
          .catch(() => res);
      });
    };
  }

  // Exposed for the test suite.
  window.YTYF_DATA = { filterData, shouldDrop, blocked, prune, textOf };
})();
