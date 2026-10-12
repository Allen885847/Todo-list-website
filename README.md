# Todo List Website

A responsive, AI-powered to-do list built with HTML, CSS, JavaScript, and a small Node.js server.

Development release: **Version 2.5**. This version runs separately from the Version 2.4 Elite desktop shortcut.

Version 2.5 adds optional calendar event times, chronological timed-event schedules, persistent completed calendar records, and clear overdue-task handling.

## Features

- Renameable list title
- Add one or many tasks using typed English, Mandarin Chinese, or mixed-language natural language
- Record tasks with the browser microphone and automatically transcribe them without showing live text
- Voice recordings are converted to 16 kHz mono WAV in the browser and transcribed by Doubao Streaming Speech Recognition 2.0 through the local backend; DeepSeek does not transcribe audio
- A reactive waveform, recording timer, stop control, and cancel control make recording state clear
- DeepSeek separates actionable work, corrects and translates task titles, resolves task-specific dates, and chooses one relevant emoji
- Review, edit, remove, and confirm generated tasks before saving
- Ambiguous dates are flagged and must be confirmed in the preview
- Task titles use consistent, concise noun phrases without leading action verbs for both single-task and multi-task input
- Generated tasks are initially sorted by due date, earliest first
- Within each date section, tasks are grouped under editable subject headings; English Language and English Literature remain separate subjects
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
- Every task is stored as an object with `date`, `task`, and `completed`
- Delete tasks
- Mark tasks complete with a checkbox
- Completed-task strikethrough
- Automatic local storage persistence
- Version-independent calendar storage with automatic, idempotent migration from v2.4 and v2.5 event keys
- Built-in Data page for portable JSON backups and duplicate-safe restore/merge
- Responsive and keyboard-accessible design

## Upgrades and data recovery

User data is stored twice: in browser storage under the stable desktop origin (`http://127.0.0.1:4192`) and in a version-independent local JSON file. Every relevant browser-storage change is automatically written to the local file through `/api/local-data`; writes are atomic and the previous file is retained for recovery. On startup, the local file is merged back into browser storage without duplicating matching tasks or events.

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
