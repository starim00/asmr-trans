const assert = require("node:assert/strict");
const { loadTsModule } = require("./load-ts-module.cjs");

const { buildSrt, buildTxt, formatTimestamp } = loadTsModule("src/export-utils.ts");

const result = {
  segments: [
    {
      start: 1.234,
      end: 5.678,
      sourceText: "こんにちは",
      translatedText: "你好",
    },
    {
      start: -2,
      end: 65.004,
      sourceText: "原文：正文里有标签",
      translatedText: "",
    },
  ],
};

assert.equal(formatTimestamp(-1), "00:00:00.000");
assert.equal(formatTimestamp(3661.005), "01:01:01.005");

assert.equal(
  buildTxt(result, "bilingual"),
  [
    "[00:00:01.234 - 00:00:05.677]",
    "原文：こんにちは",
    "译文：你好",
    "",
    "[00:00:00.000 - 00:01:05.004]",
    "原文：正文里有标签",
  ].join("\n"),
);

assert.equal(
  buildTxt(result, "source"),
  [
    "[00:00:01.234 - 00:00:05.677]",
    "こんにちは",
    "",
    "[00:00:00.000 - 00:01:05.004]",
    "原文：正文里有标签",
  ].join("\n"),
);

assert.equal(
  buildTxt(result, "translation"),
  [
    "[00:00:01.234 - 00:00:05.677]",
    "你好",
    "",
    "[00:00:00.000 - 00:01:05.004]",
    "原文：正文里有标签",
  ].join("\n"),
);

assert.equal(
  buildSrt(result, "bilingual"),
  [
    "1",
    "00:00:01,234 --> 00:00:05,677",
    "こんにちは",
    "你好",
    "",
    "2",
    "00:00:00,000 --> 00:01:05,004",
    "原文：正文里有标签",
  ].join("\n"),
);

assert.equal(
  buildSrt(result, "translation"),
  [
    "1",
    "00:00:01,234 --> 00:00:05,677",
    "你好",
    "",
    "2",
    "00:00:00,000 --> 00:01:05,004",
    "原文：正文里有标签",
  ].join("\n"),
);

console.log("export utility checks passed");
