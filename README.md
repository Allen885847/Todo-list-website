# Todo List Website

A responsive, AI-powered to-do list built with HTML, CSS, JavaScript, and a small Node.js server.

The Online application uses account-scoped Cloudflare D1/R2 storage and email/password authentication. The desktop Shortcut remains login-free and uses its existing local file and browser storage; these are separate applications.

Release: **V3.3 — Task Insights and Custom Ordering**.

V3.3 adds three statistics charts: Extra & Early Tasks, Finish Time, and Completion Rate. It also supports custom ordering of individual tasks and entire subject groups, helping users organize their work more easily.

## Features

- Renameable list title
- Add one or many tasks using typed English, Mandarin Chinese, or mixed-language natural language
- Schedule the same task on one date, every day in an inclusive date range, or several individually selected dates through AI or manual entry
- Record tasks with the browser microphone and automatically transcribe them without showing live text
- Voice recordings are converted to 16 kHz mono WAV in the browser and transcribed by Doubao Streaming Speech Recognition 2.0 through the local backend; DeepSeek does not transcribe audio
- A reactive waveform, recording timer, stop control, and cancel control make recording state clear
- DeepSeek separates actionable work, corrects and translates task titles, resolves task-specific dates, and chooses one relevant emoji
- Review, edit, remove, and confirm generated tasks before saving
- Ambiguous dates are flagged and must be confirmed in the preview
- Task titles use consistent, concise noun phrases without leading action verbs for both single-task and multi-task input
- Generated tasks are initially sorted by due date, earliest first
- Within each date section, tasks are grouped under editable subject headings; English Language and English Literature remain separate subjects
- Add, edit, or remove optional custom task labels; AI marks time-permitting work with the default `Extra` label and preserves explicitly requested label wording
- Show task labels as distinct badges in both the To-Do List and Calendar, alongside the Past Due badge when both apply
- Copy the current list as readable plain text containing its title and every displayed task, with emoji removed and a blank line between tasks
- Open a dedicated calendar page from the To-Do List and switch between Day, Week, Month, and Year views while preserving the selected date
- See tasks on their due dates, edit task details from the calendar, and keep undated tasks exclusively in the To-Do List
- Add, edit, and delete distinct personal events with manual fields or an editable DeepSeek-powered natural-language preview
- Add optional event start and end times through either input method, while leaving untimed events all-day
- Submit described events with Enter while keeping Shift+Enter for new lines and respecting IME composition
- Distinguish weekends with subtle theme-aware shading and holidays with a consistent, stronger shade across complete date ranges
- Keep incomplete tasks visible until completion or explicit deletion, with overdue labels applied after their due dates pass
- Hide completed tasks from the main list while retaining their completed records on the calendar
- Display multi-day events across their full date range, keep tasks and events visually distinct, and persist calendar events across navigation and reloads
- Recognize or manually mark holidays and highlight every inclusive date in the holiday range across all calendar views
- Lifted-card drag-and-drop, animated placement gaps, touch support, and keyboard reordering preserve a custom manual order
- Task-first layout collapses the adaptive composer when saved tasks exist and restores it when the list is empty
- Enter submits typed tasks directly, Shift+Enter adds a line break, and completed voice transcription submits automatically
- Export the complete ordered task list as a validated `.png` through the browser's reliable download flow, showing every exported task as unchecked while leaving website completion states unchanged
- Choose Light, Dark, or System appearance from the bottom toolbar with a remembered preference and a neutral charcoal dark theme
- Celebrate the transition to a fully completed non-empty list with a lively canvas-confetti burst and smooth physics-based fall, or a reduced-motion message
- Every task is stored as an object that includes its date, text, subject, optional label, completion state, and completion date
- Delete tasks
- Mark tasks complete with a checkbox
- Completed-task strikethrough
- Automatic local storage persistence
- Version-independent calendar storage with automatic, idempotent migration from v2.4 and v2.5 event keys
- Built-in Data page for portable JSON backups and duplicate-safe restore/merge
- Responsive and keyboard-accessible design

