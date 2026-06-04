const fs = require("node:fs");
const path = require("node:path");

function safeExportFileName(fileName) {
  const baseName = path.basename(String(fileName || "transcription.txt"));
  return baseName.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_") || "transcription.txt";
}

function getUniqueExportFileName(directory, fileName, usedNames = new Set()) {
  const parsed = path.parse(safeExportFileName(fileName));
  const extension = parsed.ext || ".txt";
  const baseName = parsed.name || "transcription";
  let candidate = `${baseName}${extension}`;
  let index = 2;
  while (usedNames.has(candidate.toLowerCase()) || fs.existsSync(path.join(directory, candidate))) {
    candidate = `${baseName}-${index}${extension}`;
    index += 1;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

function getExportableItems(items) {
  return (Array.isArray(items) ? items : []).filter((item) => item && typeof item.content === "string" && item.content.trim());
}

module.exports = {
  getExportableItems,
  getUniqueExportFileName,
  safeExportFileName,
};
