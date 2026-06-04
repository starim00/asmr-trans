# P0/P1/P2 Verification Notes

Last updated: 2026-06-04

This note tracks the current evidence for the P0/P1/P2 implementation work. It is not a release sign-off by itself; Electron real-data media scenarios still need to be run before closing the full goal.

For the requirement-by-requirement audit, see `docs/p0-p2-completion-audit.md`.

## Automated Evidence

Run the current source validation gate:

```powershell
npm run verify
```

Run all no-Electron logic checks:

```powershell
npm run test:logic
```

Run the Electron smoke check directly:

```powershell
npm run test:electron-smoke
```

This direct command builds the renderer before launching Electron. `npm run verify` already runs `npm run build`, so it calls the smoke script against that freshly built output. The smoke script launches Electron twice against the same temporary `userData`: a full UI workflow phase and a restart verification phase.

Run the Python worker media smoke directly:

```powershell
npm run test:python-worker
```

Run the optional real Whisper model smoke when a faster-whisper model is already cached locally:

```powershell
npm run test:real-whisper
```

Current checks:

- `test:electron-smoke`: real Electron startup smoke with temporary `userData`.
  Covers built renderer load, preload API availability, settings persistence, history upsert, persistent history delete, read-after-delete behavior through the Electron main process, seeded history hydration into the React task list, UI delete persistence through the real task remove button, UI segment edit auto-save through the real result textarea plus success and failure feedback, failed-task requeue through the real inline action, Japanese translation retry entering the translate running state without rerunning Whisper, add-file/start/pause/resume/cancel/requeue/restart/done queue controls with smoke worker events, selected/batch TXT/SRT export buttons writing current edited content, restart-time history hydration with the deleted task absent and last successfully saved edited task present, and settings summary values after restart.
- `test:readiness`: startup readiness rules.
  Covers AI-key blocking for queued unknown-language tasks, pure Chinese non-blocking behavior, done history non-blocking behavior, explicit CUDA blocking, Auto CPU fallback warning, model-download warning, and summary priority.
- `test:history`: persistent history storage.
  Covers upsert, duplicate replacement, persistent delete, fallback delete by file path and completion time, missing delete, malformed JSON fallback, and the 200-item cap.
- `test:history-ui`: frontend history identity and deletion rules.
  Covers hydrated history queue IDs, persisted history task construction, multi-candidate delete request derivation, and upsert/delete race handling.
- `test:queue`: queue tools and failure recovery state rules.
  Covers search, status filters, reverse display, done/failed/canceled grouping, clearable task selection, and failed/canceled requeue state reset.
- `test:segment-list`: result panel list tools.
  Covers segment search, untranslated filtering, visible pagination, and jump target calculation.
- `test:segments`: segment edit rules.
  Covers cursor split, midpoint split, short-text refusal, timestamp split ratios, translation split, and merge-with-next behavior.
- `test:export`: TXT/SRT export modes.
  Covers bilingual/source-only/translation-only content, timestamp formatting, translation fallback, and SRT label handling.
- `test:export-store`: Electron export storage rules.
  Covers file-name sanitization, exportable item filtering, duplicate batch filename suffixing, and existing file collision behavior.
- `test:settings`: Electron settings storage and compatibility.
  Covers default settings, export option merging, legacy TTS migration, settings read/write, and malformed JSON fallback.
- `test:text`: source and document text integrity.
  Covers Unicode replacement characters and known mojibake fragments in maintained source/document files.
- `test:translation-retry`: translation retry task rules.
  Covers failed Japanese retry eligibility, non-Japanese/non-failed/empty-segment exclusion, and retry-running progress state.
- `test:python-worker`: Python worker local media path.
  Generates a temporary WAV and covers worker-side media inspection, audio decoding, audio enhancement preprocessing, transcribe progress events, done payload shape through a fake Whisper model, and translate mode against a local fake OpenAI-compatible endpoint without downloading real Whisper models or calling external APIs.
- `test:real-whisper`: optional local real-model smoke.
  Requires a cached faster-whisper model under Electron `userData`; on this machine, `small` was cached and the check passed on 2026-06-04 using CPU/int8 with a generated 1-second WAV. It is intentionally not part of default `npm run verify` because other machines may not have a cached model.

