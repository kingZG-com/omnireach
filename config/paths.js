const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const PROOFS_DIR = path.join(ROOT_DIR, 'proofs');
const PROFILE_DIR = path.join(ROOT_DIR, 'browser_profile');
const STATIC_DIR = path.join(ROOT_DIR, 'app', 'static');

const DB_PATH = path.join(DATA_DIR, 'automation.db');
const COOKIES_FILE = path.join(DATA_DIR, 'tiktok_cookies.json');
const SESSION_FILE = path.join(DATA_DIR, 'session_info.json');

// Ensure required directories exist
for (const dir of [DATA_DIR, PROOFS_DIR, PROFILE_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

module.exports = {
  ROOT_DIR,
  DATA_DIR,
  PROOFS_DIR,
  PROFILE_DIR,
  STATIC_DIR,
  DB_PATH,
  COOKIES_FILE,
  SESSION_FILE
};

