const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.join(__dirname, "..");
const modelName = process.env.ASMR_TRANS_REAL_WHISPER_MODEL || "small";
const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
const modelsDir = path.join(appData, "asmr-trans", "models");
const whisperDir = path.join(modelsDir, "whisper");
const expectedCacheDir = path.join(whisperDir, `models--Systran--faster-whisper-${modelName}`);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "asmr-trans-real-whisper-"));
const wavPath = path.join(tempDir, "real-whisper-smoke.wav");

function writeTestWav(filePath) {
  const sampleRate = 16000;
  const durationSeconds = 1;
  const samples = Math.floor(sampleRate * durationSeconds);
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < samples; index += 1) {
    const t = index / sampleRate;
    const envelope = Math.min(index / 800, (samples - index) / 800, 1);
    const value = Math.round(Math.sin(2 * Math.PI * 440 * t) * 2000 * Math.max(envelope, 0));
    buffer.writeInt16LE(value, 44 + index * 2);
  }

  fs.writeFileSync(filePath, buffer);
}

try {
  if (!fs.existsSync(expectedCacheDir)) {
    throw new Error(`Cached faster-whisper ${modelName} model was not found: ${expectedCacheDir}`);
  }

  writeTestWav(wavPath);
  const request = {
    audioPath: wavPath,
    whisperModel: modelName,
    computeDevice: "cpu",
    modelsDir,
    translateAfterTranscribe: false,
    audioEnhancement: { enabled: false },
    whisperAdvanced: {
      beamSize: 1,
      vadFilter: false,
      noSpeechThreshold: 0.6,
      conditionOnPreviousText: false,
    },
  };

  const result = spawnSync("py", ["-3", "python\\worker.py"], {
    cwd: root,
    input: JSON.stringify(request),
    encoding: "utf8",
    timeout: 180000,
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Real Whisper smoke exited with status ${result.status}`);
  }

  const messages = String(result.stdout || "")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert.ok(messages.some((message) => message.type === "progress" && message.payload.stage === "model"));
  assert.ok(messages.some((message) => message.type === "progress" && message.payload.stage === "transcribe"));
  const done = messages.find((message) => message.type === "done");
  assert.ok(done, "real Whisper smoke should emit done");
  assert.equal(done.payload.computeDevice, "cpu");
  assert.ok(Array.isArray(done.payload.segments));

  console.log("real Whisper smoke checks passed");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
