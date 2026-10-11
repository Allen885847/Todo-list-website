# Todo List Website

A responsive, AI-powered to-do list built with HTML, CSS, JavaScript, and a small Node.js server.

Release: **Version 2.4 Elite**.

Version 2.4 Elite is a major update introducing an all-new Calendar system. View task due dates directly on the calendar, add personal plans and events, and highlight holiday periods with distinct colors. With Day, Week, Month, and Year views, the calendar makes it easier to organize upcoming tasks and see your schedule at a glance.

## Features

- Renameable list title
- Add one or many tasks using typed English, Mandarin Chinese, or mixed-language natural language
- Record tasks with the browser microphone and automatically transcribe them without showing live text
- The voice workflow is adapted from the companion `Test-audio-website` project and uses the browser Web Speech API; DeepSeek does not transcribe audio
- A reactive waveform, recording timer, stop control, and cancel control make recording state clear
- DeepSeek separates actionable work, corrects and translates task titles, resolves task-specific dates, and chooses one relevant emoji
- Review, edit, remove, and confirm generated tasks before saving
- Ambiguous dates are flagged and must be confirmed in the preview
- Task titles use consistent, concise noun phrases without leading action verbs for both single-task and multi-task input
- Generated tasks are initially sorted by due date, earliest first
- Within each date section, tasks are grouped under editable subject headings; English Language and English Literature remain separate subjects
- Copy the current list as readable plain text containing only its title and one task per line
- Open a dedicated calendar page from the To-Do List and switch between Day, Week, Month, and Year views while preserving the selected date
- See tasks on their due dates, edit task details from the calendar, and keep undated tasks exclusively in the To-Do List
- Add, edit, and delete distinct personal events with manual fields or an editable DeepSeek-powered natural-language preview
- Display multi-day events across their full date range, keep tasks and events visually distinct, and persist calendar events across navigation and reloads
- Recognize or manually mark holidays and highlight every inclusive date in the holiday range across all calendar views
- Lifted-card drag-and-drop, animated placement gaps, touch support, and keyboard reordering preserve a custom manual order
- Task-first layout collapses the adaptive composer when saved tasks exist and restores it when the list is empty
- Enter submits typed tasks directly, Shift+Enter adds a line break, and completed voice transcription submits automatically
- Export the complete ordered task list as a validated PNG through the browser's reliable download flow, showing every exported task as unchecked while leaving website completion states unchanged
- Choose Light, Dark, or System appearance from the bottom toolbar with a remembered preference and a neutral charcoal dark theme
- Celebrate the transition to a fully completed non-empty list with a lively canvas-confetti burst and smooth physics-based fall, or a reduced-motion message
- Every task is stored as an object with `date`, `task`, and `completed`
- Delete tasks
- Mark tasks complete with a checkbox
- Completed-task strikethrough
- Automatic local storage persistence
- Responsive and keyboard-accessible design

## Run locally

Create a local environment file and add a newly generated DeepSeek API key:

```bash
cp .env.example .env
# Edit .env and replace the placeholder. Never commit this file.
npm start
```

Then visit `http://127.0.0.1:4173`.

Voice input works best in the latest Google Chrome. If microphone or speech-recognition access is unavailable, typed input continues to work normally.