## Upgrades and data recovery

User data is stored twice: in browser storage under the stable desktop origin (`http://127.0.0.1:4192`) and in a version-independent local JSON file. Every relevant browser-storage change is automatically written to the local file through `/api/local-data`; writes are atomic and the previous file is retained for recovery. On startup, the local file is merged back into browser storage without duplicating matching tasks or events.

Because the desktop shortcut always uses the same local origin and restores from the shared JSON file, browser changes do not create a separate permanent data set. The current shortcut opens the To-Do List in Google Chrome, which receives the existing tasks, events, holidays, labels, and settings from that shared file while the system default browser remains unchanged.

Before changing versions, open **Data** and choose **Download backup**. After an upgrade, the application automatically creates a pre-migration recovery snapshot in browser storage, migrates legacy event keys to the stable `todo-calendar-events` key, and retains task, event, holiday, date, time, completion, appearance, and calendar-view data. Re-running the migration or importing the same backup is idempotent and does not duplicate matching tasks or events.

To recover, open **Data**, choose **Choose backup**, and select a Todo List JSON backup. Existing data is merged rather than replaced. Keep backup JSON files outside the repository and never commit them.

## Run locally

Create a local environment file and add newly generated DeepSeek and Doubao Speech API keys:

```bash
cp .env.example .env
# Edit .env and replace the placeholder. Never commit this file.
npm start
```

Then visit `http://127.0.0.1:4173`.

Voice input works best in the latest Google Chrome. The backend keeps the Doubao credential out of browser code and uses `volc.seedasr.sauc.duration` by default. If microphone or speech-recognition access is unavailable, typed input continues to work normally.

## V3.2 upgrade procedure

- Back up the existing desktop `state.json`, previous snapshot, application files, and shortcut before replacing application assets. Export the production D1 database to a private directory before deployment. Never put these backups, `.env`, credentials, or user data in Git.
- Keep the desktop server at `127.0.0.1:4192` and keep `TODO_DATA_DIR` unchanged. Promote frontend assets and the compatible local server only. Retain the login-free desktop `app.html`; never copy the Online authentication shell into the Shortcut installation.
- Timers use stable task IDs, absolute local timestamps, and the existing persistence route (`/api/local-data` on desktop, authenticated `/api/storage` Online). They initialize after storage restoration, are isolated by account Online, and are included in portable JSON backups. Only one timer runs at once; prior timers are paused. Completion/deletion stops that task’s timer without deleting other task records.
- The weather opt-in is remembered per browser. Coordinates are requested afresh only with browser permission and are never stored in account snapshots or the local file. A revoked or expired permission resets the weather display and offers Enable location.
- Today’s progress includes only regular tasks due on the user’s current local day. Extra, overdue, and future tasks are excluded. The flip clock uses local 12-hour time with AM/PM.
- After deploying, check the version/assets and authenticated API guard, compare data before/after, launch the existing Shortcut, and verify task/calendar persistence after reopening. Keep backups available. No database schema migration is needed for this release.
- Recovery: stop the local server, restore the backed-up application and `state.json`, then relaunch the unchanged origin. Keep the upgraded copy before restoring. For production rollback, deploy the previous application version; D1/R2 are not replaced during normal deployments. Restore SQL only as a deliberate disaster recovery action, since it replaces newer account changes.

## Subject group ordering

Use the two-line handle at the right of a subject heading to drag its entire group within the same date, using a mouse or touch. The existing six-dot handles still reorder individual tasks within their subject. Arrow Up/Down on the subject handle provides keyboard reordering. Group moves preserve every task’s details and internal order, including hidden records. The existing saved task array stores the subject order, so Online snapshots, desktop saves, backups and calendar edits retain it without a new data format.

## Calendar Stats

