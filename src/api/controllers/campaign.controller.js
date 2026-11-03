const botService = require('../../services/bot.service');
const campaignRepo = require('../../database/repositories/campaign.repo');
const taskRepo = require('../../database/repositories/task.repo');
const logRepo = require('../../database/repositories/log.repo');
const websocket = require('../../core/websocket');

class CampaignController {
  parseFile(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Tidak ada file yang diunggah.' });
      }

      const content = req.file.buffer.toString('utf-8');
      const lines = content.split(/\r?\n/);
      const targets = [];
      const seen = new Set();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const info = botService.cleanTarget(trimmed);
        if (info.username && !seen.has(info.username.toLowerCase())) {
          seen.add(info.username.toLowerCase());
          targets.push(info);
        }
      }

      res.json({
        success: true,
        total: targets.length,
        total_found: targets.length,
        targets
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  parseText(req, res) {
    try {
      const rawText = req.body.raw_text || req.body.text || '';
      if (!rawText.trim()) {
        return res.status(400).json({ error: 'Input teks target kosong.' });
      }

      const lines = rawText.split(/\r?\n/);
      const targets = [];
      const seen = new Set();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const info = botService.cleanTarget(trimmed);
        if (info.username && !seen.has(info.username.toLowerCase())) {
          seen.add(info.username.toLowerCase());
          targets.push(info);
        }
      }

      res.json({
        success: true,
        total: targets.length,
        total_found: targets.length,
        targets
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async create(req, res) {
    try {
      const { name, message_template, targets, limit_count, delay_min, delay_max } = req.body;

      if (!name || !message_template) {
        return res.status(400).json({ error: 'Nama campaign dan template pesan wajib diisi.' });
      }

      const total = targets ? targets.length : 0;
      const limit = limit_count === 'all' || !limit_count ? total : parseInt(limit_count);

      const campaignId = await campaignRepo.create(
        name,
        message_template,
        total,
        limit,
        parseInt(delay_min) || 20,
        parseInt(delay_max) || 45
      );

      await taskRepo.addTasks(campaignId, targets || []);
      await logRepo.log(
        campaignId,
        'INFO',
        `Campaign '${name}' dibuat dengan ${total} target (Limit pengiriman: ${limit}).`
      );

      res.json({
        success: true,
        campaign_id: campaignId,
        total_targets: total
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  start(req, res) {
    try {
      const campaignId = parseInt(req.params.id);
      const simulation = req.query.simulation === 'true' || req.body?.simulation === true;
      const headless = req.query.headless === 'true' || req.body?.headless === true;
      const autoSolveCaptcha = req.query.auto_solve_captcha !== 'false' && req.body?.auto_solve_captcha !== false;

      if (botService.isRunning) {
        return res.status(400).json({ error: 'Campaign lain sedang berjalan di sistem.' });
      }

      // Run queue asynchronously in background
      botService.runCampaignQueue(campaignId, { simulation, headless, autoSolveCaptcha });

      res.json({
        success: true,
        message: 'Antrean proses outreach telah dimulai.'
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async pause(req, res) {
    try {
      const campaignId = parseInt(req.params.id);
      botService.pause();
      await campaignRepo.updateStatus(campaignId, 'paused');
      websocket.broadcast('campaign_status', { status: 'paused', campaign_id: campaignId });
      res.json({ success: true, message: 'Campaign dijeda sementara.' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async resume(req, res) {
    try {
      const campaignId = parseInt(req.params.id);
      botService.resume();
      await campaignRepo.updateStatus(campaignId, 'running');
      websocket.broadcast('campaign_status', { status: 'running', campaign_id: campaignId });
      res.json({ success: true, message: 'Campaign dilanjutkan.' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async stop(req, res) {
    try {
      const campaignId = parseInt(req.params.id);
      botService.stop();
      await campaignRepo.updateStatus(campaignId, 'stopped');
      websocket.broadcast('campaign_status', { status: 'stopped', campaign_id: campaignId });
      res.json({ success: true, message: 'Campaign dihentikan.' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async getLatest(req, res) {
    try {
      const campaign = await campaignRepo.findLatest();
      res.json({
        campaign,
        bot_running: botService.isRunning,
        bot_paused: botService.isPaused
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = new CampaignController();

