# Todo List Local

1. Unzip the download. Keep `Install.command` and `Todo List Local.app` together.
2. Double-click **Install.command**. It installs to your personal Applications folder and adds a desktop Shortcut.
3. Open **Todo List Local**. It starts the included local server and opens Google Chrome. No Node.js installation or website login is required.

Use the Apple silicon download for M-series Macs and the Intel download for Intel Macs. Requires macOS 13.5 or later and Google Chrome. These are shell-based Shortcut bundles and supporting files, not a native application or App Store installer.

## AI and voice

Open **Data → AI connection** and add your own DeepSeek API key. For voice, also add your Doubao Speech Recognition key and enable that service in its project. You can use the AI without signing in to the website. No shared API keys are included in this download. Keys stay in a separate private file and are excluded from portable backups and synchronization.

Tasks, Calendar, manual entry, completion states, labels, task timers, progress, appearance, backup, and restoration work without internet. AI, speech recognition, weather, and Sync to Website require internet. The user must grant location permission for weather.

## Local saves and updates

The save file is `~/Library/Application Support/Todo List Local/data/state.json`, with an automatically retained previous file. Updates replace application files only, keep the same local address (`http://127.0.0.1:4196`), and retain the independent data directory and Chrome storage. Before a version change, the launcher creates an additional recovery snapshot. The installer retains the previous application bundle as well.

This is independent of the existing **AI Todo List** Shortcut, its port, its application folder, and its saved data. It never imports that Shortcut's data automatically. To bring data over, export a backup from its Data page and review the import in the new local version.

## Backup and recovery

Use **Data → Download backup** for a portable JSON copy. **Choose backup** shows a merge preview; resolve differing records before confirming. The complete previous local state is backed up before the restore is applied. Matching task/event records are not duplicated, including on repeat imports.

For file recovery, close local tabs and stop this download's local server (the process ID is in the support folder's `server.pid`). Keep a copy of the current state, then restore a snapshot from `data/backups/` to `data/state.json` and reopen the Shortcut. Do not delete the Application Support folder when updating.

## Sync to Website

Open **Data → Sync to Website**. Sign in on todolist.uno, return to the local tab, and confirm sending a copy. Review the merge on the website and choose which version to keep wherever saved details differ, then confirm **Merge into my account**. No records are uploaded before your local confirmation, and no Online changes are saved before your final review. The website checks for concurrent changes and asks for a fresh review when needed. A recovery snapshot of the Online account is retained before the import.

This is a manual copy-and-merge action, not automatic background synchronization. Records present in only one copy are retained. Deleting a local record does not automatically delete the corresponding Online record. The local copy and the website can continue to be used independently.