Calendar’s **Stats** button opens one full-width chart at a time, with **Finish Time**, **Extra & Early**, and **Completion Rate** tabs sharing the 7-day/30-day selector. The info button starts closed and shows a short explanation for the selected chart. Tracking dates and missing-data notes are inside the collapsed View data section. The finish-time chart covers regular tasks due on each local date, independently of the celebration eligibility rules. A day without due tasks, with unfinished work, or with an unrecorded exact completion time has a gap. Early finishes retain their actual completion date in the data table and tooltip. Today follows the current due-date cohort; prior daily summaries are retained when later tasks are edited, deleted, or hidden by midnight cleanup.

When the actual finish time is unknown, it stays blank, even after a Completion Rate correction reaches 100%. **View data → Edit Finish Time** accepts an explicit actual local date and time; it never substitutes the correction-save time. A missing original timestamp remains null internally. Finish Time points retain their hover tooltip and open a local date/time editor on click, tap, or keyboard activation. Corrections are stored independently in `finishEdits`, preserving the original exact timestamp and a per-point Show Edited label choice. Automatic observations, midnight cleanup, imports, and older-client saves retain these corrections. The point stays associated with the original task due-date cohort; corrected finish dates appear in the tooltip and data table. Editing statistics never writes task due dates or completion states and never emits celebration events.

The second chart counts actual Extra-or-early completions on their local completion date, once per task ID per day. Hover or tap a bar to preview up to three task snapshots, with Extra/Early badges and calendar days early; View all opens the recorded full list. Names and eligibility are frozen at the first qualifying completion that day and survive edits, deletion, reloads, and reviewed imports. Older counts without detail snapshots remain intact and explicitly report unavailable details rather than guessing from today’s task state. Extra plus early is one count; rechecking on the same day cannot inflate it. This metric never changes a task label. Historical counts represent recorded completions, including a completion later unchecked or deleted. Dates before recording began remain unknown rather than fabricated zeroes, and the first tracking day may be partial.

Completion Rate begins recording when this update first runs. Each local day keeps its own observed regular due-task total and completed count, including tasks finished early and excluding Extra. Today updates on every task change. The existing save path checkpoints the counts; a local-midnight timer seals prior days and flushes them before the active-list refresh. Visibility changes and reopening after device sleep also checkpoint and seal existing records. A late completion, later edit, deletion, or midnight cleanup does not recalculate an earlier day. No eligible tasks or no rate record produces a gap, and older finish-time summaries are never converted into guessed rate history. An app that was closed for an entire date has no observation for that date. The first tracking day uses the tasks available at that time.

`todo-completion-history-v1` is a separate, versioned storage value. It contains daily summaries, exact known completion stamps, and private task-name/eligibility snapshots for Extra & Early details recorded from this update onward. It participates in the existing private Online snapshot, local save file, browser-local IndexedDB, portable backups and reviewed imports. Account storage and local storage remain separate. History is validated before restoring tasks, task-ID remapping avoids duplicate counts on imports, older clients cannot erase stored history or optional rate snapshots, and concurrent Online saves merge history with an optimistic retry. No timestamp is inferred from legacy `completedOn` dates. `completion-history.test.cjs`, `task-history.test.cjs`, `history-import.test.cjs`, and the storage tests cover these rules, including hydration and midnight boundaries.

## Downloadable Chrome Shortcut

The Mac download is now a ready-to-drag `.crwebloc` file, Chrome’s registered shortcut format, with the original Shortcut icon preserved in Finder metadata. `npm run shortcut:build` builds one universal ZIP in the ignored `desktop-downloads/` folder. Unzip it, drag the launcher to Desktop, and double-click. No installer, shell commands, runtime, native app, signing, or Apple Developer ID is needed. This replaces the old `Install.command` package; legacy downloads are retained only for existing links. [Installation and recovery instructions](desktop-shortcut/README.md).

