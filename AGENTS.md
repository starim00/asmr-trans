# AGENTS.md

## Project Overview

ASMR Trans is a Windows desktop transcription client for local batch processing of audio and video files. The current stack is:

- Electron main process for desktop integration, file dialogs, settings, exports, Python worker orchestration, and packaging.
- React + Vite frontend for the queue UI, editable transcription results, settings drawer, progress display, and exports.
- Python worker for local media inspection, audio preprocessing, faster-whisper transcription, and OpenAI-compatible LLM translation.

The product goal is practical ASMR/audio transcription:

- Chinese audio/video: output timestamped Chinese text.
- Japanese audio/video: output timestamped Japanese source text plus Chinese translation through an LLM translation API.
- Batch queue: add multiple files, process sequentially, edit results, export TXT/SRT, and keep local history.

## Current Feature Surface

- Batch audio/video queue.
- Supported formats: `mp3`, `wav`, `m4a`, `flac`, `ogg`, `aac`, `mp4`, `mkv`, `mov`, `webm`, `avi`, `wmv`.
- Queue states: queued, running, done, failed, canceled.
- Queue controls: start, pause, resume, cancel, remove.
- Start readiness checks block likely translation tasks when the AI API key is missing, and block explicit CUDA mode when CTranslate2 CUDA smoke checks fail. Missing Whisper models and `auto` CPU fallback are warnings, not blockers.
- Transcription is intentionally serialized through one Whisper worker, while LLM translation can run in parallel after each Japanese task finishes transcription.
- Failed or canceled tasks can be requeued without losing existing results. Failed Japanese tasks with source segments can retry AI translation without rerunning Whisper.
- Task ordering should be stable by `addedAt`; history must load in add order, with a UI toggle for reverse display.
- History loading must be idempotent. React development mode may run effects twice under `StrictMode`, so guard asynchronous history hydration and dedupe by stable task identity.
- Do not auto-select hydrated history on startup. Result textareas should render and auto-resize only after the user selects a task or the queue focuses a running task.
- History deletion must be persistent: removing completed/history tasks should call the Electron history delete IPC and remove the entry from `userData/history.json`, including bulk clear actions.
- The queue panel supports task search, status filters, clearing completed tasks, clearing failed/canceled tasks, and bulk requeue for failed/canceled tasks.
- Editable segmented results.
- Result editing auto-saves to history and shows lightweight save feedback in the result header.
- Result tools include segment search, untranslated-only filtering, jump-to-segment, timestamp copy, split segment, and merge with next segment.
- Task history stored in Electron `userData/history.json`.
- History storage logic lives in `electron/history-store.cjs` so persistent upsert/delete behavior can be tested outside Electron.
- Settings stored in Electron `userData/settings.json`.
- Window size and maximized state are stored in Electron settings and restored on startup.
- TXT and SRT export for the selected task. Export uses edited segment content.
- Batch TXT and SRT export for completed tasks. Single and batch export share the same TXT/SRT export mode settings.
- TXT/SRT export modes support bilingual, source-only, and translation-only output.
- Whisper model selection: `tiny`, `base`, `small`, `medium`, `large-v3`.
- Compute device selection: `auto`, `cpu`, `cuda`.
- Audio enhancement options for low-volume ASMR: normalization, compression, lightweight noise gate, mono preprocessing.
- Recognition presets that adjust enhancement and Whisper advanced parameters, but must not change the selected Whisper model.
- OpenAI-compatible AI translation with configurable base URL, API key, model, prompts, context window, retries, timeout, and independent AI proxy.
- Dependency/model download proxy, separate from AI proxy.
- CUDA runtime dependencies are not bundled. System CUDA is preferred; the settings drawer can install/repair NVIDIA CUDA 12 runtime wheels inside the app Python environment and the app only injects those DLL paths into Python worker subprocesses.
- The settings drawer includes a compact current-configuration summary for model, device, AI, audio enhancement, and export modes.
- Progress display with realtime speed factor, ETA, elapsed time, and per-stage timing.

## Important Development Rules

- Keep the app local-first. Do not introduce online services except the explicitly configured LLM translation endpoint.
- Do not reintroduce local NLLB translation unless the user explicitly asks for it. The current translation path is LLM-only.
- Preserve the queue model: Whisper transcription should stay single-worker/serialized by default to avoid GPU contention, while LLM translation may run concurrently across completed Japanese transcription tasks.
- Recognition presets must not alter the Whisper model. Model choice belongs to the user.
- ASMR `initial_prompt` must remain optional and disabled by default. Only pass it to Whisper when the user fills it.
- Avoid forcing proxy defaults. Network proxy and AI proxy are user-configured and separate.
- Prefer preserving compatibility over aggressive defaults. Audio enhancement is off by default.
- Do not build release packages after every small UI/code change unless the user asks for packaging.
- When packaging, maintain the version number first.
- Keep release artifacts out of git.

