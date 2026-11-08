import { test } from "node:test";
import assert from "node:assert/strict";
import { makeDocx } from "../public/docx-export.js";
import { unzipEntry } from "../public/files.js";

test("round-trips through the reader", async () => {
  const blob = makeDocx("A & B\n\nবাংলা <ok>");
  assert.equal(blob.type, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  const xml = await unzipEntry(await blob.arrayBuffer(), "word/document.xml");
  assert.ok(xml.includes("A &amp; B"));
  assert.ok(xml.includes("বাংলা &lt;ok&gt;"));
  assert.equal((xml.match(/<w:p>/g) || []).length, 3);
});

test("has the three required parts", async () => {
  const buf = await makeDocx("hi").arrayBuffer();
  assert.ok((await unzipEntry(buf, "[Content_Types].xml")).includes("wordprocessingml"));
  assert.ok((await unzipEntry(buf, "_rels/.rels")).includes("word/document.xml"));
});
