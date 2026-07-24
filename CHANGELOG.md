# Changelog

All notable changes to this project are documented here.

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
