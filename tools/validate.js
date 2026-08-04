// Static checks on the extension package. These catch breakage that the DOM
// tests can't: a manifest that references a missing file, an __MSG_ placeholder
// with no matching message, a t() key a translator would never see, or a
// version that drifted between manifest.json and package.json.
//
//   npm run validate
//
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(REPO, p), "utf8");
const exists = (p) => fs.existsSync(path.join(REPO, p));

let failures = 0;
function check(label, ok, detail) {
  console.log((ok ? "PASS" : "FAIL") + "  " + label + (ok || !detail ? "" : " — " + detail));
  if (!ok) failures++;
}

// --- JSON parses -----------------------------------------------------------
const JSON_FILES = ["manifest.json", "package.json"];
const parsed = {};
for (const f of JSON_FILES) {
  try {
    parsed[f] = JSON.parse(read(f));
    check("valid JSON: " + f, true);
  } catch (e) {
    check("valid JSON: " + f, false, e.message);
  }
}
if (failures) process.exit(1);

const manifest = parsed["manifest.json"];
const pkg = parsed["package.json"];

// --- locale messages -------------------------------------------------------
const localeFile = "_locales/" + manifest.default_locale + "/messages.json";
check("default_locale is set", Boolean(manifest.default_locale));
check("locale file exists: " + localeFile, exists(localeFile));
if (failures) process.exit(1);

let messages = {};
try {
  messages = JSON.parse(read(localeFile));
  check("valid JSON: " + localeFile, true);
} catch (e) {
  check("valid JSON: " + localeFile, false, e.message);
  process.exit(1);
}

// Every message must actually have a "message" field.
const badMessages = Object.keys(messages).filter(
  (k) => !messages[k] || typeof messages[k].message !== "string"
);
check("every locale entry has a message string", badMessages.length === 0, badMessages.join(", "));

// --- __MSG_ placeholders in the manifest resolve ---------------------------
const msgRefs = [
  ...new Set((JSON.stringify(manifest).match(/__MSG_([A-Za-z0-9_@]+)__/g) || []).map((r) => r.slice(6, -2))),
];
const unresolved = msgRefs.filter((k) => !messages[k]);
check(
  "manifest __MSG_ placeholders resolve (" + msgRefs.length + ")",
  unresolved.length === 0,
  unresolved.join(", ")
);

// --- t() keys used in code exist -------------------------------------------
const contentSrc = read("content.js");
const tKeys = [...new Set([...contentSrc.matchAll(/\bt\(\s*"([^"]+)"/g)].map((m) => m[1]))];
const missingKeys = tKeys.filter((k) => !messages[k]);
check("t() keys exist in messages (" + tKeys.length + ")", missingKeys.length === 0, missingKeys.join(", "));

// --- every file the manifest references exists -----------------------------
const referenced = [];
(manifest.content_scripts || []).forEach((cs) => {
  (cs.js || []).forEach((f) => referenced.push(f));
  (cs.css || []).forEach((f) => referenced.push(f));
});
if (manifest.action && manifest.action.default_popup) referenced.push(manifest.action.default_popup);
Object.values(manifest.icons || {}).forEach((f) => referenced.push(f));
Object.values((manifest.action && manifest.action.default_icon) || {}).forEach((f) => referenced.push(f));

const missingFiles = [...new Set(referenced)].filter((f) => !exists(f));
check(
  "manifest file references exist (" + new Set(referenced).size + ")",
  missingFiles.length === 0,
  missingFiles.join(", ")
);

// --- scripts referenced by popup.html exist --------------------------------
const popupSrc = read(manifest.action.default_popup);
const popupAssets = [...popupSrc.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((u) => !/^(https?:)?\/\//.test(u));
const missingPopup = popupAssets.filter((f) => !exists(f));
check("popup assets exist (" + popupAssets.length + ")", missingPopup.length === 0, missingPopup.join(", "));

// --- versions agree --------------------------------------------------------
check(
  "manifest and package versions match",
  manifest.version === pkg.version,
  "manifest " + manifest.version + " vs package " + pkg.version
);
check("manifest version is MV3-shaped", /^\d+(\.\d+){0,3}$/.test(manifest.version), manifest.version);
check("manifest_version is 3", manifest.manifest_version === 3);

// --- permissions stay minimal ---------------------------------------------
// Broad host permissions are the top cause of store-review friction; fail loudly
// if one ever creeps in.
const hosts = manifest.host_permissions || [];
const tooBroad = hosts.filter((h) => !/youtube\.com/.test(h));
check("host permissions are YouTube-only", tooBroad.length === 0, tooBroad.join(", "));
check("no <all_urls> permission", !JSON.stringify(manifest).includes("<all_urls>"));

console.log("\n" + (failures ? failures + " check(s) failed" : "all checks passed"));
process.exit(failures ? 1 : 0);
