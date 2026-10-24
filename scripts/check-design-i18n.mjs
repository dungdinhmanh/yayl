// Checks that every key referenced by the design lab exists in both locales.
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const design = resolve(import.meta.dir, "..", "design");
const i18nSource = readFileSync(join(design, "assets", "js", "mock-i18n.js"), "utf8");

function extractLocale(name) {
  const start = i18nSource.indexOf(name + ": {");
  if (start === -1) return new Set();
  const rest = i18nSource.slice(start);
  const end = rest.indexOf("\n    }");
  const block = end === -1 ? rest : rest.slice(0, end);
  const keys = new Set();
  const regex = /"([a-zA-Z][\w.]*)":/g;
  let match;
  while ((match = regex.exec(block))) keys.add(match[1]);
  return keys;
}

const vi = extractLocale("vi");
const en = extractLocale("en");

const referenced = new Set();
const htmlFiles = readdirSync(design, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
  .map((entry) => entry.name);

for (const file of htmlFiles) {
  const source = readFileSync(join(design, file), "utf8");
  const regex = /data-i18n(?:-aria|-title|-placeholder)?="([^"]+)"/g;
  let match;
  while ((match = regex.exec(source))) referenced.add(match[1]);
}

const jsFiles = readdirSync(join(design, "assets", "js"))
  .filter((name) => name.endsWith(".js"))
  .map((name) => join(design, "assets", "js", name));

for (const file of jsFiles) {
  const source = readFileSync(file, "utf8");
  const regex = /\.t\("([^"]+)"/g;
  let match;
  while ((match = regex.exec(source))) referenced.add(match[1]);
  const keyRegex = /["']([a-zA-Z][\w.]*\.[\w.]+)["']/g;
  while ((match = keyRegex.exec(source))) {
    if (match[1].indexOf(".") !== -1 && /^(home|download|settings|firstRun|kit|common|nav|app|server|window)\./.test(match[1])) {
      referenced.add(match[1]);
    }
  }
}

const missingVi = [...referenced].filter((key) => key.endsWith(".") === false && !vi.has(key)).sort();
const missingEn = [...referenced].filter((key) => key.endsWith(".") === false && !en.has(key)).sort();

console.log("design i18n check");
console.log("  html files       :", htmlFiles.length);
console.log("  referenced keys  :", referenced.size);
console.log("  vi keys          :", vi.size);
console.log("  en keys          :", en.size);
console.log("  missing in vi    :", missingVi.length ? missingVi.join(", ") : "none");
console.log("  missing in en    :", missingEn.length ? missingEn.join(", ") : "none");

if (missingVi.length || missingEn.length) process.exit(1);
