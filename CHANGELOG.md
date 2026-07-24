# Changelog

All notable changes to this project are documented here.

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
