# Todo List Website

A responsive, AI-powered to-do list built with HTML, CSS, JavaScript, and a small Node.js server.

Current stable release: **v2.0**.

## Features

- Renameable list title
- Add one or many tasks using typed English, Mandarin Chinese, or mixed-language natural language
- Record tasks with the browser microphone and automatically transcribe them without showing live text
- The voice workflow is adapted from the companion `Test-audio-website` project and uses the browser Web Speech API; DeepSeek does not transcribe audio
- A reactive waveform, recording timer, stop control, and cancel control make recording state clear
- DeepSeek separates actionable work, corrects and translates task titles, resolves task-specific dates, and chooses one relevant emoji
- Review, edit, remove, and confirm generated tasks before saving
- Ambiguous dates are flagged and must be confirmed in the preview
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
