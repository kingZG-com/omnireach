const express = require('express');
const router = express.Router();
const upload = require('../middlewares/upload');
const campaignController = require('../controllers/campaign.controller');

router.post('/parse-file', upload.single('file'), (req, res) =>
  campaignController.parseFile(req, res)
);
router.post('/parse-text', (req, res) => campaignController.parseText(req, res));
router.post('/create', (req, res) => campaignController.create(req, res));
router.post('/:id/start', (req, res) => campaignController.start(req, res));
router.post('/:id/pause', (req, res) => campaignController.pause(req, res));
router.post('/:id/resume', (req, res) => campaignController.resume(req, res));
router.post('/:id/stop', (req, res) => campaignController.stop(req, res));
router.get('/latest', (req, res) => campaignController.getLatest(req, res));

module.exports = router;

