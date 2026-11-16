const { chromium } = require('playwright');
const { PROFILE_DIR } = require('./config/paths');
const { cleanLocks } = require('./src/core/browser');

(async () => {
  cleanLocks();
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    ignoreDefaultArgs: ['--enable-automation']
  });
  const page = await context.newPage();
  console.log('Opening https://www.tiktok.com/@shofi.zakaria ...');
  await page.goto('https://www.tiktok.com/@shofi.zakaria', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 4000));
  
  const results = await page.evaluate(() => {
    const list = [];
    // 1. Follow button
    const follow = document.querySelector('button[data-e2e="follow-button"], [data-e2e="follow-button"]');
    let followRect = null;
    if (follow) {
      const r = follow.getBoundingClientRect();
      followRect = { x: r.x, y: r.y, width: r.width, height: r.height, text: follow.innerText };
    }

    // 2. Scan all buttons and links
    const elements = document.querySelectorAll('button, a, div[role="button"]');
    for (const el of elements) {
      const txt = (el.innerText || '').trim();
      const href = el.getAttribute('href') || '';
      const e2e = el.getAttribute('data-e2e') || '';
      const r = el.getBoundingClientRect();
      
      if (
        txt.toLowerCase().includes('message') ||
        txt.toLowerCase().includes('pesan') ||
        href.includes('message') ||
        e2e.includes('message') ||
        e2e.includes('follow')
      ) {
        list.push({
          tag: el.tagName,
          text: txt,
          href,
          e2e,
          rect: { x: r.x, y: r.y, width: r.width, height: r.height }
        });
      }
    }

    return { followRect, list };
  });

  console.log('FOLLOW RECT:', JSON.stringify(results.followRect, null, 2));
  console.log('CANDIDATES:');
  for (const c of results.list) {
    console.log(`- <${c.tag}> [e2e="${c.e2e}"] [href="${c.href}"] text="${c.text.replace(/\n/g, ' ')}" at x=${c.rect.x}, y=${c.rect.y}, w=${c.rect.width}, h=${c.rect.height}`);
  }

  await page.screenshot({ path: 'C:/Users/HP/.gemini/antigravity/brain/752d30fe-3d68-4cd1-858d-06dcb0956405/scratch_shofi_page.png' });
  console.log('Screenshot saved to scratch_shofi_page.png');

  await context.close();
  cleanLocks();
})();

