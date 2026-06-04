const assert = require("node:assert/strict");
const { loadTsModule } = require("./load-ts-module.cjs");

const { mergeEditableSegments, splitEditableSegment, splitTextAt } = loadTsModule("src/segment-edit-utils.ts");

assert.deepEqual(splitTextAt("abcdef", 2), ["ab", "cdef"]);
assert.deepEqual(splitTextAt("abcdef"), ["abc", "def"]);
assert.deepEqual(splitTextAt("abc", 0), ["ab", "c"]);
assert.equal(splitTextAt("a"), null);
assert.deepEqual(splitTextAt("ab  cd", 4), ["ab", "cd"]);

const split = splitEditableSegment(
  {
    start: 10,
    end: 20,
    sourceText: "abcdefghij",
    translatedText: "一二三四五六",
  },
  { sourceCursor: 2, translationCursor: 3 },
);
assert.ok(split);
assert.deepEqual(
  split.map((segment) => ({
    start: segment.start,
    end: segment.end,
    sourceText: segment.sourceText,
    translatedText: segment.translatedText,
  })),
  [
    { start: 10, end: 12, sourceText: "ab", translatedText: "一二三" },
    { start: 12, end: 20, sourceText: "cdefghij", translatedText: "四五六" },
  ],
);

const midpointSplit = splitEditableSegment({ start: 0, end: 1, sourceText: "abcd" });
assert.ok(midpointSplit);
assert.equal(midpointSplit[0].end, 0.5);
assert.equal(midpointSplit[1].translatedText, undefined);

const clampedEarlySplit = splitEditableSegment({ start: 0, end: 10, sourceText: "abcdefghij" }, { sourceCursor: 1 });
assert.ok(clampedEarlySplit);
assert.equal(clampedEarlySplit[0].end, 1);

const clampedShortDurationSplit = splitEditableSegment({ start: 3, end: 3, sourceText: "abcd" });
assert.ok(clampedShortDurationSplit);
assert.equal(clampedShortDurationSplit[0].end, 3.05);

assert.equal(splitEditableSegment({ start: 0, end: 1, sourceText: "" }), null);

assert.deepEqual(
  mergeEditableSegments(
    { start: 1, end: 2, sourceText: "上段", translatedText: "A" },
    { start: 2, end: 5, sourceText: "下段", translatedText: "B" },
  ),
  { start: 1, end: 5, sourceText: "上段\n下段", translatedText: "A\nB" },
);

assert.deepEqual(
  mergeEditableSegments(
    { start: 1, end: 2, sourceText: "", translatedText: undefined },
    { start: 2, end: 5, sourceText: "下段", translatedText: undefined },
  ),
  { start: 1, end: 5, sourceText: "下段", translatedText: undefined },
);

console.log("segment edit checks passed");
