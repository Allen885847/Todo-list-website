# Todo List Local — Chrome Shortcut

1. Download the ZIP and unzip it.
2. Drag **Todo List Local.crwebloc** to your Desktop.
3. Double-click the Shortcut. Google Chrome opens your local workspace without a login.

Requires Google Chrome on Mac. One download works on Apple silicon and Intel. The Shortcut uses Chrome’s registered shortcut-file format and your existing Todo List icon. It is not a native application. There is no installer, Terminal command, Node.js requirement, or Apple Developer ID requirement. Your system’s default browser is unchanged.

## First opening and AI

Open once while connected to the internet so the workspace can be cached. After that, core tasks, Calendar, manual entry, timers, and appearance can work offline. AI, voice recognition, weather, and optional Sync to Website require internet.

AI uses todolist.uno’s hosted DeepSeek and Doubao backend; users do not need API keys. Keys stay on the server. A secure connection check and usage limits protect the service. Only descriptions/audio deliberately submitted to AI are sent for processing; the saved list is not uploaded automatically.

## Where data is saved

Tasks, events, holidays, labels, completion states, settings, and progress save automatically in the Chrome profile on this computer, in a separate local namespace and IndexedDB database. The Online account remains independent, even in the same browser. Use the same Chrome profile when reopening.

For a separate file copy, open **Data → Choose backup folder**. Chrome asks for permission to write a local JSON save file. Automatic folder copies pause when permission expires; use **Reconnect folder** to resume them. A previous file copy is retained daily in “Todo List backups”. Folder problems do not stop the browser save.

Do not clear Chrome site data or delete this browser profile without exporting a backup first. Browser storage can be removed by the user or browser; choosing a backup folder protects against that. The Shortcut does not read any existing local application’s files automatically.

## Backup, restore, and updates

**Data → Download backup** creates a portable JSON copy. **Choose backup** accepts a previous Todo List backup or local state.json file, previews additions and differences, and merges only after confirmation. Recovery copies are kept before restoration, and repeat imports do not duplicate matching records.

Web application updates keep the same local address and storage namespace, independent of replaceable application files. The existing AI Todo List Shortcut, its application folder, local server, and saved data are not changed by this download. To bring its data into this workspace, export a backup from that version and review it using Choose backup.

## Optional Sync to Website

Choose **Data → Sync to Website** only when you want to copy data to an Online account. Sign in on todolist.uno, return to the local tab, and confirm the transfer. Review additions and resolve differences on the website before saving. A recovery snapshot is kept before the Online merge.

Nothing is uploaded before confirmation. Both copies remain available. This is a manual merge, not background synchronization, and local deletions do not delete Online records. Using Online separately does not overwrite this local workspace.
