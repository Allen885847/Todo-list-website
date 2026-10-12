const exportButton = document.querySelector("#export-data");
const importInput = document.querySelector("#import-data");
const status = document.querySelector("#data-status");

exportButton.addEventListener("click", () => {
  try {
    window.TodoDataMigration.downloadBackup();
    status.textContent = "Backup download started.";
    status.dataset.type = "success";
  } catch (error) {
    console.error(error);
    status.textContent = "The backup could not be downloaded. Please try again.";
    status.dataset.type = "error";
  }
});

importInput.addEventListener("change", async () => {
  const [file] = importInput.files;
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    const result = window.TodoDataMigration.importBackup(payload);
    status.textContent = `Data merged safely: ${result.tasks} tasks and ${result.events} events are available.`;
    status.dataset.type = "success";
  } catch (error) {
    console.error(error);
    status.textContent = error.message || "The backup could not be imported.";
    status.dataset.type = "error";
  } finally {
    importInput.value = "";
  }
});
