const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function commandForPlatform(command) {
  return command;
}

function run(command, args) {
  console.log(`\n> ${[command, ...args].join(" ")}`);
  const spawnCommand = process.platform === "win32" && command === "npm" ? "cmd.exe" : commandForPlatform(command);
  const spawnArgs = process.platform === "win32" && command === "npm" ? ["/d", "/s", "/c", ["npm", ...args].join(" ")] : args;
  const result = spawnSync(spawnCommand, spawnArgs, {
    cwd: path.join(__dirname, ".."),
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

run("npm", ["run", "build"]);
run("npm", ["run", "test:logic"]);
run("node", ["scripts\\check-electron-smoke.cjs"]);
run("npm", ["run", "test:python-worker"]);
run("py", ["-3", "-m", "py_compile", "python\\worker.py"]);
run("node", ["--check", "electron\\main.cjs"]);
run("node", ["--check", "electron\\preload.cjs"]);
run("node", ["--check", "electron\\export-store.cjs"]);
run("node", ["--check", "electron\\history-store.cjs"]);
run("node", ["--check", "electron\\settings-store.cjs"]);

for (const fileName of fs.readdirSync(path.join(__dirname)).filter((name) => name.endsWith(".cjs"))) {
  run("node", ["--check", path.join("scripts", fileName)]);
}

run("git", ["diff", "--check"]);

console.log("\nverify checks passed");
