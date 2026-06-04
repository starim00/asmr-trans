# P0/P1/P2 Completion Audit

Last updated: 2026-06-04

This audit maps the current implementation to the explicit P0/P1/P2 scope. It is intentionally stricter than a test summary: each row names the requirement, the current evidence, and whether that evidence is enough to close the item.

## Status Legend

- `Proven`: implementation and verification evidence directly cover the requirement.
- `Partially proven`: implementation exists, but full end-to-end evidence is still indirect or environment-dependent.
- `Pending`: no sufficient current evidence.

## P0 Audit

| Requirement | Current evidence | Status |
| --- | --- | --- |
| Startup readiness checks are generated from tasks, settings, model status, hardware status, Whisper model, and compute device. | `src/readiness-utils.ts`; wired in `src/main.tsx`; covered by `npm run test:readiness`. | Proven |
| Empty AI API Key blocks queued unknown-language or Japanese translation tasks, while pure Chinese and completed history are not blocked. | `getTaskNeedsAi()` and `getReadinessChecks()` in `src/readiness-utils.ts`; covered by `scripts/check-readiness-utils.cjs`. | Proven |
| Explicit CUDA selection blocks when CTranslate2 CUDA is unavailable. | `getReadinessChecks()` checks `computeDevice === "cuda"` and `hardwareStatus.ctranslate2CudaAvailable`; covered by `npm run test:readiness`. | Proven |
| Missing Whisper model is warning-only because first run can download on demand. | Readiness warning `model`; covered by `npm run test:readiness`. | Proven |
| Auto device mode warns that CPU will be used when CUDA is unavailable, but does not block. | Readiness warning `cpu-fallback`; covered by `npm run test:readiness`; UI label verified from `src/main.tsx`. | Proven |
| `startQueue()` runs readiness preflight and refuses to start on blocking items. | `src/main.tsx` calls `getReadinessChecks()` before queue start; Electron smoke covers queue start paths; readiness blocking itself covered by logic test. | Proven |
| Top middle area exposes readiness entry/status. | Topbar readiness chips in `src/main.tsx` and `.readinessChips` CSS; browser preview noted in `docs/p0-p2-verification.md`. | Proven |
| Failed/canceled task can be requeued, clearing error/progress and preserving old result until overwritten. | `src/queue-utils.ts`; `requeueTask()` and bulk requeue in `src/main.tsx`; covered by `npm run test:queue` and Electron smoke. | Proven |
| Failed Japanese task with source segments can retry translation without rerunning Whisper. | `src/translation-retry-utils.ts`; `retryTaskTranslation()` calls `startTaskTranslation(task.id, task.result)`; covered by `npm run test:translation-retry` and Electron smoke state transition. | Proven |
| Translation retry sets running/translate progress and returns to failed on error with visible message. | `markTaskTranslationRetryRunning()` and `onTranslateError` in `src/main.tsx`; logic and smoke cover retry running state; worker translate failure visibility is covered indirectly by existing error handler. | Proven |
| Edit auto-save shows saving/saved/failed in the result header without blocking editing. | `editSaveStates` and `persistEditedTask()` in `src/main.tsx`; covered by Electron smoke success and injected failure. | Proven |
| TXT/SRT export uses edited content and existing export IPC. | `buildTxt()`/`buildSrt()` are fed from selected task state; Electron smoke edits a textarea and verifies selected/batch exported files contain edited text. | Proven |
| Top command bar splits into brand/current scheme, progress/readiness, and primary actions. | `src/main.tsx` topbar structure and `src/styles.css`; browser preview at 1280/1120/980 documented. | Proven |
| Batch TXT/SRT export moved from topbar to result header and grouped with selected exports. | `src/main.tsx` result header `exportActions`; Electron smoke clicks selected and batch export buttons there. | Proven |
| Source-visible mojibake in touched UI text is fixed. | `npm run test:text` scans maintained source/docs/scripts for suspicious fragments; `src/main.tsx` readiness labels are normal UTF-8. | Proven |
| Persistent history deletion survives restart and cannot be resurrected by async upsert. | `src/history-utils.ts`, `electron/history-store.cjs`, `src/main.tsx`; covered by `npm run test:history`, `npm run test:history-ui`, and Electron smoke restart. | Proven |

## P1 Audit

