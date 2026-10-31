const { db, runQuery, getRow, getAllRows, getFormattedNow } = require('./connection');
const { initDb } = require('./schema');
const campaignRepo = require('./repositories/campaign.repo');
const taskRepo = require('./repositories/task.repo');
const logRepo = require('./repositories/log.repo');

module.exports = {
  db,
  initDb,
  runQuery,
  getRow,
  getAllRows,
  getFormattedNow,
  campaignRepo,
  taskRepo,
  logRepo,
  // Helper wrappers for existing code
  logActivity: (campaignId, level, msg) => logRepo.log(campaignId, level, msg),
  createCampaign: (...args) => campaignRepo.create(...args),
  addTasksToCampaign: (...args) => taskRepo.addTasks(...args),
  updateTaskResult: (...args) => taskRepo.updateResult(...args),
  updateCampaignStatus: (...args) => campaignRepo.updateStatus(...args),
  getLatestCampaign: () => campaignRepo.findLatest(),
  getCampaignTasks: (cid, status) => taskRepo.findByCampaign(cid, status),
  getTaskStats: (cid) => taskRepo.getStats(cid),
  clearAllTasks: (cid) => taskRepo.clearAll(cid),
  getRecentLogs: (limit) => logRepo.getRecent(limit)
};

