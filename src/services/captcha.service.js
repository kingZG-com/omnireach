/**
 * Captcha Service - Automated TikTok Puzzle Slider Resolver
 * Handles detection, gap offset calculation, and humanized mouse drag-and-drop.
 */

const websocket = require('../core/websocket');

class CaptchaService {
  constructor() {
    this.SLIDER_BUTTON_SELECTORS = [
      '.secsdk-captcha-drag-icon',
      '.captcha_verify_slide__drag-btn',
      'div[class*="drag-icon"]',
      'div[class*="secsdk-drag-icon"]',
      'div[class*="slide__drag-btn"]',
      'div[role="slider"]',
      '.captcha-slider-btn',
      'div[class*="captcha-drag"]'
    ];

    this.BACKGROUND_IMAGE_SELECTORS = [
      '#captcha-verify-image',
      'img[class*="captcha_verify_img"]',
      'img[class*="captcha-verify-image"]',
      'img[src*="captcha"]',
      '.captcha_verify_container img'
    ];

    this.PIECE_IMAGE_SELECTORS = [
      'img[class*="captcha_verify_img_slide"]',
      'img[class*="slide-img"]',
      '#captcha_verify_piece',
      'img[src*="slide"]'
    ];
  }

  /**
   * Check if a puzzle captcha is visible on the page
   */
  async isCaptchaVisible(page) {
    return await page.evaluate(() => {
      const selectors = [
        '.captcha_verify_container',
        '#tiktok-verify-ele',
        'div[class*="captcha_verify"]',
        'div[id*="verify-bar"]',
        '#captcha-verify-image'
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null && window.getComputedStyle(el).display !== 'none') {
          return true;
        }
      }
      return false;
    }).catch(() => false);
  }

  /**
   * Detect and solve puzzle captcha automatically
   */
  async resolvePuzzleCaptcha(page, maxRetries = 3) {
    const isVisible = await this.isCaptchaVisible(page);
    if (!isVisible) return { solved: true, attempts: 0 };

    websocket.broadcast('log', {
      level: 'WARN',
      message: '🧩 Terdeteksi Puzzle Captcha TikTok! AI Captcha Resolver mulai menganalisis target kepingan...'
    });

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        websocket.broadcast('log', {
          level: 'INFO',
          message: `🔍 [Percobaan ${attempt}/${maxRetries}] Menganalisis jarak celah (gap offset) puzzle...`
        });

        // 1. Tunggu gambar captcha benar-benar termuat di DOM
        await page.waitForTimeout(1500);

        // 2. Hitung jarak celah (gap X offset) di dalam browser context via Canvas analysis
        const analysis = await page.evaluate(() => {
          // Cari background image & piece image
          const bgImg = document.querySelector(
            '#captcha-verify-image, img[class*="captcha_verify_img"], img[class*="captcha-verify-image"]'
          );
          const pieceImg = document.querySelector(
            'img[class*="captcha_verify_img_slide"], img[class*="slide-img"], #captcha_verify_piece'
          );
          const sliderBtn = document.querySelector(
            '.secsdk-captcha-drag-icon, .captcha_verify_slide__drag-btn, div[class*="drag-icon"], div[role="slider"]'
          );

          if (!bgImg) return { error: 'Background image not found' };

          // Ambil dimensi riil di layar
          const bgRect = bgImg.getBoundingClientRect();
          const bgWidth = bgRect.width || 340;
          const bgHeight = bgRect.height || 212;

          // Buat canvas in-memory untuk memindai pixel kontras celah puzzle
          const canvas = document.createElement('canvas');
          canvas.width = bgWidth;
          canvas.height = bgHeight;
          const ctx = canvas.getContext('2d');

          try {
            ctx.drawImage(bgImg, 0, 0, bgWidth, bgHeight);
            const imgData = ctx.getImageData(0, 0, bgWidth, bgHeight).data;

            // Pindai kolom vertikal dari X = 50px (karena puzzle tidak pernah di pojok paling kiri)
            // Celah puzzle biasanya memiliki bayangan hitam / border kontras tinggi
            let bestX = 140;
            let maxDarkEdges = 0;

            for (let x = 60; x < bgWidth - 50; x++) {
              let darkEdgeCount = 0;
              for (let y = 30; y < bgHeight - 30; y++) {
                const idx = (y * bgWidth + x) * 4;
                const r = imgData[idx];
                const g = imgData[idx + 1];
                const b = imgData[idx + 2];
                const brightness = (r * 299 + g * 587 + b * 114) / 1000;

                // Cek pixel tetangga sebelah kiri untuk mencari drop kecerahan mendadak (edge shadow)
                const leftIdx = (y * bgWidth + (x - 2)) * 4;
                const lr = imgData[leftIdx];
                const lg = imgData[leftIdx + 1];
                const lb = imgData[leftIdx + 2];
                const leftBrightness = (lr * 299 + lg * 587 + lb * 114) / 1000;

                const diff = leftBrightness - brightness;
                if (diff > 45 && brightness < 110) {
                  darkEdgeCount++;
                }
              }

              if (darkEdgeCount > maxDarkEdges) {
                maxDarkEdges = darkEdgeCount;
                bestX = x;
              }
            }

            return {
              success: true,
              targetX: bestX,
              bgWidth,
              bgHeight
            };
          } catch (err) {
            // Jika terkena cross-origin canvas issue, gunakan estimasi rasio standar
            return {
              success: true,
              targetX: Math.floor(bgWidth * 0.55),
              bgWidth,
              isFallback: true
            };
          }
        });

        if (!analysis || !analysis.success) {
          websocket.broadcast('log', {
            level: 'WARN',
            message: 'Gagal mendeteksi gambar puzzle secara otomatis. Menunggu...'
          });
          await page.waitForTimeout(2000);
          continue;
        }

        // Cari elemen tombol geser slider
        let dragHandle = null;
        for (const sel of this.SLIDER_BUTTON_SELECTORS) {
          const el = await page.$(sel).catch(() => null);
          if (el && (await el.isVisible())) {
            dragHandle = el;
            break;
          }
        }

        if (!dragHandle) {
          websocket.broadcast('log', {
            level: 'WARN',
            message: 'Handle tombol drag puzzle tidak ditemukan.'
          });
          await page.waitForTimeout(2000);
          continue;
        }

        const handleBox = await dragHandle.boundingBox();
        if (!handleBox) continue;

        const startX = handleBox.x + handleBox.width / 2;
        const startY = handleBox.y + handleBox.height / 2;

        // Jarak target X yang harus digeser slider
        let slideDistance = analysis.targetX;
        // Koreksi offset kepingan (posisi awal kepingan biasanya ~10-20px dari kiri)
        if (slideDistance > 30) {
          slideDistance -= 15;
        }

        // Sedikit variasi jitter pada retry
        if (attempt === 2) slideDistance += 3;
        if (attempt === 3) slideDistance -= 3;

        websocket.broadcast('log', {
          level: 'INFO',
          message: `🎯 Target celah terdeteksi pada jarak ~${Math.round(slideDistance)}px. Menggerakkan slider dengan kurva manusiawi...`
        });

        // 3. Eksekusi Humanized Drag & Drop
        await this.humanDrag(page, startX, startY, slideDistance);

        // 4. Tunggu respons verifikasi TikTok (1.5 detik)
        await page.waitForTimeout(2000);

        // Cek apakah captcha sudah hilang
        const stillVisible = await this.isCaptchaVisible(page);
        if (!stillVisible) {
          websocket.broadcast('log', {
            level: 'SUCCESS',
            message: '🎉 AI Captcha Resolver BERHASIL menyelesaikan Puzzle TikTok!'
          });
          return { solved: true, attempts: attempt };
        } else {
          websocket.broadcast('log', {
            level: 'WARN',
            message: `Percobaan ${attempt} belum pas, mencoba verifikasi ulang...`
          });
          await page.waitForTimeout(1500);
        }
      } catch (err) {
        console.error('Captcha solver iteration error:', err);
        await page.waitForTimeout(1500);
      }
    }

    // Jika setelah 3x gagal, beri tahu user (atau tunggu jika headed mode)
    websocket.broadcast('log', {
      level: 'WARN',
      message: '⚠️ Puzzle captcha masih muncul setelah 3x coba otomatis. Memberi jeda 30 detik...'
    });

    const manualStart = Date.now();
    while (Date.now() - manualStart < 30000) {
      await page.waitForTimeout(2000);
      if (!(await this.isCaptchaVisible(page))) {
        websocket.broadcast('log', {
          level: 'SUCCESS',
          message: 'Captcha terverifikasi! Melanjutkan outreach...'
        });
        return { solved: true, attempts: maxRetries };
      }
    }

    return { solved: false, attempts: maxRetries };
  }

  /**
   * Menggerakkan mouse dengan akselerasi, perlambatan (easing), dan jitter alami
   */
  async humanDrag(page, startX, startY, distance) {
    await page.mouse.move(startX, startY);
    await page.waitForTimeout(100 + Math.random() * 50);
    await page.mouse.down();
    await page.waitForTimeout(80 + Math.random() * 40);

    const steps = 25 + Math.floor(Math.random() * 10);
    let currentX = startX;
    let currentY = startY;

    for (let i = 1; i <= steps; i++) {
      const progress = i / steps;
      // Easing curve (ease-out cubic)
      const ease = 1 - Math.pow(1 - progress, 3);
      const targetStepX = startX + distance * ease;

      // Jitter kecil pada sumbu Y (+/- 1-2px) seperti tangan manusia
      const yJitter = (Math.random() - 0.5) * 2;
      currentX = targetStepX;
      currentY = startY + yJitter;

      await page.mouse.move(currentX, currentY);

      // Kecepatan gerak bervariasi: cepat di awal, lambat di akhir
      const delay = progress < 0.7 ? 5 + Math.random() * 8 : 15 + Math.random() * 15;
      await page.waitForTimeout(delay);
    }

    // Sedikit overshoot 2-3px lalu koreksi balik (gerakan alami reflek mata manusia)
    await page.mouse.move(currentX + 2, currentY);
    await page.waitForTimeout(50);
    await page.mouse.move(currentX, currentY);
    await page.waitForTimeout(150);

    // Lepaskan klik mouse
    await page.mouse.up();
  }
}

module.exports = new CaptchaService();

