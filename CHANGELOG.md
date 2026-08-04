# Changelog

All notable changes to this project are documented here.

## [1.7.0] - 2026-08-05

### Fixed
- **Wrong videos were hidden on non-English YouTube.** View counts were parsed
  with English assumptions, so `1,2 Mio. Aufrufe` read as 12,000,000 (10× too
  high) and `12万 回視聴` as 12 (10,000× too low) — the minimum-views filter then
  hid the wrong results silently. Parsing is now locale-aware: it detects
  decimal vs. thousands separators, understands compact suffixes across
  European, CJK, Indic, Arabic and Cyrillic locales, and applies per-language
  overrides where a letter differs (Turkish `B` = *bin* = 1,000, not billion).
  The view-count element is also located by "views" in ~25 languages, with a
  positional fallback for the rest.
- **Settings could silently fail to save.** `chrome.storage.sync` permits only
  120 writes/minute, and the blocklist fields wrote on every keystroke. Writes
  are now debounced (800 ms) and coalesced, `runtime.lastError` is checked, and
  a failed sync write falls back to `storage.local` instead of being swallowed.
  Pending writes are flushed on page hide / popup dismiss so nothing is lost.
- **CPU use on long pages.** Every DOM mutation triggered a full unhide-and-
  re-evaluate sweep of the entire document. Cards are now stamped per pass and
  only newly added ones are judged; a full sweep runs solely when settings
  change or the page navigates. The observer is scoped to `ytd-app` rather than
  the whole document.

### Testing
- 38 assertions (was 24), covering locale parsing across 11 languages, write
  debouncing/coalescing, and incremental filtering.

## [1.6.1] - 2026-08-01

### Fixed
- **Hide Shorts** now reliably removes Shorts on the real site. It hides whole
  Shorts shelves (`ytd-reel-shelf-renderer`, `grid-shelf-view-model`, shorts
  rich-sections) even when they have no direct link, and hides any individual
  Shorts card by its `/shorts/` link across search, home, and sidebar layouts.

### Removed
- **Presets** feature (UI, storage helpers, and strings) per request.

## [1.6.0] - 2026-07-24

### Added
- **Hide watched** videos (those with a resume-progress bar).
- **Keyword blocklist** — hide results whose title contains any listed word.
- **Channel blocklist** — hide results from listed channels.
- **Presets** — save/load/delete named filter combinations.
- **i18n** — all UI strings moved to `_locales/en/messages.json`; `default_locale`
  set so the extension is translatable. Added a localization helper with English
  fallback.
- **Accessibility** — panel is a labelled dialog, button exposes
  `aria-haspopup`/`aria-expanded`, Escape closes the panel, focus moves into the
  panel on open and back to the button on close.
- README preview image (`docs/preview.svg`).

### Changed
- **Robustness**: more fallback selectors for duration; per-video filtering is
  wrapped in try/catch so one odd node can't break the whole pass; duration
  lookup now scans candidates for the first parseable value.
- Popup mirrors all new fields and no longer overwrites them.

### Testing
- Test suite expanded to **24 assertions** (hide-watched, keyword/channel
  blocklists, presets persistence).

## [1.5.1] - 2026-07-24

### Changed
- Moved the **Filters button back next to the search bar** (per preference). The
  dropdown panel is still a fixed, `<body>`-attached element positioned under the
  button, so it stays by the search bar but can't be clipped by YouTube's layout.

## [1.5.0] - 2026-07-24

### Added
- **Apply button** in the panel footer. Filters still update live as you change
  them, but Apply also immediately re-runs the current search with the year
  range (instead of waiting for the next Enter) and closes the panel.
- Test coverage for the Apply button (16 assertions total).

## [1.4.0] - 2026-07-24

### Changed
- **Filters now live in a floating button** pinned to the bottom-right of the
  page (fixed position, attached to `<body>`, very high z-index). It no longer
  anchors to YouTube's search bar, so nothing in YouTube's layout can clip,
  hide, or dismiss the button or its panel — the root cause of the panel not
  opening on some devices.
- Tapping the button opens a panel with all options; tapping outside closes it.

### Testing
- Added a jsdom integration test (`tools/test.js`, run with `npm test`) covering
  UI injection, panel open/close, and all three DOM filters — 14 assertions.

## [1.3.0] - 2026-07-24

### Changed
- **New primary UI: an in-page "Filters" button** next to the search bar that
  opens a small panel with all options (year range, Hide Shorts, duration, min
  views). Because the panel lives inside the YouTube page rather than a browser
  popup, it can't be dismissed by the popup focus/touch glitch some devices hit.
- The button shows a red count badge for how many results are hidden and
  highlights when any filter is active.
- Panel closes when you click outside it.

### Notes
- The toolbar popup still works and stays in sync, but the on-page button is now
  the recommended way to use the extension.

## [1.2.1] - 2026-07-24

### Fixed
- Popup closing unexpectedly when interacting with the year dropdowns. The
  popup no longer uses native `<select>` elements (which can dismiss an
  extension popup on touch/Windows); years are now number inputs.
- Popup no longer rewrites input values on every keystroke, so the caret and
  focus stay put while typing.
- Popup fails gracefully with a message if the shared module can't load.

## [1.2.0] - 2026-07-24

### Added
- **Hide Shorts** — removes Shorts shelves and Shorts videos from any page.
- **Duration filter** — hide videos shorter than a min and/or longer than a max
  (in minutes), more precise than YouTube's built-in buckets.
- **Minimum views** — hide videos below a view-count threshold.
- Live **"N hidden"** badge on the inline control showing how many results the
  page filters removed.
- Popup redesigned with sections, a toggle, number inputs, and an active-filter
  summary; **Clear all** resets everything.

### Changed
- Settings now stored as a single object (`ytFilterSettings`); legacy year-range
  values are migrated automatically.
- DOM filters apply live via a `MutationObserver` — no page reload needed.

## [1.1.0] - 2026-07-24

### Added
- **Year range**: filter by a *from* year, an *up to* year, or both.
- Toolbar popup with a live summary and a **Clear** button.
- Real extension icons (16/32/48/128 px) + `tools/make_icons.py` generator.
- Active-state highlight on the inline control when a filter is set.
- Popup and inline control now stay in sync via `chrome.storage`.

### Changed
- Refactored shared logic into `common.js`.
- Reworked styling to better match YouTube's pill design, incl. dark mode.

## [1.0.0] - 2026-07-24

### Added
- Initial release: single "up to year" dropdown next to the YouTube search bar,
  rewriting queries with YouTube's `before:` operator.
