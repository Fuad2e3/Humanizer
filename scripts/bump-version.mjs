// Adds a fresh ?v= to every local .css/.js reference so browsers fetch new files after a deploy.
// Run before committing a change to the site: npm run bump
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dir = new URL("../public/", import.meta.url).pathname;
const v = new Date().toISOString().replace(/\D/g, "").slice(0, 12);
const files = readdirSync(dir).filter((f) => /\.(html|js)$/.test(f));
let changed = 0;
for (const f of files) {
  const path = join(dir, f);
  const before = readFileSync(path, "utf8");
  const after = before
    .replace(/((?:href|src)="(?!https?:|\/\/)[^"?#]+\.(?:css|js))(?:\?v=\w+)?"/g, `$1?v=${v}"`)
    .replace(/(from\s+"\.\/[^"?#]+\.js)(?:\?v=\w+)?"/g, `$1?v=${v}"`)
    .replace(/(import\("\.\/[^"?#]+\.js)(?:\?v=\w+)?"\)/g, `$1?v=${v}")`);
  if (after !== before) { writeFileSync(path, after); changed++; }
}
console.log(`Version ${v} set in ${changed} file(s).`);
