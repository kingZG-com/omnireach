const { runQuery, getAllRows, getFormattedNow } = require('../connection');

class LogRepository {
  async log(campaignId, level, message) {
    try {
      await runQuery(
        `INSERT INTO activity_logs (campaign_id, level, message, created_at) VALUES (?, ?, ?, ?)`,
        [campaignId || null, level, message, getFormattedNow()]
      );
    } catch (err) {
      console.error('Database log error:', err);
    }
  }

  async getRecent(limit = 50) {
    const rows = await getAllRows(`SELECT * FROM activity_logs ORDER BY id DESC LIMIT ?`, [limit]);
    return rows.reverse();
  }
}

module.exports = new LogRepository();

