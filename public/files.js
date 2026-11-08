// Reads text from an uploaded .txt, .md, .docx or .pdf file, all in the browser.

export const ACCEPT = ".txt,.md,.docx,.pdf,application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_BYTES = 5 * 1024 * 1024;

export async function readTextFile(file) {
  if (file.size > MAX_BYTES) throw new Error("The file is larger than 5 MB.");
  const name = file.name.toLowerCase();
  if (name.endsWith(".docx")) return docxText(await file.arrayBuffer());
  if (name.endsWith(".pdf") || file.type === "application/pdf") return pdfText(await file.arrayBuffer());
  if (name.endsWith(".txt") || name.endsWith(".md") || file.type.startsWith("text/")) return (await file.text()).replace(/\r\n/g, "\n");
  if (name.endsWith(".doc")) throw new Error("Old .doc files are not supported. Open it in Word and save it as .docx.");
  throw new Error("Only .txt, .md, .docx and .pdf files are supported.");
}

// PDF.js is loaded only when a PDF is uploaded. Pages are joined with a blank line.
async function pdfText(buf) {
  let doc;
  try {
    const pdfjs = await import("./vendor/pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdf.worker.min.mjs", import.meta.url).href;
    doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  } catch { throw new Error("This PDF could not be read."); }
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const { items } = await (await doc.getPage(i)).getTextContent();
    pages.push(items.map((it) => it.str + (it.hasEOL ? "\n" : "")).join("").replace(/[ \t]+\n/g, "\n").trim());
  }
  const text = pages.filter(Boolean).join("\n\n").trim();
  if (!text) throw new Error("No text was found in this PDF. It may be a scanned image.");
  return text;
}

// A .docx is a zip; the text lives in word/document.xml.
async function docxText(buf) {
  const xml = await unzipEntry(buf, "word/document.xml");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const paras = [];
  for (const p of doc.getElementsByTagNameNS(W, "p")) {
    let line = "";
    for (const node of p.getElementsByTagNameNS(W, "*")) {
      if (node.localName === "t") line += node.textContent;
      else if (node.localName === "tab") line += "\t";
      else if (node.localName === "br" || node.localName === "cr") line += "\n";
    }
    paras.push(line);
  }
  const text = paras.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) throw new Error("No text was found in this .docx file.");
  return text;
}

// Minimal zip reader: finds one entry through the central directory and inflates it.
async function unzipEntry(buf, wanted) {
  const v = new DataView(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("This file is not a valid .docx.");
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  for (let k = 0; k < count; k++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true);
    const csize = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true), extraLen = v.getUint16(p + 30, true), commentLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nameLen));
    if (name === wanted) {
      const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      const data = new Uint8Array(buf, start, csize);
      if (method === 0) return dec.decode(data);
      if (method !== 8) throw new Error("This .docx file could not be read.");
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return await new Response(stream).text();
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error("No Word document text was found in this file.");
}
