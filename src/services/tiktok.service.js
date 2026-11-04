const fs = require('fs');
const path = require('path');
const { PROOFS_DIR } = require('../../config/paths');
const { SELECTORS } = require('../../config/constants');
const websocket = require('../core/websocket');
const captchaService = require('./captcha.service');

class TikTokService {
  async dismissOverlays(page) {
    try {
      const cookieBtn = await page.$(
        "button:has-text('Allow all'), button:has-text('Accept all'), button:has-text('Izinkan semua')"
      );
      if (cookieBtn && (await cookieBtn.isVisible())) {
        await cookieBtn.click().catch(() => {});
      }
      const toastCloses = await page.$$("button[aria-label='Close'], button[aria-label='Tutup']");
      for (const tc of toastCloses) {
        try {
          if (await tc.isVisible()) await tc.click().catch(() => {});
        } catch (e) {}
      }
    } catch (e) {}
  }

  async checkAndHandleCaptcha(page, autoSolve = true) {
    if (autoSolve) {
      return await captchaService.resolvePuzzleCaptcha(page);
    }

    const selector = SELECTORS.CAPTCHA_CONTAINERS.join(', ');
    let captchaEl = await page.$(selector).catch(() => null);

    if (captchaEl && (await captchaEl.isVisible())) {
      websocket.broadcast('log', {
        level: 'WARN',
        message:
          '⚠️ Terdeteksi Verifikasi Puzzle Captcha TikTok di browser! Silakan geser puzzle di jendela browser Anda (menunggu hingga 60 detik)...'
      });

      const startTime = Date.now();
      while (Date.now() - startTime < 60000) {
        await new Promise((r) => setTimeout(r, 2000));
        captchaEl = await page.$(selector).catch(() => null);
        if (!captchaEl || !(await captchaEl.isVisible())) {
          websocket.broadcast('log', {
            level: 'INFO',
            message: 'Captcha berhasil diselesaikan! Melanjutkan proses outreach...'
          });
          await new Promise((r) => setTimeout(r, 2000));
          break;
        }
      }
    }
  }

