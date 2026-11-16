const fs = require('fs');
const path = require('path');
const { PROOFS_DIR } = require('../../config/paths');
const { SELECTORS } = require('../../config/constants');
const websocket = require('../core/websocket');
const captchaService = require('./captcha.service');

class TikTokService {
  async getFollowerCount(page) {
    try {
      const rawText = await page.evaluate(() => {
        const hasNumber = (str) => typeof str === 'string' && /[0-9]/.test(str);

        // 1. Cek elemen spesifik data-e2e="followers-count"
        const e2e = document.querySelector('[data-e2e="followers-count"]');
        if (e2e) {
          const txt = (e2e.textContent || e2e.innerText || '').trim();
          if (hasNumber(txt)) return txt;
          const title = (e2e.getAttribute('title') || '').trim();
          if (hasNumber(title)) return title;
        }

        // 2. Cek elemen lain yang memiliki data-e2e berhubungan dengan follower
        const altE2e = document.querySelectorAll('[data-e2e*="follower"], [data-e2e*="pengikut"]');
        for (const el of altE2e) {
          const txt = (el.textContent || el.innerText || '').trim();
          if (hasNumber(txt)) return txt;
        }

        // 3. Cek tag <strong> di dalam container header profil
        // Standar TikTok: <div><strong title="Followers">1194</strong><span>Followers</span></div>
        const strongs = document.querySelectorAll('strong');
        for (const s of strongs) {
          const parent = s.parentElement;
          if (parent) {
            const pText = (parent.textContent || '').toLowerCase();
            if (pText.includes('follower') || pText.includes('pengikut')) {
              const txt = (s.textContent || s.innerText || '').trim();
              if (hasNumber(txt)) return txt;
              const title = (s.getAttribute('title') || '').trim();
              if (hasNumber(title)) return title;
            }
          }
        }

        // 4. Fallback: Cari span atau div yang berada di container bertuliskan Followers/Pengikut
        const allSpans = document.querySelectorAll('span, div');
        for (const el of allSpans) {
          const parent = el.parentElement;
          if (parent) {
            const pText = (parent.textContent || '').toLowerCase();
            if (pText.includes('follower') || pText.includes('pengikut')) {
              const txt = (el.textContent || el.innerText || '').trim();
              if (hasNumber(txt) && txt.length < 20) {
                return txt;
              }
            }
          }
        }

        return null;
      });

      if (!rawText) return null;

      const parsedNum = this.parseFollowerCount(rawText);
      if (parsedNum === null) return null;

      return {
        raw: rawText,
        count: parsedNum
      };
    } catch (e) {
      return null;
    }
  }

  parseFollowerCount(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const clean = raw.trim();

    // 1. Ekstrak pola angka dengan satuan (K, M, B, rb, jt)
    // Contoh: '1.5K', '1,5 K', '10.2M', '5 rb', '1.2jt', '1.5K Followers'
    const suffixMatch = clean.match(/([0-9]+([\.,][0-9]+)?)\s*([kKmMbB]|rb|jt)/i);
    if (suffixMatch) {
      const numPart = parseFloat(suffixMatch[1].replace(',', '.'));
      const unit = suffixMatch[3].toLowerCase();
      if (!isNaN(numPart)) {
        if (unit === 'm' || unit === 'jt') {
          return Math.round(numPart * 1000000);
        }
        if (unit === 'k' || unit === 'rb') {
          return Math.round(numPart * 1000);
        }
        if (unit === 'b') {
          return Math.round(numPart * 1000000000);
        }
      }
    }

    // 2. Ekstrak angka biasa murni (dengan separator ribuan titik atau koma)
    // Contoh: '1000', '1.194', '1,194', '1194 Followers', '1000 Pengikut'
    const numberMatch = clean.match(/([0-9][0-9\.,]*)/);
    if (numberMatch) {
      const digitsOnly = numberMatch[1].replace(/[\.,]/g, '');
      const parsed = parseInt(digitsOnly, 10);
      return isNaN(parsed) ? null : parsed;
    }

    return null;
  }