## Development Commands

Use PowerShell from the project root:

```powershell
npm run dev
npm run verify
npm run build
npm run test:electron-smoke
npm run test:logic
npm run test:export-store
npm run test:export
npm run test:history
npm run test:history-ui
npm run test:python-worker
npm run test:queue
npm run test:real-whisper
npm run test:readiness
npm run test:segment-list
npm run test:segments
npm run test:settings
npm run test:text
npm run test:translation-retry
npm run dist
npm run pack
py -3 -m py_compile python\worker.py
node --check electron\main.cjs
node --check electron\preload.cjs
```

Notes:

- `npm run dev` uses Vite on `127.0.0.1:5173` and starts Electron.
- If port `5173` is occupied, check for a stale Vite process:

```powershell
Get-NetTCPConnection -LocalPort 5173
Get-CimInstance Win32_Process -Filter "ProcessId = <PID>" | Select-Object ProcessId,CommandLine
Stop-Process -Id <PID>
```

- On this Windows machine, `py -3` is the reliable Python launcher.
- `npm run verify` runs the current source validation gate: build, all no-Electron logic checks, Electron smoke, Python compile, Electron/script syntax checks, and `git diff --check`.
- `npm run test:electron-smoke` builds the renderer, launches Electron with temporary `userData`, verifies settings persistence, history upsert/delete persistence, renderer UI smoke paths, and preload API availability, then exits automatically.
- `npm run test:logic` runs all no-Electron logic checks in one pass.
- No-Electron TypeScript logic check scripts should use `scripts/load-ts-module.cjs` instead of duplicating TypeScript transpile boilerplate.
- `npm run test:export-store` verifies Electron export file-name sanitization, exportable item filtering, and duplicate batch filename suffixing without launching Electron.
- `npm run test:export` verifies TXT/SRT export formatting, bilingual/source-only/translation-only modes, timestamp formatting, and fallback behavior without launching Electron.
- `npm run test:history` verifies history file upsert, persistent delete, duplicate replacement, malformed JSON fallback, and the 200-item cap without launching Electron.
- `npm run test:history-ui` verifies frontend history identity, delete-id derivation, and upsert/delete race handling rules without launching Electron.
- `npm run test:python-worker` generates a temporary WAV and verifies the Python worker can inspect, decode, enhance media, run the transcribe JSON protocol with a fake Whisper model, and run translate mode against a local fake OpenAI-compatible endpoint without downloading real Whisper models or calling external APIs.
- `npm run test:queue` verifies task search/filter ordering, done/failed/canceled group selection, clearable task selection, and requeue state reset behavior without launching Electron.
- `npm run test:real-whisper` is an optional local-machine check that requires a cached faster-whisper model under Electron `userData`; it runs a short CPU transcription through the real model and is not part of default `npm run verify`.
- `npm run test:readiness` verifies startup readiness rules, including AI-key blocking, explicit CUDA blocking, Auto CPU fallback warnings, model download warnings, and ready summary behavior without launching Electron.
- `npm run test:segment-list` verifies result segment search, untranslated filtering, visible pagination, and jump target calculation without launching Electron.
- `npm run test:segments` verifies segment split/merge rules, cursor and midpoint splitting, timestamp split ratios, short text refusal, and bilingual merge behavior without launching Electron.
- `npm run test:settings` verifies Electron settings defaults, export option merging, legacy TTS migration, read/write behavior, and malformed JSON fallback without launching Electron.
- `npm run test:text` verifies source/document text does not contain replacement characters or known mojibake fragments.
- `npm run test:translation-retry` verifies failed Japanese translation retry eligibility and retry-running task state without launching Electron.

## Release Process

Before a release:

1. Update `package.json` and `package-lock.json` version.
   Prefer:

   ```powershell
   npm version 0.x.y --no-git-tag-version
   ```

2. Commit the version bump.
3. Build the installer:

   ```powershell
   npm run dist
   ```