  async sendDirectMessage(page, task, template, senderUsername, options = {}) {
    const autoSolveCaptcha = options.autoSolveCaptcha !== false;
    const { id: taskId, username, target_url: targetUrl } = task;
    const message = template.replace(/{username}/g, username).replace(/{name}/g, username);

    const timestamp = Date.now();
    const proofFilename = `proof_${taskId}_${username}_${timestamp}.png`;
    const proofPath = path.join(PROOFS_DIR, proofFilename);
    const relProofPath = `proofs/${proofFilename}`;

    // 1. Validasi: Target akun sendiri
    const currentSenderClean = (senderUsername || '').replace(/^@+/, '').toLowerCase();
    if (
      currentSenderClean &&
      currentSenderClean !== 'akun tiktok aktif' &&
      currentSenderClean !== 'akun aktif' &&
      username.toLowerCase() === currentSenderClean
    ) {
      websocket.broadcast('log', {
        level: 'WARN',
        message: `Target @${username} adalah akun pengirim yang sedang aktif (${senderUsername}). TikTok tidak mengizinkan kirim DM ke akun sendiri.`
      });
      return {
        status: 'failed',
        message_sent: message,
        proof_path: null,
        error_detail: `Target adalah akun pengirim sendiri (${senderUsername})`
      };
    }

    try {
      websocket.broadcast('log', {
        level: 'INFO',
        message: `Membuka profil target: ${targetUrl}...`
      });

      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await this.dismissOverlays(page);

      // Cek apakah halaman dialihkan ke halaman login
      const isLoginRequired = await page.evaluate(() => {
        const url = window.location.href;
        if (url.includes('/login')) return true;
        const modal = document.querySelector(
          '#loginContainer, [data-e2e="login-modal"], div[id*="loginContainer"]'
        );
        return !!modal;
      });

      if (isLoginRequired) {
        try {
          await page.screenshot({ path: proofPath });
        } catch (e) {}
        websocket.broadcast('log', {
          level: 'ERROR',
          message:
            '❌ TikTok meminta login! Sesi login Anda belum aktif atau sudah kedaluwarsa. Silakan klik tombol "Login / Ganti Akun" di sidebar terlebih dahulu.'
        });
        return {
          status: 'failed',
          message_sent: message,
          proof_path: relProofPath,
          error_detail: 'TikTok meminta login (sesi belum aktif / kedaluwarsa)'
        };
      }

      await this.checkAndHandleCaptcha(page, autoSolveCaptcha);
      await this.dismissOverlays(page);

      websocket.broadcast('log', {
        level: 'INFO',
        message: `Memuat tampilan profil @${username}...`
      });

      let profileLoaded = false;
      let is404 = false;
      let isOwnProfile = false;
      let targetMessageHref = null;
      let messageBtn = null;

      const waitProfileStart = Date.now();
      while (Date.now() - waitProfileStart < 20000) {
        await this.checkAndHandleCaptcha(page, autoSolveCaptcha);
        await this.dismissOverlays(page);

        const bodyText = await page.innerText('body').catch(() => '');
        if (
          bodyText.includes("Couldn't find this account") ||
          bodyText.includes('Tidak dapat menemukan akun ini')
        ) {
          is404 = true;
          break;
        }

        // Cek tombol Edit profile (akun sendiri)
        const editProfileBtn = await page
          .$(
            "button:has-text('Edit profile'), button:has-text('Edit profil'), a[href*='/edit-profile']"
          )
          .catch(() => null);
        if (editProfileBtn && (await editProfileBtn.isVisible())) {
          isOwnProfile = true;
          profileLoaded = true;
          break;
        }

        // ⚡ Optimasi Cepat: Jika link endpoint /messages?u= sudah ada di DOM
        const quickMsgLink = await page
          .evaluate(() => {
            const links = Array.from(document.querySelectorAll('a[href*="messages"]'));
            for (const a of links) {
              const h = a.getAttribute('href') || '';
              if (h.includes('u=')) return h;
            }
            return null;
          })
          .catch(() => null);

        if (quickMsgLink) {
          targetMessageHref = quickMsgLink;
          profileLoaded = true;
          break;
        }

        const hasHeader = await page
          .$("h1, h2, [data-e2e='user-title'], [data-e2e='user-subtitle']")
          .catch(() => null);
        const hasActionBtn = await page
          .$(
            "button:has-text('Message'), button:has-text('Pesan'), button[data-e2e='user-message-btn'], button:has-text('Follow'), button:has-text('Ikuti'), button:has-text('Following'), button:has-text('Mengikuti'), button[data-e2e='follow-button']"
          )
          .catch(() => null);

        if (
          (hasHeader && (await hasHeader.isVisible())) ||
          (hasActionBtn && (await hasActionBtn.isVisible()))
        ) {
          profileLoaded = true;
          break;
        }

        await new Promise((r) => setTimeout(r, 1000));
      }

      if (is404) {
        websocket.broadcast('log', {
          level: 'WARN',
          message: `Akun @${username} tidak ditemukan (404).`
        });
        return {
          status: 'failed',
          message_sent: message,
          proof_path: null,
          error_detail: 'Akun tidak ditemukan (404)'
        };
      }

      if (isOwnProfile) {
        try {
          await page.screenshot({ path: proofPath });
        } catch (e) {}
        websocket.broadcast('log', {
          level: 'WARN',
          message: `Target @${username} adalah akun Anda sendiri. TikTok tidak menyediakan opsi kirim DM ke akun sendiri.`
        });
        return {
          status: 'failed',
          message_sent: message,
          proof_path: relProofPath,
          error_detail: 'Target adalah akun Anda sendiri (tidak bisa kirim DM ke diri sendiri)'
        };
      }

      if (!profileLoaded) {
        try {
          await page.screenshot({ path: proofPath });
        } catch (e) {}
        websocket.broadcast('log', {
          level: 'WARN',
          message: `Halaman profil @${username} belum selesai dimuat (timeout loading).`
        });
        return {
          status: 'failed',
          message_sent: message,
          proof_path: relProofPath,
          error_detail: 'Halaman profil gagal dimuat (timeout loading / koneksi lambat)'
        };
      }

            // 🎯 1. AUTO-FOLLOW TARGET SEBELUM DM (Wajib Follow Terlebih Dahulu Sebelum DM)
      try {
        let followBtn = null;
        let isAlreadyFollowing = false;

        const followSearchStart = Date.now();
        while (Date.now() - followSearchStart < 6000) {
          // Prioritas 1: Selector resmi data-e2e="follow-button" di profil
          const directFollow = await page.$('button[data-e2e="follow-button"]');
          if (directFollow && (await directFollow.isVisible().catch(() => false))) {
            const txt = (await directFollow.innerText().catch(() => '')).trim();
            const lower = txt.toLowerCase();
            if (
              ['follow', 'follow back', 'ikuti', 'ikuti balik'].includes(lower)
            ) {
              followBtn = directFollow;
              break;
            } else if (
              ['following', 'mengikuti', 'friends', 'teman'].includes(lower)
            ) {
              isAlreadyFollowing = true;
              break;
            }
          }

          // Prioritas 2: Fallback scan semua tombol di area profil utama (x > 180, y < 400)
          const allBtns = await page.$$('button, div[role="button"]');
          for (const btn of allBtns) {
            if (!(await btn.isVisible().catch(() => false))) continue;
            const txt = (await btn.innerText().catch(() => '')).trim();
            const lower = txt.toLowerCase();
            const box = await btn.boundingBox().catch(() => null);
            if (box && box.x > 180 && box.y < 400) {
              if (
                ['follow', 'follow back', 'ikuti', 'ikuti balik'].includes(lower)
              ) {
                followBtn = btn;
                break;
              } else if (
                ['following', 'mengikuti', 'friends', 'teman'].includes(lower)
              ) {
                isAlreadyFollowing = true;
                break;
              }
            }
          }

          if (followBtn || isAlreadyFollowing) break;
          await new Promise((r) => setTimeout(r, 800));
        }

        if (followBtn) {
          websocket.broadcast('log', {
            level: 'INFO',
            message: `Mem-follow akun target @${username} terlebih dahulu sebelum mengirim DM...`
          });
          await followBtn.click().catch(() => {});
          await new Promise((r) => setTimeout(r, 2000));
          websocket.broadcast('log', {
            level: 'SUCCESS',
            message: `Berhasil mem-follow @${username}! Melanjutkan proses DM...`
          });
        } else if (isAlreadyFollowing) {
          websocket.broadcast('log', {
            level: 'INFO',
            message: `Status follow @${username}: Sudah di-follow (Following / Friends).`
          });
        } else {
          websocket.broadcast('log', {
            level: 'INFO',
            message: `Info @${username}: Tombol follow tidak ditemukan atau sudah ter-follow.`
          });
        }
      } catch (fErr) {
        websocket.broadcast('log', {
          level: 'WARN',
          message: `Catatan auto-follow @${username}: ${fErr.message}`
        });
      }

      // 🎯 2. CARI DAN KLIK TOMBOL MESSAGE PROFIL (PASTIKAN BUKAN NAVBAR KIRI x < 180)
      messageBtn = null;
      const searchMsgStart = Date.now();
      while (Date.now() - searchMsgStart < 10000) {
        // Prioritas 1: link atau button profil dengan href messages?u= atau data-e2e
        try {
          const directProfileMsg = await page.$('a[href*="/messages?"][href*="u="], a[href*="/messages"][href*="u="], button[data-e2e="message-button"], [data-e2e="user-message-btn"]');
          if (directProfileMsg && (await directProfileMsg.isVisible())) {
            const box = await directProfileMsg.boundingBox().catch(() => null);
            if (box && box.x > 180 && box.y < 400) {
              messageBtn = directProfileMsg;
              const href = await directProfileMsg.getAttribute('href').catch(() => null);
              if (href && href.includes('u=')) targetMessageHref = href;
              break;
            }
          }
        } catch (e) {}

        // Prioritas 2: scan semua button/link di area profil target (x > 180, y < 400) dengan teks 'Message' atau 'Pesan'
        try {
          const allCandidates = await page.$$('a, button, div[role="button"]');
          for (const el of allCandidates) {
            if (!(await el.isVisible().catch(() => false))) continue;
            const txt = (await el.innerText().catch(() => '')).trim();
            if (txt === 'Message' || txt === 'Pesan' || txt.toLowerCase() === 'message' || txt.toLowerCase() === 'pesan') {
              const box = await el.boundingBox().catch(() => null);
              // WAJIB x > 180 agar TIDAK mengklik tombol navbar di samping kiri (x: 16)
              if (box && box.x > 180 && box.y < 400) {
                messageBtn = el;
                const href = await el.getAttribute('href').catch(() => null);
                if (href && href.includes('u=')) targetMessageHref = href;
                break;
              }
            }
          }
        } catch (e) {}

        if (messageBtn) break;
        await new Promise((r) => setTimeout(r, 1000));
      }

      if (!messageBtn && !targetMessageHref) {
        try {
          await page.screenshot({ path: proofPath });
        } catch (e) {}
        websocket.broadcast('log', {
          level: 'WARN',
          message: `Akun @${username} menutup DM atau hanya untuk teman / mutual follow.`
        });
        return {
          status: 'dm_closed',
          message_sent: message,
          proof_path: relProofPath,
          error_detail: 'DM ditutup / Hanya teman yang bisa mengirim pesan'
        };
      }

      websocket.broadcast('log', {
        level: 'INFO',
        message: `Membuka obrolan dengan @${username}...`
      });

      // Jika endpoint direct message (u=...) tersedia, langsung buka room chat secara mulus
      if (targetMessageHref) {
        const fullMsgUrl = targetMessageHref.startsWith('http')
          ? targetMessageHref
          : `https://www.tiktok.com${targetMessageHref.startsWith('/') ? '' : '/'}${targetMessageHref}`;
        websocket.broadcast('log', {
          level: 'INFO',
          message: `Membuka link endpoint chat langsung: ${fullMsgUrl}...`
        });
        await page.goto(fullMsgUrl, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});
      } else if (messageBtn) {
        websocket.broadcast('log', {
          level: 'INFO',
          message: `Mengklik tombol Message profil @${username}...`
        });
        await messageBtn.click().catch(() => {});
      }

      await new Promise((r) => setTimeout(r, 2000));

      const loginAfterMsgClick = await page
        .$('#loginContainer, [data-e2e="login-modal"], div[id*="loginContainer"]')
        .catch(() => null);
      if (loginAfterMsgClick && (await loginAfterMsgClick.isVisible())) {
        try {
          await page.screenshot({ path: proofPath });
        } catch (e) {}
        websocket.broadcast('log', {
          level: 'ERROR',
          message:
            '❌ TikTok meminta login saat membuka tombol obrolan. Silakan login kembali melalui tombol "Login / Ganti Akun" di sidebar.'
        });
        return {
          status: 'failed',
          message_sent: message,
          proof_path: relProofPath,
          error_detail: 'TikTok meminta login saat membuka obrolan'
        };
      }

      // Cari kolom input chat (baik di halaman room chat maupun di drawer pesan)
      let inputBox = null;
      let isRestrictedOrError = false;
      const waitInputStart = Date.now();
      while (Date.now() - waitInputStart < 20000) {
        for (const sel of SELECTORS.CHAT_INPUTS) {
          try {
            const el = await page.$(sel);
            if (el && (await el.isVisible())) {
              const dataE2e = (await el.getAttribute('data-e2e').catch(() => '')) || '';
              const placeholder = (await el.getAttribute('placeholder').catch(() => '')) || '';
              if (
                dataE2e === 'search-user-input' ||
                placeholder.toLowerCase().includes('search') ||
                placeholder.toLowerCase().includes('cari')
              ) {
                continue;
              }
              const box = await el.boundingBox().catch(() => null);
              if (box && box.height > 15) {
                inputBox = el;
                break;
              }
            }
          } catch (e) {}
        }
        if (inputBox) break;

        // Cek jika TikTok menampilkan robot error setelah minimal 6 detik (agar tidak false positive saat loading)
        if (Date.now() - waitInputStart > 6000) {
          const hasErrorRobot = await page.evaluate(() => {
            const text = document.body ? document.body.innerText : '';
            return text.includes('Something went wrong') || text.includes('Sorry about that');
          }).catch(() => false);

          if (hasErrorRobot) {
            isRestrictedOrError = true;
            break;
          }
        }

        await new Promise((r) => setTimeout(r, 1000));
      }

      if (isRestrictedOrError) {
        try {
          await page.screenshot({ path: proofPath });
        } catch (e) {}
        websocket.broadcast('log', {
          level: 'WARN',
          message: `?? Akun @${username} membatasi DM (TikTok menampilkan 'Something went wrong'). Akun ini hanya menerima pesan dari mutual follow / Friends.`
        });
        return {
          status: 'dm_closed',
          message_sent: message,
          proof_path: relProofPath,
          error_detail: 'DM dibatasi oleh privasi akun target (Something went wrong / Friends only)'
        };
      }

      if (!inputBox) {
        try {
          await page.screenshot({ path: proofPath });
        } catch (e) {}
        return {
          status: 'failed',
          message_sent: message,
          proof_path: relProofPath,
          error_detail: 'Kolom input obrolan tidak ditemukan atau gagal terbuka'
        };
      }

      await inputBox.click();
      await new Promise((r) => setTimeout(r, 400));

      // ⚡ INPUT PESAN MULTI-LINE CERDAS:
      // Di TikTok Web, 'Enter' biasa langsung MENGIRIM pesan.
      // Agar pesan tetap MENYATU dalam 1 balon obrolan dengan paragraf baru,
      // kita gunakan 'Shift+Enter' di antara setiap baris!
            // ? INPUT PESAN MULTI-LINE UTUH (1 BALON CHAT):
      // Di TikTok Web, event 'Enter' biasa langsung MENGIRIM pesan.
      // Agar template dengan baris baru / paragraf tetap MENYATU dalam 1 balon pesan,
      // kita gunakan document.execCommand('insertText') terlebih dahulu agar tidak memicu Enter terpisah.
      let inputSuccess = false;
      try {
        inputSuccess = await page.evaluate((text) => {
          const active = document.activeElement;
          if (!active) return false;
          const ok = document.execCommand('insertText', false, text);
          if (ok) {
            active.dispatchEvent(new Event('input', { bubbles: true }));
            active.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
          return false;
        }, message);
      } catch (e) {
        inputSuccess = false;
      }

      // Fallback jika execCommand tidak mengisi: gunakan kombinasi resmi Playwright Shift+Enter
      const currentVal = await inputBox.innerText().catch(() => '');
      if (!inputSuccess || !currentVal || !currentVal.trim()) {
        const lines = message.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          const lineText = lines[i];
          if (lineText.length > 0) {
            try {
              await page.keyboard.insertText(lineText);
            } catch (err) {
              await page.keyboard.type(lineText, { delay: 10 });
            }
          }
          // Di Playwright gunakan sintaks resmi 'Shift+Enter' agar tidak mengirim pesan terpisah
          if (i < lines.length - 1) {
            await page.keyboard.press('Shift+Enter');
            await new Promise((r) => setTimeout(r, 150));
          }
        }
      }

      await new Promise((r) => setTimeout(r, 600));

      let sent = false;
      for (const sendSel of SELECTORS.SEND_BUTTONS) {
        try {
          const sendBtn = await page.$(sendSel);
          if (sendBtn && (await sendBtn.isVisible())) {
            await sendBtn.click();
            sent = true;
            break;
          }
        } catch (e) {}
      }

      if (!sent) {
        await page.keyboard.press('Enter');
      }

      await new Promise((r) => setTimeout(r, 3000));

      try {
        await page.screenshot({ path: proofPath });
      } catch (e) {}

      websocket.broadcast('log', {
        level: 'SUCCESS',
        message: `Berhasil mengirim DM ke @${username}! Bukti tersimpan.`
      });

      return {
        status: 'sent',
        message_sent: message,
        proof_path: relProofPath,
        error_detail: null
      };
    } catch (err) {
      console.error(`Error sending DM to @${username}:`, err);
      try {
        await page.screenshot({ path: proofPath });
      } catch (e) {}
      return {
        status: 'failed',
        message_sent: message,
        proof_path: fs.existsSync(proofPath) ? relProofPath : null,
        error_detail: err.message
      };
    }
  }

  async sendSimulationDm(page, task, template) {
    const { id: taskId, username, target_url: targetUrl } = task;
    const message = template.replace(/{username}/g, username).replace(/{name}/g, username);

    const timestamp = Date.now();
    const proofFilename = `proof_${taskId}_${username}_${timestamp}.png`;
    const proofPath = path.join(PROOFS_DIR, proofFilename);
    const relProofPath = `proofs/${proofFilename}`;

    await new Promise((r) => setTimeout(r, 2000));
    websocket.broadcast('log', {
      level: 'INFO',
      message: `[Simulasi] Mengirim pesan ke @${username}...`
    });

    try {
      if (page) {
        await page.setContent(`
          <div style="font-family:sans-serif; background:#f8fafc; padding:40px; border:2px solid #e2e8f0; border-radius:12px;">
            <h2 style="color:#e11d48; margin-top:0;">TikReach DM Proof (Simulasi)</h2>
            <p><strong>Target:</strong> @${username} (${targetUrl})</p>
            <p><strong>Waktu:</strong> ${new Date().toLocaleString()}</p>
            <div style="background:#fff1f2; border:1px solid #fecdd3; padding:15px; border-radius:8px; margin-top:20px;">
              <p style="margin:0; color:#9f1239; font-weight:bold;">Isi Pesan Terkirim:</p>
              <p style="margin:5px 0 0 0; color:#1e293b;">${message}</p>
            </div>
            <p style="color:#059669; font-weight:bold; margin-top:20px;">Status: Simulasi Terkirim Sukses ✓✓</p>
          </div>
        `);
        await page.screenshot({ path: proofPath });
      } else {
        fs.writeFileSync(proofPath.replace('.png', '.txt'), `Simulasi DM ke @${username}\n${message}`);
      }
    } catch (err) {}

    return {
      status: 'sent',
      message_sent: message,
      proof_path: relProofPath,
      error_detail: null
    };
  }
}

module.exports = new TikTokService();

