const taskRepo = require('../../database/repositories/task.repo');
const websocket = require('../../core/websocket');

class TaskController {
  async getTasks(req, res) {
    try {
      const campaignId = req.query.campaign_id ? parseInt(req.query.campaign_id) : null;
      const status = req.query.status;
      let tasks = await taskRepo.findByCampaign(campaignId, status);
      if (!campaignId && tasks.length > 100) {
        tasks = tasks.slice(0, 100);
      }
      res.json({ tasks });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async clearTasks(req, res) {
    try {
      const campaignId = req.query.campaign_id || (req.body && req.body.campaign_id);
      const cid = campaignId ? parseInt(campaignId) : null;

      await taskRepo.clearAll(cid);
      websocket.broadcast('tasks_cleared', { campaign_id: cid });

      res.json({
        success: true,
        message: 'Semua hasil DM berhasil dibersihkan.'
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async getStats(req, res) {
    try {
      const campaignId = req.query.campaign_id ? parseInt(req.query.campaign_id) : null;
      const stats = await taskRepo.getStats(campaignId);
      res.json({ stats });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async exportCsv(req, res) {
    try {
      const campaignId = req.query.campaign_id ? parseInt(req.query.campaign_id) : null;
      const tasks = await taskRepo.findByCampaign(campaignId);

      const headers = [
        'ID',
        'Target URL',
        'Username',
        'Status',
        'Pesan Terkirim',
        'Error Detail',
        'Waktu Pengiriman'
      ];

      const csvRows = [headers.join(',')];

      for (const t of tasks) {
        const row = [
          t.id,
          `"${(t.target_url || '').replace(/"/g, '""')}"`,
          `"${(t.username || '').replace(/"/g, '""')}"`,
          `"${(t.status || '').replace(/"/g, '""')}"`,
          `"${(t.message_sent || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
          `"${(t.error_detail || '').replace(/"/g, '""')}"`,
          `"${(t.sent_at || t.created_at || '').replace(/"/g, '""')}"`
        ];
        csvRows.push(row.join(','));
      }

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=outreach_results_${Date.now()}.csv`
      );
      res.send(csvRows.join('\r\n'));
    } catch (err) {
      res.status(500).send('Error generating CSV: ' + err.message);
    }
  }
}

module.exports = new TaskController();

