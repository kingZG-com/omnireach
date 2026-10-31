const { runQuery, getAllRows, getFormattedNow } = require('../connection');

class TaskRepository {
  async addTasks(campaignId, targets) {
    const now = getFormattedNow();
    for (const t of targets) {
      await runQuery(
        `INSERT INTO outreach_tasks (campaign_id, target_url, username, status, created_at)
         VALUES (?, ?, ?, 'pending', ?)`,
        [campaignId, t.target_url, t.username, now]
      );
    }
  }

  async findPendingByCampaign(campaignId, limit = 1000) {
    return await getAllRows(
      `SELECT * FROM outreach_tasks WHERE campaign_id = ? AND status = 'pending' ORDER BY id ASC LIMIT ?`,
      [campaignId, limit]
    );
  }

  async findByCampaign(campaignId = null, status = null) {
    let sql = `SELECT * FROM outreach_tasks`;
    const params = [];
    const conditions = [];

    if (campaignId) {
      conditions.push(`campaign_id = ?`);
      params.push(campaignId);
    }

    if (status && status !== 'all') {
      conditions.push(`status = ?`);
      params.push(status);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ` + conditions.join(' AND ');
    }

    sql += campaignId ? ` ORDER BY id ASC` : ` ORDER BY id DESC`;
    return await getAllRows(sql, params);
  }

  async updateResult(taskId, status, messageSent, proofPath = null, errorDetail = null) {
    return await runQuery(
      `UPDATE outreach_tasks
       SET status = ?, message_sent = ?, proof_path = ?, error_detail = ?, sent_at = ?
       WHERE id = ?`,
      [status, messageSent, proofPath, errorDetail, getFormattedNow(), taskId]
    );
  }

  async clearAll(campaignId = null) {
    if (campaignId) {
      return await runQuery(`DELETE FROM outreach_tasks WHERE campaign_id = ?`, [campaignId]);
    }
    return await runQuery(`DELETE FROM outreach_tasks`);
  }

  async getStats(campaignId = null) {
    let sql = `SELECT status, count(*) as count FROM outreach_tasks`;
    const params = [];
    if (campaignId) {
      sql += ` WHERE campaign_id = ?`;
      params.push(campaignId);
    }
    sql += ` GROUP BY status`;

    const rows = await getAllRows(sql, params);
    const stats = {
      total: 0,
      pending: 0,
      sent: 0,
      dm_closed: 0,
      failed: 0,
      skipped: 0
    };

    for (const r of rows) {
      stats.total += r.count;
      if (stats[r.status] !== undefined) {
        stats[r.status] = r.count;
      }
    }
    return stats;
  }
}

module.exports = new TaskRepository();

