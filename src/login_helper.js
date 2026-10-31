const authService = require('./services/auth.service');
const { launchPersistentBrowserContext, launchBrowser } = require('./core/browser');

module.exports = {
  runLoginAssistant: (cb) => authService.runLoginAssistant(cb),
  launchPersistentBrowserContext,
  launchBrowser
};
