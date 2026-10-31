const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.routes');
const campaignRoutes = require('./campaign.routes');
const taskRoutes = require('./task.routes');
const logRoutes = require('./log.routes');

router.use('/session', authRoutes);
router.use('/campaign', campaignRoutes);
router.use('/', taskRoutes);
router.use('/', logRoutes);

module.exports = router;

