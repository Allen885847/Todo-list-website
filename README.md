# Todo List Website

A responsive, AI-powered to-do list MVP built with HTML, CSS, JavaScript, and a small Node.js server.

## Features

- Renameable list title
- Add tasks using natural language
- DeepSeek V4.1 Flash extracts the day, month, year, and task text
- DeepSeek chooses one relevant Apple-compatible emoji and places it before the task text
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