4. Build the portable zip from the latest `release\win-unpacked`:

   ```powershell
   $release = Resolve-Path 'release'
   $source = Join-Path $release 'win-unpacked'
   $portableDir = Join-Path $release 'ASMR Trans Portable 0.x.y'
   $zipPath = Join-Path $release 'ASMR Trans Portable 0.x.y.zip'
   if (Test-Path -LiteralPath $portableDir) { Remove-Item -LiteralPath $portableDir -Recurse -Force }
   if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
   Copy-Item -LiteralPath $source -Destination $portableDir -Recurse
   Compress-Archive -LiteralPath $portableDir -DestinationPath $zipPath -CompressionLevel Optimal
   ```

5. Clean old release artifacts only after verifying paths stay inside `release`.

Current release outputs should look like:

- `release\ASMR Trans Setup <version>.exe`
- `release\ASMR Trans Portable <version>.zip`
- `release\ASMR Trans Portable <version>\`

## Packaging And Runtime Notes

- The packaged app includes a lightweight Python runtime under `resources\runtime\python`.
- Models are not bundled.
- Whisper models are stored under Electron `userData`, typically:

  ```text
  C:\Users\<user>\AppData\Roaming\asmr-trans\models
  ```

- Settings and history are also under Electron `userData`.
- Updating a portable app generally does not require redownloading models.
- Python dependencies may reinstall if they were installed into the bundled portable Python environment. A future improvement is to install Python packages into `userData/python-packages` and add it to `PYTHONPATH`.

## GPU And Dependency Lessons

- RTX/CUDA support depends on both faster-whisper/CTranslate2 and the local CUDA runtime DLLs.
- Normal Python dependencies are installed from `python/requirements.txt`. Do not reintroduce a misleading `requirements-cuda.txt`; CUDA runtime packages are managed by the Electron CUDA install/repair flow.
- Common CUDA failure:

  ```text
  cublas64_12.dll is not found or cannot be loaded
  ```

  This means CUDA devices may be visible, but CUDA/cuBLAS/cuDNN runtime DLLs are missing from `PATH`.

- PyTorch/NLLB was removed from the active translation path. Do not spend time debugging PyTorch translation unless local translation is intentionally reintroduced.
- `faster-whisper`, `av`, `requests[socks]`, and `numpy` are required Python dependencies.
- Dependency download failures are often network/proxy/SSL related. Keep error messages visible and actionable.
- Dependency/model download proxy and AI translation proxy are intentionally separate because domestic LLM providers may not need a proxy.

## UI And UX Guidance

- This is a desktop tool, not a marketing page. Prioritize dense but readable controls, stable panel dimensions, and low visual noise.
- Keep the main layout focused:
  - top command bar
  - task queue
  - editable transcription result
  - settings drawer
- Keep the top command bar split into three areas: brand/current scheme summary, readiness or global progress, and primary actions.
- Keep queue-wide tools in the task queue panel, and result/segment tools in the result panel header or body.
- Avoid large hero-style whitespace.
- Keep task switching predictable; result scroll position should reset to the top when switching tasks.
- Buttons should use icons where useful and remain visually compact.
- Settings belong in the drawer, not in a permanently scrolling sidebar.
- Result export should operate on edited content.
- Batch export should prompt for a directory once and avoid overwriting by auto-suffixing duplicate names.
- P0/P1/P2 verification evidence and remaining manual scenarios are tracked in `docs/p0-p2-verification.md`.

## Encoding Guidance

- Source files are UTF-8.
- PowerShell may display Chinese text incorrectly depending on code page. Do not assume source corruption from PowerShell mojibake alone.
- When verifying Chinese strings, prefer Node or explicit UTF-8 reads over plain PowerShell rendering.
- Existing UI strings often use Unicode escapes to avoid accidental display/encoding issues.

## Git Hygiene

- Commit meaningful source changes.
- Do not commit `dist/`, `release/`, `win-unpacked`, portable zips, model files, Python caches, or large wheels.
- Before committing, run at least:

```powershell
npm run verify
```

Expanded validation commands:

```powershell
npm run build
npm run test:electron-smoke
npm run test:logic
npm run test:export-store
npm run test:export
npm run test:history
npm run test:history-ui
npm run test:python-worker
npm run test:queue
npm run test:real-whisper
npm run test:readiness
npm run test:segment-list
npm run test:segments
npm run test:settings
npm run test:text
npm run test:translation-retry
py -3 -m py_compile python\worker.py
node --check electron\main.cjs
node --check electron\preload.cjs
```

## Maintenance Reminder

Update this `AGENTS.md` whenever the project architecture, release process, runtime dependency strategy, model strategy, or major UX workflow changes. Treat it as the handoff document for future agents and for your future self.
