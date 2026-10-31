const fs = require('fs');
const { COOKIES_FILE } = require('../../config/paths');
const {
  launchPersistentBrowserContext,
  launchHeadlessBrowser,
  applyTurboRouting,
  cleanLocks
} = require('../core/browser');
const websocket = require('../core/websocket');
const authService = require('./auth.service');
const tiktokService = require('./tiktok.service');
const campaignRepo = require('../database/repositories/campaign.repo');
const taskRepo = require('../database/repositories/task.repo');
const logRepo = require('../database/repositories/log.repo');

class BotService {
  constructor() {
    this.isRunning = false;
    this.isPaused = false;
    this.stopRequested = false;
    this.currentTaskId = null;
  }

  pause() {
    this.isPaused = true;
  }

  resume() {
    this.isPaused = false;
  }

  stop() {
    this.stopRequested = true;
    this.isRunning = false;
  }

  cleanTarget(targetInput) {
    const clean = (targetInput || '').trim();
    let username = clean;
    const match = clean.match(/tiktok\.com\/@([a-zA-Z0-9_\.\-]+)/);
    if (match) {
      username = match[1];
    } else {
      username = clean.replace(/^@+/, '').replace(/^https?:\/\//, '').split('/')[0];
    }
    return {
      username,
      target_url: `https://www.tiktok.com/@${username}`
    };
  }

  async runCampaignQueue(campaignId, runOptions = {}) {
    this.isRunning = true;
    this.isPaused = false;
    this.stopRequested = false;

    let simulation = false;
    let headless = false;
    let autoSolveCaptcha = true;

    if (typeof runOptions === 'boolean') {
      simulation = runOptions;
    } else if (typeof runOptions === 'object' && runOptions !== null) {
      simulation = !!runOptions.simulation;
      headless = !!runOptions.headless;
      autoSolveCaptcha = runOptions.autoSolveCaptcha !== false;
    }

    await campaignRepo.updateStatus(campaignId, 'running');
    const senderInfo = await authService.checkLoginStatus();
    const senderDisplay = senderInfo.username || 'Akun Aktif';

    const modeLabel = [
      simulation ? 'Simulasi: ON' : 'Live Mode',
      headless ? 'Headless (Senyap)' : 'Browser Visual',
      autoSolveCaptcha ? 'AI Captcha Resolver: ON' : 'Manual Captcha'
    ].join(' | ');

    await logRepo.log(
      campaignId,
      'INFO',
      `Memulai antrean Campaign ID: ${campaignId} | Pengirim: ${senderDisplay} [${modeLabel}]`
    );
    websocket.broadcast('campaign_status', { campaign_id: campaignId, status: 'running' });
    websocket.broadcast('log', {
      level: 'INFO',
      message: `👤 Akun Pengirim Aktif: ${senderDisplay} | Memulai proses Campaign ID: ${campaignId} [${modeLabel}]`
    });

    const campaign = await campaignRepo.findById(campaignId);
    if (!campaign) {
      this.isRunning = false;
      return;
    }

    const tasks = await taskRepo.findPendingByCampaign(campaignId, campaign.limit_count || 1000);
    const totalToProcess = tasks.length;

    if (totalToProcess === 0) {
      websocket.broadcast('log', {
        level: 'WARN',
        message: 'Tidak ada target yang berstatus pending dalam campaign ini.'
      });
      await campaignRepo.updateStatus(campaignId, 'completed');
      this.isRunning = false;
      return;
    }

    websocket.broadcast('log', {
      level: 'INFO',
      message: `Memproses ${totalToProcess} target akun pilihan...`
    });

    let processedCount = 0;
    let browser = null;
    let context = null;
    let page = null;

    try {
      if (simulation) {
        const headlessEngine = await launchHeadlessBrowser();
        browser = headlessEngine.browser;
        context = headlessEngine.context;
        page = await context.newPage();
      } else {
        context = await launchPersistentBrowserContext({ headless });

        if (fs.existsSync(COOKIES_FILE)) {
          try {
            const savedCookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf-8'));
            if (Array.isArray(savedCookies) && savedCookies.length > 0) {
              await context.addCookies(savedCookies);
            }
          } catch (e) {}
        }

        page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

        // ⚡ Turbo Engine Routing
        await applyTurboRouting(context);

        // Verifikasi sesi login
        const currentCookies = await context.cookies('https://www.tiktok.com');
        const hasSession = currentCookies.some((c) =>
          ['sessionid', 'sid_tt', 'uid_tt', 'sessionid_ss'].includes(c.name)
        );

        if (!hasSession && !fs.existsSync(COOKIES_FILE)) {
          websocket.broadcast('log', {
            level: 'ERROR',
            message:
              '❌ Sesi login TikTok belum ada! Silakan klik tombol "Login / Ganti Akun" di sidebar terlebih dahulu sebelum memulai outreach.'
          });
          await context.close();
          cleanLocks();
          await campaignRepo.updateStatus(campaignId, 'stopped');
          this.isRunning = false;
          return;
        }
      }

      for (const task of tasks) {
        if (this.stopRequested) break;
        while (this.isPaused) {
          await new Promise((r) => setTimeout(r, 1000));
          if (this.stopRequested) break;
        }
        if (this.stopRequested) break;

        this.currentTaskId = task.id;
        let res;

        if (simulation) {
          res = await tiktokService.sendSimulationDm(page, task, campaign.message_template);
        } else {
          res = await tiktokService.sendDirectMessage(
            page,
            task,
            campaign.message_template,
            senderDisplay,
            { autoSolveCaptcha }
          );
        }

        await taskRepo.updateResult(task.id, res.status, res.message_sent, res.proof_path, res.error_detail);
        processedCount++;

        websocket.broadcast('task_updated', {
          task_id: task.id,
          username: task.username,
          status: res.status,
          proof_path: res.proof_path,
          error_detail: res.error_detail,
          progress: {
            current: processedCount,
            total: totalToProcess
          }
        });

        if (processedCount < totalToProcess && !this.stopRequested) {
          const minDelay = campaign.delay_min || 20;
          const maxDelay = campaign.delay_max || 45;
          const delaySec = simulation
            ? Math.floor(Math.random() * 3) + 2
            : Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

          websocket.broadcast('log', {
            level: 'INFO',
            message: `Menunggu jeda aman ${delaySec} detik sebelum target berikutnya...`
          });

          for (let s = 0; s < delaySec; s++) {
            if (this.stopRequested) break;
            while (this.isPaused) {
              await new Promise((r) => setTimeout(r, 1000));
              if (this.stopRequested) break;
            }
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
      }
    } catch (err) {
      console.error('Queue execution error:', err);
      websocket.broadcast('log', {
        level: 'ERROR',
        message: `Terjadi kesalahan saat otomasi: ${err.message}`
      });
    } finally {
      if (context) {
        try {
          await context.close();
        } catch (e) {}
        cleanLocks();
      }
      if (browser) {
        try {
          await browser.close();
        } catch (e) {}
      }

      const finalStatus = this.stopRequested ? 'stopped' : 'completed';
      await campaignRepo.updateStatus(campaignId, finalStatus);
      websocket.broadcast('campaign_status', {
        campaign_id: campaignId,
        status: finalStatus
      });
      await logRepo.log(
        campaignId,
        'INFO',
        `Campaign selesai dengan status: ${finalStatus}. Total diproses: ${processedCount}.`
      );

      this.isRunning = false;
      this.isPaused = false;
      this.stopRequested = false;
      this.currentTaskId = null;
    }
  }
}

module.exports = new BotService();