The launcher opens `https://todolist.uno/local/app`, a login-free workspace compiled from the existing local application. `scripts/build-browser-local.mjs` injects the local storage namespace before any app script, includes self-hosted fonts, and builds a versioned service worker cache. After the first online visit, core tasks and Calendar can work offline. APIs and private data are never cached by the service worker. Updates activate after old clients close, avoiding mixed application versions while editing. The initial redirected-response caches are repaired immediately on upgrade; existing tabs should then be reloaded or reopened. Canonical page paths and fresh non-redirected cached responses prevent Chrome from rejecting embedded navigations. This repair only replaces public app caches and never clears localStorage or IndexedDB.

### Local data safety

All browser-local localStorage and sessionStorage keys use the `todo-local::` prefix. The Online application continues using its existing account-scoped storage. An independent IndexedDB database, `todo-local-browser-v1`, keeps the latest/previous snapshots plus pre-restore recovery copies. Browser-local persistence never calls `/api/storage` and never reads or overwrites Online account records. The original local server on port 4192 and its data files remain untouched.

Users can grant access to an independent folder under **Data → Choose backup folder**. The workspace writes `Todo-List-local-save.json` and retains a daily previous file. If browser folder permission expires, IndexedDB saving continues and the user can reconnect the folder. An existing canonical save file is never overwritten when selecting a folder: import it first and select a fresh folder. Portable backup import uses the existing reviewed, idempotent merge. Export a backup before clearing site data or changing Chrome profiles; browser storage alone is not an independent disk backup.

### Hosted AI and optional sync

Local AI and voice call `/api/local-ai/parse-tasks`, `/api/local-ai/parse-event`, and `/api/local-ai/transcribe`, using the existing server-side DeepSeek and Doubao configuration. No credentials are distributed. A Turnstile-verified anonymous, HMAC-signed HttpOnly session is required, with same-origin request checks, a per-minute rate limiter and atomic per-day global/IP/session quotas. D1 migration `0003_local_ai_usage.sql` adds only anonymous counters, never user records or raw IPs. Anonymous prompts are not stored as account messages. Saved local lists are not uploaded by AI; only submitted descriptions/audio are processed. Internet is required for these features and weather.

**Sync to Website** remains optional and manual: exact source/origin/nonce handshake, explicit local transfer confirmation, account verification, additions/conflict preview, optimistic revision check, atomic D1 merge, and private R2 pre-import recovery copy. Local and cloud records are retained, matching records are not duplicated on repeat imports, and local deletions are not propagated. The same flow supports legacy localhost clients and the isolated browser-local workspace. No local data is copied to new accounts automatically.

### Build and verification

Run `npm ci --prefix browser-local --ignore-scripts` for the isolated test dependency (do not replace an existing local application's shared `node_modules`). Run `npm run check`, `npm test`, `npm run test:shortcut`, `npm run cloudflare:build`, and `npm run test:browser-local`. The tests cover storage isolation, reopen recovery, provider request guards, quota/session validation, duplicate-free merges, account isolation, and offline cache routing. Test an actual downloaded ZIP through Finder/Chrome as well; command-line archive checks do not establish double-click behavior under macOS security controls.

Upload the universal ZIP to its manifest R2 object key before deployment. Only allowlisted release ZIPs under `/downloads/` are public; account records and recovery snapshots remain private. Back up D1 and checksum the original Shortcut's data before upgrading; apply the additive migration, deploy, verify data preservation, and retain recovery backups. Do not commit build archives, user data, credentials, or test connection files.

Past Completion Rate dates can be clicked or tapped to confirm individual regular tasks that really finished on time but were never checked off. These statistics-only confirmations do not automatically count late completions, change tasks, or trigger celebrations. Daily task cohorts and manual confirmations are retained independently in `rateCohorts` and `rateEdits`, including through local backups, cloud saves, and older-client merges. Legacy dates are editable only when the complete original due-task cohort can be reconciled safely; missing historical task details are never guessed.

Calendar weeks run Monday through Sunday in Week, Month, and Year views. Week navigation keeps Sunday in its Monday-starting week. Task and event AI prompts share explicit local-date week boundaries, so on Sunday, “next week” starts the next day (Monday); clear “next Monday” / “下周一” dates use that same rule.
