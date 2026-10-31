const { runQuery, getRow, getAllRows, getFormattedNow } = require('../connection');

class CampaignRepository {
  async create(name, messageTemplate, totalLoaded, limitCount, delayMin, delayMax) {
    const res = await runQuery(
      `INSERT INTO campaigns (name, message_template, total_loaded, limit_count, delay_min, delay_max, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'idle', ?)`,
      [name, messageTemplate, totalLoaded, limitCount, delayMin, delayMax, getFormattedNow()]
    );
    return res.lastID;
  }

  async findById(id) {
    return await getRow(`SELECT * FROM campaigns WHERE id = ?`, [id]);
  }

  async findLatest() {
    return await getRow(`SELECT * FROM campaigns ORDER BY id DESC LIMIT 1`);
  }

  async findAll() {
    return await getAllRows(`SELECT * FROM campaigns ORDER BY id DESC`);
  }

  async updateStatus(id, status) {
    return await runQuery(`UPDATE campaigns SET status = ? WHERE id = ?`, [status, id]);
  }
}

module.exports = new CampaignRepository();

