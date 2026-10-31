const express = require('express');
const router = express.Router();
const taskController = require('../controllers/task.controller');

router.get('/tasks', (req, res) => taskController.getTasks(req, res));
router.get('/campaign/tasks', (req, res) => taskController.getTasks(req, res));
router.all('/tasks/clear', (req, res) => taskController.clearTasks(req, res));
router.all('/campaign/tasks/clear', (req, res) => taskController.clearTasks(req, res));
router.get('/stats', (req, res) => taskController.getStats(req, res));
router.get('/export/csv', (req, res) => taskController.exportCsv(req, res));

module.exports = router;

