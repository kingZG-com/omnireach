const { runQuery } = require('./connection');

async function initDb() {
  await runQuery(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      message_template TEXT NOT NULL,
      total_loaded INTEGER DEFAULT 0,
      limit_count INTEGER DEFAULT 0,
      delay_min INTEGER DEFAULT 20,
      delay_max INTEGER DEFAULT 45,
      status TEXT DEFAULT 'idle',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS outreach_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER,
      target_url TEXT NOT NULL,
      username TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      message_sent TEXT,
      proof_path TEXT,
      error_detail TEXT,
      sent_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (campaign_id) REFERENCES campaigns (id)
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER,
      level TEXT DEFAULT 'INFO',
      message TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

module.exports = {
  initDb
};

