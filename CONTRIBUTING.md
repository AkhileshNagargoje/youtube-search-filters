# Contributing

Thanks for your interest in improving Search Filters for YouTube! 🎉

## Getting started

1. Fork and clone the repo.
2. Open `chrome://extensions`, enable **Developer mode**, and **Load unpacked**
   pointing at your clone.
3. Make changes, then click the **reload** icon on the extension card to test.

There's no build step — it's vanilla JS/CSS/HTML.

## Project layout

- `common.js` — shared logic: storage + query building. Most feature changes
  start here.
- `content.js` — DOM injection and search interception on youtube.com.
- `popup.html` / `popup.js` — the toolbar popup.
- `styles.css` — styling for the inline control.
- `tools/make_icons.py` — regenerates the PNG icons (needs `pillow`).

## Guidelines

- Keep it dependency-free and small.
- Match the existing code style (2-space indent, vanilla JS).
- Test in both light and dark YouTube themes.
- Don't add tracking, analytics, or network requests.

## Reporting bugs

Open an issue with:
- Browser + version
- Steps to reproduce
- What you expected vs. what happened (a screenshot helps)

If YouTube changes its markup and the control stops appearing, that's the most
likely thing to break — include the selector you think changed if you can.
