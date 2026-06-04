const assert = require("node:assert/strict");
const { loadTsModule } = require("./load-ts-module.cjs");

const {
  filterSegmentItems,
  getJumpTargetIndex,
  getVisibleCountForJump,
  getVisibleSegmentItems,
} = loadTsModule("src/segment-list-utils.ts");

const segments = [
  { start: 0, end: 1.25, sourceText: "第一段", translatedText: "one" },
  { start: 1.25, end: 3.5, sourceText: "第二段", translatedText: "" },
  { start: 3.5, end: 9, sourceText: "third source", translatedText: null },
];

assert.deepEqual(
  filterSegmentItems(segments, "all", "").map((item) => item.index),
  [0, 1, 2],
);
assert.deepEqual(
  filterSegmentItems(segments, "untranslated", "").map((item) => item.index),
  [1, 2],
);
assert.deepEqual(
  filterSegmentItems(segments, "all", "THIRD").map((item) => item.index),
  [2],
);
assert.deepEqual(
  filterSegmentItems(segments, "all", "00:00:01.250").map((item) => item.index),
  [0, 1],
);
assert.deepEqual(
  filterSegmentItems(segments, "all", "3").map((item) => item.index),
  [1, 2],
);

const filtered = filterSegmentItems(segments, "all", "");
assert.deepEqual(getVisibleSegmentItems(filtered, 2).map((item) => item.index), [0, 1]);

assert.equal(getJumpTargetIndex(3, "1"), 0);
assert.equal(getJumpTargetIndex(3, "2.9"), 1);
assert.equal(getJumpTargetIndex(3, "99"), 2);
assert.equal(getJumpTargetIndex(3, "-1"), 0);
assert.equal(getJumpTargetIndex(3, "bad"), null);
assert.equal(getJumpTargetIndex(0, "1"), null);

assert.equal(getVisibleCountForJump(10, 4, 80), 80);
assert.equal(getVisibleCountForJump(120, 4, 80), 120);
assert.equal(getVisibleCountForJump(10, 120, 80), 121);

console.log("segment list checks passed");
