const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.join(__dirname, "..");
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "asmr-trans-electron-smoke-"));
const electronPath = require("electron");

function runSmokePhase(phase, expectedMessage) {
  const result = spawnSync(electronPath, ["."], {
    cwd: root,
    env: {
      ...process.env,
      ASMR_TRANS_SMOKE_TEST: "1",
      ASMR_TRANS_SMOKE_PHASE: phase,
      ASMR_TRANS_USER_DATA_DIR: userDataDir,
      VITE_DEV_SERVER_URL: "",
    },
    encoding: "utf8",
    timeout: 30000,
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    const filteredStderr = result.stderr.includes("Smoke injected history upsert failure") ? "" : result.stderr;
    if (filteredStderr.trim()) {
      process.stderr.write(filteredStderr);
    }
  }
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Electron smoke phase ${phase} exited with status ${result.status}`);
  }
  if (!String(result.stdout || "").includes(expectedMessage)) {
    throw new Error(`Electron smoke phase ${phase} did not report success.`);
  }
}

try {
  runSmokePhase("full", "electron smoke checks passed");
  runSmokePhase("restart", "electron smoke restart checks passed");
  console.log("electron smoke script passed");
} finally {
  fs.rmSync(userDataDir, { recursive: true, force: true });
}
