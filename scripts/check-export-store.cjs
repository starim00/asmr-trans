const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  getExportableItems,
  getUniqueExportFileName,
  safeExportFileName,
} = require("../electron/export-store.cjs");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "asmr-trans-export-"));

try {
  assert.equal(safeExportFileName("bad<>:\"|?*\x01.txt"), "bad________.txt");
  assert.equal(safeExportFileName(""), "transcription.txt");
  assert.equal(safeExportFileName("C:\\folder\\name.srt"), "name.srt");

  assert.deepEqual(
    getExportableItems([
      { fileName: "a.txt", content: "hello" },
      { fileName: "b.txt", content: "   " },
      { fileName: "c.txt", content: "" },
      { fileName: "d.txt", content: 123 },
      null,
    ]).map((item) => item.fileName),
    ["a.txt"],
  );

  const usedNames = new Set();
  assert.equal(getUniqueExportFileName(tempDir, "same.txt", usedNames), "same.txt");
  assert.equal(getUniqueExportFileName(tempDir, "same.txt", usedNames), "same-2.txt");
  assert.equal(getUniqueExportFileName(tempDir, "SAME.txt", usedNames), "SAME-3.txt");

  fs.writeFileSync(path.join(tempDir, "exists.txt"), "old", "utf8");
  assert.equal(getUniqueExportFileName(tempDir, "exists.txt", new Set()), "exists-2.txt");
  assert.equal(getUniqueExportFileName(tempDir, "no-extension", new Set()), "no-extension.txt");
  assert.equal(getUniqueExportFileName(tempDir, "<bad>.srt", new Set()), "_bad_.srt");

  console.log("export store checks passed");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
