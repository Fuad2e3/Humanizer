// Copies the PDF.js browser build into public/vendor so PDF upload works without a CDN.
// Run after changing the pdfjs-dist version: npm run build:pdf
import { copyFileSync } from "node:fs";

const from = new URL("../node_modules/pdfjs-dist/build/", import.meta.url);
const to = new URL("../public/vendor/", import.meta.url);
for (const f of ["pdf.min.mjs", "pdf.worker.min.mjs"]) copyFileSync(new URL(f, from), new URL(f, to));
console.log("Copied PDF.js into public/vendor.");
