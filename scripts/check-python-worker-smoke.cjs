const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const root = path.join(__dirname, "..");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "asmr-trans-worker-smoke-"));
const wavPath = path.join(tempDir, "smoke.wav");

function writeTestWav(filePath) {
  const sampleRate = 16000;
  const durationSeconds = 0.25;
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
    const value = Math.round(Math.sin(2 * Math.PI * 440 * t) * 12000);
    buffer.writeInt16LE(value, 44 + index * 2);
  }

  fs.writeFileSync(filePath, buffer);
}

function parseWorkerMessages(stdout) {
  return String(stdout || "")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function runFakeTranslationServer() {
  const requests = [];
  const server = http.createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      requests.push({
        url: request.url,
        authorization: request.headers.authorization || "",
        body: JSON.parse(body || "{}"),
      });
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify([
                { id: 0, translation: "烟雾翻译一" },
                { id: 1, translation: "烟雾翻译二" },
              ]),
            },
          },
        ],
      }));
    });
  });
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}/v1`,
        close: () => new Promise((closeResolve) => server.close(closeResolve)),
        requests,
      });
    });
  });
}

function spawnWorker(args, input = "") {
  return new Promise((resolve, reject) => {
    const child = spawn("py", ["-3", "python\\worker.py", ...args], {
      cwd: root,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Python worker timed out for args: ${args.join(" ")}`));
    }, 30000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
    if (input) {
      child.stdin.write(input, "utf8");
    }
    child.stdin.end();
  });
}

async function main() {
try {
  writeTestWav(wavPath);
  const hardwareResult = spawnSync("py", ["-3", "python\\worker.py", "--hardware"], {
    cwd: root,
    encoding: "utf8",
    timeout: 30000,
  });

  if (hardwareResult.stdout) process.stdout.write(hardwareResult.stdout);
  if (hardwareResult.stderr) process.stderr.write(hardwareResult.stderr);
  if (hardwareResult.error) throw hardwareResult.error;
  if (hardwareResult.status !== 0) {
    throw new Error(`Python worker hardware check exited with status ${hardwareResult.status}`);
  }
  const hardware = JSON.parse(String(hardwareResult.stdout || "").trim());
  assert.equal(typeof hardware.ctranslate2CudaSmokeOk, "boolean");
  assert.ok(Array.isArray(hardware.ctranslate2SupportedCudaComputeTypes));
  assert.equal(typeof hardware.cudaRuntime, "object");
  assert.equal(typeof hardware.cudaRuntime.source, "string");

  const mediaResult = spawnSync("py", ["-3", "python\\worker.py", "--smoke-media", wavPath], {
    cwd: root,
    encoding: "utf8",
    timeout: 30000,
  });

  if (mediaResult.stdout) process.stdout.write(mediaResult.stdout);
  if (mediaResult.stderr) process.stderr.write(mediaResult.stderr);
  if (mediaResult.error) throw mediaResult.error;
  if (mediaResult.status !== 0) {
    throw new Error(`Python worker media smoke exited with status ${mediaResult.status}`);
  }

  const output = JSON.parse(String(mediaResult.stdout || "").trim());
  assert.equal(output.ok, true);
  assert.equal(output.audioStreamCount, 1);
  assert.ok(output.duration > 0, "duration should be detected");
  assert.ok(output.sampleCount > 0, "samples should be decoded");
  assert.equal(output.enhancedSampleCount, output.sampleCount);

  const transcribeResult = spawnSync("py", ["-3", "python\\worker.py", "--smoke-transcribe", wavPath], {
    cwd: root,
    encoding: "utf8",
    timeout: 30000,
  });

  if (transcribeResult.stdout) process.stdout.write(transcribeResult.stdout);
  if (transcribeResult.stderr) process.stderr.write(transcribeResult.stderr);
  if (transcribeResult.error) throw transcribeResult.error;
  if (transcribeResult.status !== 0) {
    throw new Error(`Python worker transcribe smoke exited with status ${transcribeResult.status}`);
  }

  const messages = parseWorkerMessages(transcribeResult.stdout);
  assert.ok(messages.some((message) => message.type === "progress" && message.payload.stage === "media"));
  assert.ok(messages.some((message) => message.type === "progress" && message.payload.stage === "transcribe"));
  const done = messages.find((message) => message.type === "done");
  assert.ok(done, "transcribe smoke should emit done");
  assert.equal(done.payload.detectedLanguage, "zh");
  assert.equal(done.payload.computeDevice, "cpu");
  assert.deepEqual(done.payload.segments, [
    { start: 0, end: 1, sourceText: "smoke transcription", translatedText: null },
  ]);

  const fakeServer = await runFakeTranslationServer();
  try {
    const translatePayload = {
      mode: "translate",
      taskId: "worker-smoke-translate",
      detectedLanguage: "ja",
      computeDevice: "cpu",
      segments: [
        { start: 0, end: 1, sourceText: "テスト一" },
        { start: 1, end: 2, sourceText: "テスト二" },
      ],
      aiTranslationConfig: {
        baseUrl: fakeServer.baseUrl,
        apiKey: "worker-smoke-key",
        model: "worker-smoke-model",
        contextWindow: 2,
        contextOverlap: 0,
        retries: 0,
        timeoutSeconds: 10,
      },
    };
    const translateResult = await spawnWorker([], JSON.stringify(translatePayload));

    if (translateResult.stdout) process.stdout.write(translateResult.stdout);
    if (translateResult.stderr) process.stderr.write(translateResult.stderr);
    if (translateResult.error) throw translateResult.error;
    if (translateResult.status !== 0) {
      throw new Error(`Python worker translate smoke exited with status ${translateResult.status}`);
    }

    const translateMessages = parseWorkerMessages(translateResult.stdout);
    assert.ok(translateMessages.some((message) => message.type === "progress" && message.payload.stage === "translate"));
    const translateDone = translateMessages.find((message) => message.type === "done");
    assert.ok(translateDone, "translate smoke should emit done");
    assert.equal(translateDone.payload.detectedLanguage, "ja");
    assert.deepEqual(
      translateDone.payload.segments.map((segment) => segment.translatedText),
      ["烟雾翻译一", "烟雾翻译二"],
    );
    assert.equal(fakeServer.requests.length, 1);
    assert.equal(fakeServer.requests[0].url, "/v1/chat/completions");
    assert.equal(fakeServer.requests[0].authorization, "Bearer worker-smoke-key");
    assert.equal(fakeServer.requests[0].body.model, "worker-smoke-model");
  } finally {
    await fakeServer.close();
  }

  console.log("python worker smoke checks passed");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
