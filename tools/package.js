// Build distributable zips for each browser store.
//
//   npm run package            # all targets
//   npm run package -- firefox # one target
//
// Chrome and Edge take the manifest as-is (Edge is Chromium). Firefox needs an
// add-on id and a minimum version — `world: "MAIN"` content scripts, which the
// render-time filtering depends on, landed in Firefox 128.
//
// Zips are written with Node's zlib only, so there are no build dependencies.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const REPO = path.join(__dirname, "..");
const DIST = path.join(REPO, "dist");

// Everything the extension needs at runtime — deliberately explicit, so repo
// files (tests, docs, lockfiles) can never leak into a store upload.
const FILES = [
  "manifest.json",
  "common.js",
  "injected.js",
  "content.js",
  "styles.css",
  "popup.html",
  "popup.js",
  "icons/icon16.png",
  "icons/icon32.png",
  "icons/icon48.png",
  "icons/icon128.png",
  "_locales/en/messages.json",
  "LICENSE",
];

const TARGETS = {
  chrome: (m) => m,
  edge: (m) => m,
  firefox: (m) => ({
    ...m,
    browser_specific_settings: {
      gecko: {
        id: "search-filters-for-youtube@akhileshnagargoje.github.io",
        // world: "MAIN" content scripts require Firefox 128+.
        strict_min_version: "128.0",
      },
    },
  }),
};

// ---- minimal zip writer (deflate, no dependencies) ------------------------

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function zip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    // Only use compression if it actually helps.
    const useDeflate = deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(0x21, 12); // date (1 Jan 1996) — fixed for reproducibility
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    chunks.push(local, nameBuf, body);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4); // version made by
    dir.writeUInt16LE(20, 6); // version needed
    dir.writeUInt16LE(0, 8);
    dir.writeUInt16LE(method, 10);
    dir.writeUInt16LE(0, 12);
    dir.writeUInt16LE(0x21, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(body.length, 20);
    dir.writeUInt32LE(data.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28);
    dir.writeUInt16LE(0, 30); // extra
    dir.writeUInt16LE(0, 32); // comment
    dir.writeUInt16LE(0, 34); // disk
    dir.writeUInt16LE(0, 36); // internal attrs
    dir.writeUInt32LE(0, 38); // external attrs
    dir.writeUInt32LE(offset, 42);
    central.push(dir, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...chunks, centralBuf, end]);
}

// ---- build ----------------------------------------------------------------

function build(target) {
  const transform = TARGETS[target];
  if (!transform) throw new Error("unknown target: " + target);

  const manifest = transform(JSON.parse(fs.readFileSync(path.join(REPO, "manifest.json"), "utf8")));

  const entries = FILES.map((rel) => {
    const abs = path.join(REPO, rel);
    if (!fs.existsSync(abs)) throw new Error("missing file: " + rel);
    return {
      name: rel.split(path.sep).join("/"),
      data:
        rel === "manifest.json"
          ? Buffer.from(JSON.stringify(manifest, null, 2) + "\n", "utf8")
          : fs.readFileSync(abs),
    };
  });

  fs.mkdirSync(DIST, { recursive: true });
  const out = path.join(DIST, `search-filters-for-youtube-${manifest.version}-${target}.zip`);
  const buf = zip(entries);
  fs.writeFileSync(out, buf);
  console.log(
    `${target.padEnd(8)} ${entries.length} files  ${(buf.length / 1024).toFixed(1)} KB  ${path.relative(REPO, out)}`
  );
}

const requested = process.argv.slice(2);
const targets = requested.length ? requested : Object.keys(TARGETS);
targets.forEach(build);
