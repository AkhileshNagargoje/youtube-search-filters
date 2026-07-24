# 📅 YouTube Year Filter

> A lightweight Chrome/Edge extension that filters YouTube search results by **upload year**. Pick a *from* and/or *up to* year and see only videos from that range.

![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)
![License: MIT](https://img.shields.io/badge/License-MIT-green)
![No tracking](https://img.shields.io/badge/tracking-none-brightgreen)

YouTube lets you sort by "this year", but there's no way to say *"only show me videos up to 2019."* This extension adds exactly that — a small **From – To** year control right next to the search bar.

**Example:** search `ai` with **up to `2019`** → you only see AI videos uploaded in 2019 or earlier.

---

## ✨ Features

- 🔎 **From / To year range** — set a lower bound, an upper bound, or both.
- 🧩 **Inline control** — year pills appear right next to YouTube's search bar.
- 🖱️ **Popup too** — set the range from the toolbar icon; both stay in sync.
- 🌗 **Light & dark theme** aware, styled to match YouTube.
- 🔒 **Private** — no tracking, no network calls, no analytics. Your choice is saved with `chrome.storage` only.
- ⚡ **Tiny** — vanilla JS, no dependencies, no build step.

## 🛠 How it works

YouTube's search supports two undocumented operators: `before:YYYY-MM-DD` and `after:YYYY-MM-DD`. When you pick a range, the extension rewrites your query — for example:

| You search | Range | Rewritten query |
|---|---|---|
| `ai` | up to 2019 | `ai before:2020-01-01` |
| `ai` | from 2015 | `ai after:2014-12-31` |
| `ai` | 2015 – 2019 | `ai after:2014-12-31 before:2020-01-01` |

These are **real YouTube search results** — no scraping, no third-party API.

## 📦 Install (unpacked)

1. Download or clone this repo.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer mode** (top-right).
4. Click **Load unpacked** and select this folder.
5. Open YouTube — the year control appears next to the search bar.

## 🚀 Usage

1. Set **From** and/or **Up to** years (next to the search bar, or in the toolbar popup).
2. Type your search and press **Enter**.
3. Results are limited to that upload-year range.
4. Set both back to **Any** (or hit **Clear** in the popup) to disable.

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