  resolveMessageTemplate(templateConfig, followerInfo, username) {
    let config = null;
    if (typeof templateConfig === 'string') {
      try {
        config = JSON.parse(templateConfig);
      } catch (e) {
        config = null;
      }
    } else if (typeof templateConfig === 'object' && templateConfig !== null) {
      config = templateConfig;
    }

    let selectedTemplate = '';
    let tierLabel = 'Universal';
    let isTiered = false;
    const followerCount = followerInfo ? followerInfo.count : null;
    const followerRaw = followerInfo ? followerInfo.raw : null;

    if (config && config.mode === 'tiered') {
      isTiered = true;
      if (followerCount !== null && followerCount !== undefined) {
        if (followerCount >= 1000) {
          selectedTemplate = config.tier_1000 || config.fallback || config.tier_200 || '';
          tierLabel = 'Tier 1.000+ Followers';
        } else if (followerCount >= 200) {
          selectedTemplate = config.tier_200 || config.fallback || '';
          tierLabel = 'Tier 200+ Followers';
        } else {
          // Follower di bawah 200
          selectedTemplate = config.fallback || config.tier_200 || '';
          tierLabel = 'Cadangan (< 200 Followers)';
        }
      } else {
        // Follower gagal dibaca (akun privat / timeout)
        selectedTemplate = config.fallback || config.tier_200 || '';
        tierLabel = 'Cadangan (Follower Gagal Terbaca / Privat)';
      }
    } else {
      // Single template mode
      selectedTemplate = typeof templateConfig === 'string' ? templateConfig : (config?.message_template || '');
      tierLabel = 'Single Template';
    }

    const finalMessage = selectedTemplate
      .replace(/{username}/g, username)
      .replace(/{name}/g, username);

    return {
      message: finalMessage,
      tier: tierLabel,
      isTiered,
      followerCount,
      followerDisplay: followerRaw || (followerCount !== null ? followerCount.toLocaleString('id-ID') : 'Tidak terdeteksi')
    };
  }

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
    let resolved = this.resolveMessageTemplate(template, null, username);
    let message = resolved.message;
    let detectedFollowerDisplay = null;

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

      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 180000 });
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
        websocket.broadcast('log', {
          level: 'ERROR',
          message:
            '❌ TikTok meminta login! Sesi login Anda belum aktif atau sudah kedaluwarsa. Silakan klik tombol "Login / Ganti Akun" di sidebar terlebih dahulu.'
        });
        return {
          status: 'failed',
          message_sent: message,
          proof_path: null,
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
      let messageBtn = null;

      const waitProfileStart = Date.now();
      while (Date.now() - waitProfileStart < 180000) {
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
        if (editProfileBtn && (await editProfileBtn.isVisible().catch(() => false))) {
          isOwnProfile = true;
          profileLoaded = true;
          break;
        }

        // Tunggu profil dan tombol aksi ter-render di halaman profil target
        const hasHeader = await page
          .$("h1, h2, [data-e2e='user-title'], [data-e2e='user-subtitle']")
          .catch(() => null);
        const hasActionBtn = await page
          .$(
            "button:has-text('Message'), button:has-text('Pesan'), button[data-e2e='message-button'], button:has-text('Follow'), button:has-text('Ikuti'), button:has-text('Following'), button:has-text('Mengikuti'), button[data-e2e='follow-button']"
          )
          .catch(() => null);

        if (
          (hasHeader && (await hasHeader.isVisible().catch(() => false))) ||
          (hasActionBtn && (await hasActionBtn.isVisible().catch(() => false)))
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
        websocket.broadcast('log', {
          level: 'WARN',
          message: `Target @${username} adalah akun Anda sendiri. TikTok tidak menyediakan opsi kirim DM ke akun sendiri.`
        });
        return {
          status: 'failed',
          message_sent: message,
          proof_path: null,
          error_detail: 'Target adalah akun Anda sendiri (tidak bisa kirim DM ke diri sendiri)'
        };
      }

      if (!profileLoaded) {
        websocket.broadcast('log', {
          level: 'WARN',
          message: `Halaman profil @${username} belum selesai dimuat (timeout loading).`
        });
        return {
          status: 'failed',
          message_sent: message,
          proof_path: null,
          follower_count: null,
          error_detail: 'Halaman profil gagal dimuat (timeout loading / koneksi lambat)'
        };
      }

      // 📊 DETEKSI JUMLAH FOLLOWER & TENTUKAN TEMPLATE DINAMIS
      // Berikan waktu hingga 4 detik jika angka follower sedang di-render/hidrasi oleh TikTok web
      let followerInfo = null;
      const startFollowerCheck = Date.now();
      while (Date.now() - startFollowerCheck < 4000) {
        followerInfo = await this.getFollowerCount(page);
        if (followerInfo && followerInfo.count !== null) {
          break;
        }
        await new Promise((r) => setTimeout(r, 600));
      }

      if (followerInfo) {
        detectedFollowerDisplay = followerInfo.raw;
      }
      resolved = this.resolveMessageTemplate(template, followerInfo, username);
      message = resolved.message;

      if (resolved.isTiered) {
        websocket.broadcast('log', {
          level: 'INFO',
          message: `📊 Target @${username} [Followers: ${resolved.followerDisplay}] -> Memilih: ${resolved.tier}`
        });
      }

      // 🎯 CARI TOMBOL MESSAGE / PESAN DI SEBELAH TOMBOL FOLLOW DI PROFIL TARGET (ALUR NATURAL SEPERTI HUMAN)
      // Catatan penting: Hindari a[href*="/messages"] agar TIDAK pernah memencet ikon Messages di navbar kiri!
      messageBtn = null;
      const searchMsgStart = Date.now();
      while (Date.now() - searchMsgStart < 120000) {
        try {
          const allMsgCandidates = await page.$$(
            'button[data-e2e="message-button"], [data-e2e="message-button"], button:has-text("Message"), button:has-text("Pesan"), div[role="button"]:has-text("Message"), div[role="button"]:has-text("Pesan")'
          );
          for (const cand of allMsgCandidates) {
            if (await cand.isVisible().catch(() => false)) {
              const box = await cand.boundingBox().catch(() => null);
              // Tombol pesan di sebelah Follow berada di header profil (x >= 280 dan y <= 550)
              if (box && box.x >= 280 && box.y <= 550) {
                messageBtn = cand;
                break;
              }
            }
          }
        } catch (e) {}

        if (messageBtn) break;
        await new Promise((r) => setTimeout(r, 1000));
      }

      if (!messageBtn) {
        websocket.broadcast('log', {
          level: 'WARN',
          message: `Akun @${username} tidak memiliki tombol Pesan (DM ditutup / hanya teman yang bisa mengirim pesan).`
        });
        return {
          status: 'dm_closed',
          message_sent: message,
          proof_path: null,
          follower_count: detectedFollowerDisplay || resolved.followerDisplay,
          error_detail: 'DM ditutup / Tombol pesan tidak tersedia di profil'
        };
      }

      websocket.broadcast('log', {
        level: 'INFO',
        message: `Mengklik tombol Pesan di samping tombol Follow @${username} (seperti manusia)...`
      });

      // Gerakkan kursor ke tombol Pesan dan klik secara alami
      const btnBox = await messageBtn.boundingBox().catch(() => null);
      if (btnBox) {
        await page.mouse.move(btnBox.x + btnBox.width / 2, btnBox.y + btnBox.height / 2);
        await new Promise((r) => setTimeout(r, 300));
        await page.mouse.click(btnBox.x + btnBox.width / 2, btnBox.y + btnBox.height / 2);
      } else {
        await messageBtn.click().catch(() => {});
      }

      await new Promise((r) => setTimeout(r, 2000));

      const loginAfterMsgClick = await page
        .$('#loginContainer, [data-e2e="login-modal"], div[id*="loginContainer"]')
        .catch(() => null);
      if (loginAfterMsgClick && (await loginAfterMsgClick.isVisible().catch(() => false))) {
        websocket.broadcast('log', {
          level: 'ERROR',
          message:
            '❌ TikTok meminta login saat membuka tombol obrolan. Silakan login kembali melalui tombol "Login / Ganti Akun" di sidebar.'
        });
        return {
          status: 'failed',
          message_sent: message,
          proof_path: null,
          error_detail: 'TikTok meminta login saat membuka obrolan'
        };
      }

      // Cari kolom input chat (baik di halaman room chat maupun di drawer pesan)
      let inputBox = null;
      const waitInputStart = Date.now();
      while (Date.now() - waitInputStart < 180000) {
        for (const sel of SELECTORS.CHAT_INPUTS) {
          try {
            const el = await page.$(sel);
            if (el && (await el.isVisible().catch(() => false))) {
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
              if (box && box.height >= 20 && box.width >= 100) {
                inputBox = el;
                break;
              }
            }
          } catch (e) {}
        }
        if (inputBox) break;

        // Jika berada di halaman messages dan kolom input belum muncul:
        if (page.url().includes('/messages')) {
          try {
            const sideItems = await page.$$('div[data-e2e="chat-item"], div[class*="ConversationItem"], div[class*="DivConversationItem"], li, div[role="listitem"]');
            for (const item of sideItems) {
              const itemText = (await item.innerText().catch(() => '')).toLowerCase();
              const cleanUser = username.toLowerCase();
              if (itemText && (itemText.includes(cleanUser) || cleanUser.includes(itemText.split('\n')[0].toLowerCase()))) {
                const b = await item.boundingBox().catch(() => null);
                if (b && b.x < 450 && b.y > 60) {
                  await item.click().catch(() => {});
                  await new Promise((r) => setTimeout(r, 1500));
                  break;
                }
              }
            }
          } catch (e) {}
        }

        await new Promise((r) => setTimeout(r, 1000));
      }

      if (!inputBox) {
        return {
          status: 'failed',
          message_sent: message,
          proof_path: null,
          error_detail: 'Kolom input obrolan tidak ditemukan atau gagal terbuka (koneksi lambat / timeout)'
        };
      }

      const inputCoords = await inputBox.boundingBox().catch(() => null);
      if (inputCoords) {
        await page.mouse.click(inputCoords.x + 40, inputCoords.y + (inputCoords.height / 2 || 15));
      } else {
        await inputBox.click().catch(() => {});
      }
      await new Promise((r) => setTimeout(r, 600));

      // ⚡ INPUT PESAN UTUH SEBAGAI SATU KESATUAN (SINGLE BUBBLE)
      // Pastikan kolom input bersih dan masukkan seluruh pesan sekaligus tanpa memecah per-baris
      try {
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Backspace');
        await new Promise((r) => setTimeout(r, 200));
      } catch (e) {}

      let inputSuccess = false;
      try {
        await page.keyboard.insertText(message);
        inputSuccess = true;
      } catch (e) {
        inputSuccess = false;
      }

      // Verifikasi apakah kotak input sudah terisi pesan
      const currentVal = await page.evaluate(() => {
        const active = document.activeElement;
        return (active ? (active.innerText || active.value || '') : '').trim();
      }).catch(() => '');

      if (!currentVal) {
        // Fallback document.execCommand jika insertText belum terisi
        try {
          await page.evaluate((text) => {
            const active = document.activeElement;
            if (active) {
              document.execCommand('insertText', false, text);
              active.dispatchEvent(new Event('input', { bubbles: true }));
              active.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }, message);
        } catch (e) {}
      }

      await new Promise((r) => setTimeout(r, 800));

      // 2. Kirim pesan (Tekan tombol send atau Enter)
      let sentClicked = false;
      for (const sendSel of SELECTORS.SEND_BUTTONS) {
        try {
          const sendBtn = await page.$(sendSel);
          if (sendBtn && (await sendBtn.isVisible().catch(() => false))) {
            const sendBox = await sendBtn.boundingBox().catch(() => null);
            if (sendBox && sendBox.height > 10) {
              await sendBtn.click();
              sentClicked = true;
              break;
            }
          }
        } catch (e) {}
      }

      if (!sentClicked) {
        await page.keyboard.press('Enter');
      }

      // 3. 🎯 VERIFIKASI NYATA (REAL SENT CONFIRMATION):
      // Screenshot HANYA diambil ketika pesan benar-benar sudah muncul di layar ruang obrolan!
      const cleanSnippet = message.replace(/\s+/g, ' ').trim().slice(0, 20).toLowerCase();
      let isMessageConfirmedSent = false;
      const verifyStart = Date.now();

      while (Date.now() - verifyStart < 20000) {
        if (page.isClosed()) break;

        let checkResult = null;
        try {
          checkResult = await page.evaluate((snippet) => {
            if (!document || !document.body) return null;

            // Cari cuplikan pesan di ruang obrolan aktif sebelah kanan (x >= 280)
            let bubbleInActiveChat = false;
            const elements = Array.from(document.querySelectorAll('div, p, span'));
            for (const el of elements) {
              if (el.children.length === 0 && (el.innerText || '').toLowerCase().includes(snippet)) {
                const r = el.getBoundingClientRect();
                // Balon chat obrolan aktif berada di sebelah kanan (x >= 280) dan di atas area input (y < 850)
                if (r.x >= 280 && r.y >= 50 && r.y < 850 && r.width > 20) {
                  bubbleInActiveChat = true;
                  break;
                }
              }
            }

            const bodyText = (document.body.innerText || '').toLowerCase();
            const hasError = bodyText.includes('something went wrong') ||
                             bodyText.includes('ada masalah') ||
                             bodyText.includes('tidak terkirim demi keamanan') ||
                             bodyText.includes('not sent for safety');

            return {
              bubbleInActiveChat,
              hasError
            };
          }, cleanSnippet);
        } catch (e) {
          checkResult = null;
        }

        if (checkResult && !checkResult.hasError && checkResult.bubbleInActiveChat) {
          isMessageConfirmedSent = true;
          // Jeda 2 detik agar render balon chat dan centang status terkirim benar-benar sempurna di layar
          await new Promise((r) => setTimeout(r, 2000));
          break;
        }

        // Coba tekan Enter sekali lagi di detik ke-6 jika pesan masih tertahan di kotak input
        if (Date.now() - verifyStart > 6000 && !isMessageConfirmedSent) {
          try {
            if (!page.isClosed()) await page.keyboard.press('Enter');
          } catch (e) {}
        }

        await new Promise((r) => setTimeout(r, 1000));
      }

      // Ambil screenshot HANYA jika balon pesan sudah terbukti muncul di layar obrolan
      if (isMessageConfirmedSent) {
        try {
          if (!page.isClosed()) {
            await page.screenshot({ path: proofPath });
            websocket.broadcast('log', {
              level: 'SUCCESS',
              message: `📸 Bukti screenshot tersimpan: Balon pesan terkonfirmasi muncul di layar @${username}!`
            });
          }
        } catch (e) {}
      }

      if (!isMessageConfirmedSent) {
        websocket.broadcast('log', {
          level: 'WARN',
          message: `⚠️ Pesan untuk @${username} gagal terverifikasi di ruang obrolan (balon pesan tidak muncul di layar).`
        });
        return {
          status: 'failed',
          message_sent: message,
          proof_path: null,
          follower_count: detectedFollowerDisplay || resolved.followerDisplay,
          error_detail: 'Pesan belum terkirim (balon chat tidak muncul di layar chat feed)'
        };
      }

      websocket.broadcast('log', {
        level: 'SUCCESS',
        message: `✅ Pesan berhasil dikirim dan terverifikasi di ruang obrolan @${username}! Bukti tersimpan.`
      });

      return {
        status: 'sent',
        message_sent: message,
        proof_path: relProofPath,
        follower_count: detectedFollowerDisplay || resolved.followerDisplay,
        error_detail: null
      };
    } catch (err) {
      console.error(`Error sending DM to @${username}:`, err);
      return {
        status: 'failed',
        message_sent: message,
        proof_path: null,
        follower_count: detectedFollowerDisplay || resolved.followerDisplay,
        error_detail: err.message
      };
    }
  }

  async sendSimulationDm(page, task, template) {
    const { id: taskId, username, target_url: targetUrl } = task;

    // Untuk simulasi, simulasi deteksi follower jika template mode tiered
    const isTiered = typeof template === 'string' && template.includes('"mode":"tiered"');
    let simulatedFollower = null;
    if (isTiered) {
      const sampleFollowers = [
        { raw: '120', count: 120 },
        { raw: '450', count: 450 },
        { raw: '1.5K', count: 1500 },
        { raw: '12.8K', count: 12800 },
        null
      ];
      simulatedFollower = sampleFollowers[Math.floor(Math.random() * sampleFollowers.length)];
    }

    const resolved = this.resolveMessageTemplate(template, simulatedFollower, username);
    const message = resolved.message;

    const timestamp = Date.now();
    const proofFilename = `proof_${taskId}_${username}_${timestamp}.png`;
    const proofPath = path.join(PROOFS_DIR, proofFilename);
    const relProofPath = `proofs/${proofFilename}`;

    await new Promise((r) => setTimeout(r, 2000));
    const tierInfo = resolved.isTiered ? `[Followers: ${resolved.followerDisplay} -> ${resolved.tier}]` : '';
    websocket.broadcast('log', {
      level: 'INFO',
      message: `[Simulasi] Mengirim pesan ke @${username} ${tierInfo}...`
    });

    try {
      if (page) {
        await page.setContent(`
          <div style="font-family:sans-serif; background:#f8fafc; padding:40px; border:2px solid #e2e8f0; border-radius:12px;">
            <h2 style="color:#e11d48; margin-top:0;">TikReach DM Proof (Simulasi)</h2>
            <p><strong>Target:</strong> @${username} (${targetUrl})</p>
            ${resolved.isTiered ? `<p><strong>Follower Terdeteksi:</strong> <span style="background:#e0f2fe; color:#0369a1; padding:2px 8px; border-radius:4px; font-weight:bold;">${resolved.followerDisplay} (${resolved.tier})</span></p>` : ''}
            <p><strong>Waktu:</strong> ${new Date().toLocaleString()}</p>
            <div style="background:#fff1f2; border:1px solid #fecdd3; padding:15px; border-radius:8px; margin-top:20px;">
              <p style="margin:0; color:#9f1239; font-weight:bold;">Isi Pesan Terkirim:</p>
              <p style="margin:5px 0 0 0; color:#1e293b; white-space: pre-wrap;">${message}</p>
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
      follower_count: resolved.followerDisplay,
      error_detail: null
    };
  }
}

module.exports = new TikTokService();
