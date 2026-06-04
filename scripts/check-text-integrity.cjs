const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const INCLUDE_EXTENSIONS = new Set([".cjs", ".css", ".html", ".json", ".md", ".ts", ".tsx"]);
const EXCLUDED_DIRS = new Set([".git", "dist", "node_modules", "release", "runtime", "__pycache__"]);
const SUSPICIOUS_PATTERNS = [
  "\ufffd",
  "鏈",
  "淇",
  "妯",
  "璁",
  "闊",
  "鍒",
  "绔",
  "棣",
  "瑙",
  "浠",
  "€",
];

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) {
        walk(path.join(dir, entry.name), files);
      }
      continue;
    }
    if (INCLUDE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(path.join(dir, entry.name));
    }
  }
  return files;
}

const failures = [];
for (const filePath of walk(ROOT)) {
  const relativePath = path.relative(ROOT, filePath);
  if (relativePath === path.join("scripts", "check-text-integrity.cjs")) {
    continue;
  }
  const content = fs.readFileSync(filePath, "utf8");
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (content.includes(pattern)) {
      failures.push(`${relativePath}: contains suspicious text fragment ${JSON.stringify(pattern)}`);
    }
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("text integrity checks passed");
