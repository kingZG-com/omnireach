const fs = require('fs');
const path = require('path');
const { COOKIES_FILE, SESSION_FILE, PROFILE_DIR } = require('../../config/paths');
const { launchPersistentBrowserContext, cleanLocks } = require('../core/browser');

class AuthService {
  async checkLoginStatus() {
    let username = null;
    let updatedAt = null;
    let isLoggedIn = false;

    const hasCookiesFile = fs.existsSync(COOKIES_FILE);
    const hasProfileDir = fs.existsSync(path.join(PROFILE_DIR, 'Default', 'Network', 'Cookies'));

    if (fs.existsSync(SESSION_FILE)) {
      try {
        const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
        username = data.username || null;
        updatedAt = data.updated_at || null;
        if (data.is_logged_in && (hasCookiesFile || hasProfileDir)) {
          isLoggedIn = true;
        }
      } catch (e) {}
    }

    if (!isLoggedIn && hasCookiesFile) {
      try {
        const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf-8'));
        const hasSession = cookies.some((c) =>
          ['sessionid', 'sid_tt', 'uid_tt', 'sessionid_ss'].includes(c.name)
        );
        if (hasSession) {
          isLoggedIn = true;
        }
      } catch (e) {}
    }

    if (isLoggedIn) {
      let displayUsername = username;
      if (
        displayUsername &&
        !displayUsername.startsWith('@') &&
        displayUsername !== 'Akun TikTok Aktif' &&
        displayUsername !== 'Akun Aktif'
      ) {
        displayUsername = `@${displayUsername}`;
      }

      return {
        is_logged_in: true,
        username: displayUsername || 'Akun TikTok Aktif',
        raw_username: (displayUsername || '').replace(/^@+/, ''),
        message: 'Sudah login ke TikTok',
        updated_at: updatedAt
      };
    }

    return {
      is_logged_in: false,
      username: null,
      raw_username: null,
      message: 'Belum ada sesi login (silakan klik Login / Ganti Akun).'
    };
  }

  async extractUsernameFromPage(page) {
    try {
      const url = page.url();
      const urlMatch = url.match(/tiktok\.com\/@([a-zA-Z0-9_\.\-]+)/);
      if (urlMatch && urlMatch[1] && urlMatch[1] !== 'me') {
        return urlMatch[1];
      }

      const detected = await page.evaluate(() => {
        try {
          const u = window.__UNIVERSAL_DATA_FOR_REHYDRATION__;
          if (u && u['__DEFAULT_SCOPE__']) {
            const app = u['__DEFAULT_SCOPE__']['webapp.app-context'];
            if (app && app.user && app.user.uniqueId) {
              return app.user.uniqueId;
            }
          }
        } catch (e) {}

        try {
          if (window.SIGI_STATE && window.SIGI_STATE.UserModule && window.SIGI_STATE.UserModule.users) {
            const users = Object.values(window.SIGI_STATE.UserModule.users);
            if (users.length > 0 && users[0].uniqueId) {
              return users[0].uniqueId;
            }
          }
        } catch (e) {}

        const profileLink = document.querySelector(
          'a[data-e2e="nav-profile"], a[data-e2e="profile-icon"], a[href^="/@"]:not([href*="/video/"]):not([href*="/photo/"])'
        );
        if (profileLink) {
          const href = profileLink.getAttribute('href') || '';
          const m = href.match(/\/@([a-zA-Z0-9_\.\-]+)/);
          if (m && m[1] !== 'me') return m[1];
        }

        return null;
      });

      if (detected) return detected;
    } catch (err) {}
    return null;
  }

  async runLoginAssistant(onSuccess) {
    let context = null;
    try {
      context = await launchPersistentBrowserContext();
      const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

      if (fs.existsSync(COOKIES_FILE)) {
        try {
          const saved = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf-8'));
          if (Array.isArray(saved) && saved.length > 0) {
            await context.addCookies(saved);
          }
        } catch (err) {}
      }

      await page.goto('https://www.tiktok.com/login', { waitUntil: 'domcontentloaded' });
      await page.bringToFront();

      let loggedIn = false;
      let username = null;

      for (let i = 0; i < 600; i++) {
        if (page.isClosed()) {
          break;
        }

        const allCookies = await context.cookies();
        const hasSession = allCookies.some((c) =>
          ['sessionid', 'sid_tt', 'uid_tt', 'sessionid_ss'].includes(c.name)
        );

        if (hasSession) {
          loggedIn = true;
          fs.writeFileSync(COOKIES_FILE, JSON.stringify(allCookies, null, 2));

          username = await this.extractUsernameFromPage(page);
          if (!username) {
            await new Promise((r) => setTimeout(r, 2000));
            username = await this.extractUsernameFromPage(page);
          }

          if (!username && !page.isClosed()) {
            try {
              await page.goto('https://www.tiktok.com/@me', { waitUntil: 'domcontentloaded', timeout: 10000 });
              await new Promise((r) => setTimeout(r, 2000));
              username = await this.extractUsernameFromPage(page);
            } catch (e) {}
          }

          const now = new Date();
          const pad = (n) => String(n).padStart(2, '0');
          const updated_at = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

          const cleanUsername = username ? (username.startsWith('@') ? username : `@${username}`) : null;

          const sessionData = {
            is_logged_in: true,
            username: cleanUsername || 'Akun TikTok Aktif',
            updated_at
          };
          fs.writeFileSync(SESSION_FILE, JSON.stringify(sessionData, null, 2));

          if (typeof onSuccess === 'function') {
            onSuccess(sessionData);
          }

          await new Promise((r) => setTimeout(r, 3000));
          break;
        }

        await new Promise((r) => setTimeout(r, 1000));
      }

      try {
        await context.close();
      } catch (e) {}
      cleanLocks();

      return { success: loggedIn, username };
    } catch (err) {
      if (context) {
        try {
          await context.close();
        } catch (e) {}
        cleanLocks();
      }
      return { success: false, error: err.message };
    }
  }

  updateUsername(username) {
    const clean = username.trim().replace(/^@+/, '');
    let sessionData = { is_logged_in: true };
    if (fs.existsSync(SESSION_FILE)) {
      try {
        sessionData = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
      } catch (e) {}
    }
    sessionData.is_logged_in = true;
    sessionData.username = `@${clean}`;
    sessionData.updated_at = new Date().toISOString();
    fs.writeFileSync(SESSION_FILE, JSON.stringify(sessionData, null, 2));

    return `@${clean}`;
  }
}

module.exports = new AuthService();