Expanded standard validation commands:

```powershell
npm run build
npm run test:logic
npm run test:electron-smoke
npm run test:python-worker
py -3 -m py_compile python\worker.py
node --check electron\main.cjs
node --check electron\preload.cjs
node --check electron\export-store.cjs
node --check electron\history-store.cjs
node --check electron\settings-store.cjs
Get-ChildItem scripts\*.cjs | ForEach-Object { node --check $_.FullName }
git diff --check
```

## Browser Preview Evidence

Preview URL: `http://127.0.0.1:4173/`

Verified in the in-app browser:

- Top command bar renders brand/current scheme, readiness chips, and primary actions.
- Readiness chips use human-facing labels such as `首次运行会下载模型` and `自动改用 CPU`.
- Task queue tools render status filters and bulk actions.
- Result header renders TXT/SRT export mode controls and batch export actions.
- Settings summary block is present.
- At `1280px`, `1120px`, and `980px`, there is no horizontal overflow and no button text overflow.
- At `1120px`, the top command bar folds to one column.
- At `980px`, the main queue/result workspace folds to one column.

## Source Evidence

- Startup readiness rules: `src/readiness-utils.ts`, wired from `src/main.tsx`.
- Persistent history delete: `electron/history-store.cjs`, `electron/main.cjs`, `electron/preload.cjs`, and `src/main.tsx`.
- Queue filters and requeue rules: `src/queue-utils.ts`, wired from `src/main.tsx`.
- Translation retry rules: `src/translation-retry-utils.ts`, wired from `src/main.tsx`.
- Result segment search/filter/jump rules: `src/segment-list-utils.ts`, wired from `src/main.tsx`.
- Segment split/merge rules: `src/segment-edit-utils.ts`, wired from `src/main.tsx`.
- Export modes: `src/export-utils.ts`, wired from `src/main.tsx`.
- Batch export file naming: `electron/export-store.cjs`, wired from `electron/main.cjs`.
- Export settings persistence: `src/vite-env.d.ts`, `src/main.tsx`, `electron/settings-store.cjs`, and `electron/main.cjs`.
- Electron startup smoke: `scripts/check-electron-smoke.cjs` and `ASMR_TRANS_SMOKE_TEST=1` handling in `electron/main.cjs`.
- Python worker media/transcribe/translate smoke: `scripts/check-python-worker-smoke.cjs`, `python/worker.py --smoke-media`, `python/worker.py --smoke-transcribe`, and local fake OpenAI-compatible translation server.
- Optional real Whisper model smoke: `scripts/check-real-whisper-smoke.cjs`.
- Top command bar and compact desktop layout: `src/main.tsx` and `src/styles.css`.
- Maintenance handoff: `AGENTS.md`.

## Remaining Manual Evidence Needed

These scenarios require the packaged or dev Electron app with real userData/history/settings and real or controlled media/task data. The Electron smoke covers the main-process persistence path, restart behavior, and key user-visible UI paths with temporary `userData`, but it does not replace these real-data workflow checks:

- Trigger a requeued failed task with real media and confirm it runs normally end-to-end from the Electron UI. The UI requeue and queue-control states are covered by Electron smoke, and local real Whisper model loading/transcription is covered by optional `test:real-whisper` on this machine.
- Trigger a Japanese translation failure after real Whisper segments exist, click `重试翻译`, and confirm the real configured external API path completes or fails with visible feedback. The UI retry transition into translate running state is covered by Electron smoke, and worker translate request/response parsing is covered by `test:python-worker` against a local fake OpenAI-compatible endpoint.
- Verify selected and batch TXT/SRT export with real dialogs/user-chosen directories. Edited-content export through the UI buttons is covered by Electron smoke with temporary `userData`; all formatting modes are covered by `test:export`.
- Verify full transcription end-to-end from the Electron UI with real media and the configured model/device. UI file add/start/cancel/pause/resume controls are covered by Electron smoke, worker media/protocol paths are covered by `test:python-worker`, and real local Whisper CPU inference is covered by optional `test:real-whisper` on this machine.

Do not mark the overall P0/P1/P2 goal complete until the automated checks pass and the remaining manual evidence above is either verified or explicitly descoped.
