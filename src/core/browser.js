const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { PROFILE_DIR, COOKIES_FILE } = require('../../config/paths');
const { USER_AGENT, CHANNELS } = require('../../config/constants');

function cleanLocks() {
  if (fs.existsSync(PROFILE_DIR)) {
    const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile'];
    for (const fname of lockFiles) {
      const fpath = path.join(PROFILE_DIR, fname);
      if (fs.existsSync(fpath)) {
        try {
          fs.unlinkSync(fpath);
        } catch (e) {}
      }
    }
  }
}

async function launchPersistentBrowserContext(options = {}) {
  cleanLocks();

  let context = null;
  const isHeadless = options.headless === true;

  for (const ch of CHANNELS) {
    try {
      const defaultArgs = [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-renderer-backgrounding',
        '--disable-background-timer-throttling'
      ];

      if (isHeadless) {
        defaultArgs.push('--window-size=1920,1080');
      } else {
        defaultArgs.push('--start-maximized');
      }

      const opts = {
        headless: isHeadless,
        args: defaultArgs,
        viewport: isHeadless ? { width: 1920, height: 1080 } : null,
        noViewport: !isHeadless,
        userAgent: USER_AGENT,
        ...options
      };

      if (ch) opts.channel = ch;
      context = await chromium.launchPersistentContext(PROFILE_DIR, opts);
      break;
    } catch (e) {
      cleanLocks();
    }
  }

  if (!context) {
    throw new Error('Gagal meluncurkan browser (Chrome / Edge / Chromium).');
  }

  return context;
}

async function launchHeadlessBrowser() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: USER_AGENT
  });
  return { browser, context };
}

async function applyTurboRouting(context) {
  await context.route('**/*', (route) => {
    const req = route.request();
    const rType = req.resourceType();
    const reqUrl = req.url().toLowerCase();

    // Blokir streaming video media (.mp4, .webm, .m3u8, video blobs)
    if (rType === 'media') {
      return route.abort();
    }

    if (
      reqUrl.includes('.mp4') ||
      reqUrl.includes('.webm') ||
      reqUrl.includes('.m3u8') ||
      reqUrl.includes('.ts')
    ) {
      return route.abort();
    }

    // Blokir tracker telemetri berat
    if (
      reqUrl.includes('google-analytics') ||
      reqUrl.includes('byteoversea.com/telemetry')
    ) {
      return route.abort();
    }

    return route.continue();
  });
}

module.exports = {
  cleanLocks,
  launchPersistentBrowserContext,
  launchHeadlessBrowser,
  applyTurboRouting
};