| Requirement | Current evidence | Status |
| --- | --- | --- |
| Queue search by task name/path. | `src/queue-utils.ts` and task search UI in `src/main.tsx`; covered by `npm run test:queue`. | Proven |
| Queue status filters and reverse display preserve stable added order. | `filterQueueTasks()` in `src/queue-utils.ts`; covered by `npm run test:queue`; history hydration sorts by added time in `src/main.tsx`. | Proven |
| Bulk clear completed and failed/canceled tasks, with history delete for persisted items. | `clearTasksByStatus()` in `src/main.tsx`; `getClearableTasks()` in `src/queue-utils.ts`; history delete covered by history tests and Electron smoke. | Proven |
| Bulk requeue failed/canceled tasks. | `requeueFailedTasks()` in `src/main.tsx`; `requeueTaskState()` in `src/queue-utils.ts`; covered by `npm run test:queue`. | Proven |
| Result segment search by source, translation, index, or timestamp. | `src/segment-list-utils.ts`; wired in `src/main.tsx`; covered by `npm run test:segment-list`. | Proven |
| Result segment untranslated filter. | `filterSegmentItems()` in `src/segment-list-utils.ts`; covered by `npm run test:segment-list`. | Proven |
| Result segment jump and pagination/virtualized loading behavior. | `getJumpTargetIndex()` and `getVisibleCountForJump()` in `src/segment-list-utils.ts`; wired in `src/main.tsx`; covered by `npm run test:segment-list`. | Proven |
| Timestamp copy action. | `copySegmentTimestamp()` in `src/main.tsx`; UI button in each segment; formatting covered by `npm run test:export`. | Proven |
| Settings summary block shows current model/device/AI/enhancement/export state. | `SettingsDrawer` summary in `src/main.tsx`; Electron smoke restart verifies persisted summary values. | Proven |
| History loading is idempotent and deduped; startup does not auto-select hydrated history. | `historyLoadedRef`, `taskIdentity()`, and no selection side effect in `src/main.tsx`; Electron smoke restart verifies hydration state. | Proven |

## P2 Audit

| Requirement | Current evidence | Status |
| --- | --- | --- |
| Segment split preserves timing and text, supports cursor-aware split. | `src/segment-edit-utils.ts`; `splitSegment()` in `src/main.tsx`; covered by `npm run test:segments`. | Proven |
| Segment merge with next preserves text and timing. | `mergeEditableSegments()` and `mergeSegmentWithNext()`; covered by `npm run test:segments`. | Proven |
| Export modes for bilingual/source-only/translation-only TXT and SRT. | `src/export-utils.ts`, UI controls in `src/main.tsx`, settings persistence; covered by `npm run test:export` and `npm run test:settings`. | Proven |
| Batch export avoids overwriting by suffixing duplicate or existing names. | `electron/export-store.cjs`; covered by `npm run test:export-store`. | Proven |
| Export settings persist across restart. | `electron/settings-store.cjs`, `src/main.tsx`; covered by `npm run test:settings` and Electron smoke restart. | Proven |
| Python worker smoke covers local media inspection, preprocessing, transcription protocol, and OpenAI-compatible translation protocol. | `python/worker.py` smoke modes and `scripts/check-python-worker-smoke.cjs`; covered by `npm run test:python-worker`. | Proven |
| Optional real Whisper inference can be checked when a local cached model exists. | `scripts/check-real-whisper-smoke.cjs`; local run passed on 2026-06-04 with cached `small` on CPU/int8. This proves the worker-level real model path, not the full Electron UI path. | Partially proven |
## Final Evidence Before Closing Goal

The implementation and automated verification cover the stated P0/P1/P2 product behavior at source, unit, Electron smoke, and worker-protocol levels. The remaining real-use scenarios were manually verified by the user on 2026-06-05, and no functional blockers remain.

- Real Electron UI full transcription with a real media file, configured model, and configured device: user verified.
- Real Electron UI retry of a Japanese translation failure against a user-configured external AI endpoint: user verified as part of overall validation.
- Real native dialog export using user-chosen directories outside the smoke `userData` path: user verified as part of overall validation.

The only follow-up from that validation was a UX issue: the lower-left error alert stayed visible indefinitely. That has been addressed with auto-dismiss and a manual close button.
