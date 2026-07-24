# 📅 YouTube Filter

> A lightweight Chrome/Edge extension that filters YouTube results — by **upload year**, and by **hiding Shorts, off-length videos, and low-view clips**.

![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)
![License: MIT](https://img.shields.io/badge/License-MIT-green)
![No tracking](https://img.shields.io/badge/tracking-none-brightgreen)

YouTube's built-in filters are coarse and there's no way to say *"only videos up to 2019"*, *"nothing under 10 min"*, or *"hide all Shorts."* This extension adds all of that — a small control next to the search bar plus a richer toolbar popup.

**Example:** search `ai` with **up to `2019`** → only AI videos from 2019 or earlier. Turn on **Hide Shorts** and set **min views 10K** → a much cleaner results page.

---

## ✨ Features

- 🔎 **Upload-year range** — set a *from* and/or *up to* year (works via YouTube's search operators).
- 🩳 **Hide Shorts** — strip Shorts shelves and Shorts videos from search, home, and sidebar.
- ⏱️ **Duration filter** — hide anything shorter than a min and/or longer than a max (in minutes).
- 👁️ **Minimum views** — hide videos below a view-count threshold.
- 🔢 **"N hidden" badge** — see how many results were filtered out on the page.
- 🧩 **Inline + popup** controls that stay in sync; 🌗 light/dark aware.
- 🔒 **Private** — no tracking, no network calls. Settings live in `chrome.storage` only.
- ⚡ **Tiny** — vanilla JS, no dependencies, no build step.

## 🛠 How it works

**Year range** uses YouTube's undocumented `before:`/`after:` search operators — the extension rewrites your query:

| You search | Range | Rewritten query |
|---|---|---|
| `ai` | up to 2019 | `ai before:2020-01-01` |
| `ai` | from 2015 | `ai after:2014-12-31` |
| `ai` | 2015 – 2019 | `ai after:2014-12-31 before:2020-01-01` |

These are **real YouTube search results** — no scraping, no third-party API.

**Hide Shorts / duration / min-views** work client-side: the extension reads each result's duration badge and view count and hides the ones that don't match, live as the page loads (no reload). Nothing leaves your browser.

## 📦 Install (unpacked)

1. Download or clone this repo.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer mode** (top-right).
4. Click **Load unpacked** and select this folder.
5. Open YouTube — the year control appears next to the search bar.

## 🚀 Usage

- **Year range:** set **From** / **Up to** (next to the search bar or in the popup), then search — results are limited to that upload-year range.
- **Hide Shorts / duration / min-views:** open the toolbar **popup**, toggle Hide Shorts, and/or enter min/max minutes and a minimum view count. These apply instantly to the current page.
- A red **"N hidden"** badge next to the search bar shows how many results were removed.
- Hit **Clear all** in the popup (or set fields back to *Any*) to disable.

## 📁 Project structure

```
├── manifest.json      # Extension config (Manifest V3)
├── common.js          # Shared filter logic (query building, storage)
├── content.js         # Injects the year pills, intercepts search
├── styles.css         # Inline-control styling (light/dark)
├── popup.html/js      # Toolbar popup
├── icons/             # 16/32/48/128 px PNG icons
└── tools/make_icons.py# Regenerate icons (requires Pillow)
```

## 🔧 Development

No build step — edit the files and reload the extension from `chrome://extensions`.

To regenerate icons:

```bash
pip install pillow
python tools/make_icons.py
```

## ⚠️ Notes & limitations

- The `before:`/`after:` operators filter by **upload date**. They're supported by YouTube but undocumented, so behavior can change.
- Ranges are inclusive of whole years (e.g. "up to 2019" includes all of 2019).

## 🤝 Contributing

Issues and PRs welcome! See [CONTRIBUTING.md](CONTRIBUTING.md).

## 📄 License

[MIT](LICENSE) — do whatever you like, just keep the notice.

---

<sub>Not affiliated with YouTube or Google. "YouTube" is a trademark of Google LLC.</sub>
