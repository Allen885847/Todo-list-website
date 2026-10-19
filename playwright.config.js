const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './test/ui', workers: 1,
  use: { channel: 'chrome', headless: true, baseURL: 'http://127.0.0.1:4199' },
});
