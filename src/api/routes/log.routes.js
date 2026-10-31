const express = require('express');
const router = express.Router();
const logController = require('../controllers/log.controller');

router.get('/logs', (req, res) => logController.getLogs(req, res));

module.exports = router;

