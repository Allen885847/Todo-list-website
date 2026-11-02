# Todo List Website

A responsive, AI-powered to-do list built with HTML, CSS, JavaScript, and a small Node.js server.

The Online application uses account-scoped Cloudflare D1/R2 storage and email/password authentication. The desktop Shortcut remains login-free and uses its existing local file and browser storage; these are separate applications.

Release: **V3.2 — Focus, Time, and Weather**.

V3.2 adds task countdown timers, a flip clock, local weather, and today’s progress tracking. A cleaner, more organized layout helps you stay focused and complete tasks more efficiently.

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

## Downloadable Chrome Shortcut

The `desktop-shortcut` feature provides a macOS shell Shortcut, the exact existing Shortcut icon, an official checksum-verified Node.js runtime, and the existing local web application. It is not an Electron/native app and needs no Apple Developer account. `npm run shortcut:build` creates separate Apple silicon and Intel ZIP files in the ignored `desktop-downloads/` directory. No `.env`, API keys, user data, or local save files are included. See [installation and local recovery instructions](desktop-shortcut/README.md).

The Online footer replaces Data with a computer-only Desktop App section containing verified downloads and a reviewed desktop-backup import. Existing Online Data links redirect to that section. The existing local Shortcut installation is never modified by these builds or the downloadable installer. The new Shortcut uses port 4196 and `~/Library/Application Support/Todo List Local/data`, independent of the original Shortcut's port 4192 and data folder.

Local AI and voice use per-user API keys configured in Data → AI connection. Keys are stored separately with mode 0600, never returned to the browser, and excluded from backup/export/sync. The package does not distribute the website owner's API keys.

Sync to Website is an explicit manual copy-and-merge flow. It uses the existing Online authentication; a nonce-bound, origin-checked browser message transfers the backup only after the user confirms on the local tab. The website performs an editable conflict review before an authenticated, revision-checked atomic merge. It keeps a private R2 recovery snapshot of the previous account state. The local copy is retained, and no background sync is enabled. Repeated imports match stable IDs and legacy content fingerprints instead of creating duplicate records. Conflicting saved details require the user's choice.

`npm run test:shortcut` checks record preservation, duplicate-free repeat merges, conflicts, account isolation, stale/concurrent write rejection, local save/reopen, recovery snapshots, secret exclusion, and transfer/device guards. Only allowlisted release files under `/downloads/` are readable publicly from R2; account data and recovery snapshots remain authenticated/private. Build artifacts must be uploaded before their checksummed manifest is promoted to `desktop-shortcut/downloads.json`. Do not publish credentials or test data.
