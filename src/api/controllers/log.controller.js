const logRepo = require('../../database/repositories/log.repo');

class LogController {
  async getLogs(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const logs = await logRepo.getRecent(limit);
      res.json({ logs });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = new LogController();

