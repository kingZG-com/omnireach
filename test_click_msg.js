const { chromium } = require('playwright');
const { PROFILE_DIR } = require('./config/paths');
const { cleanLocks } = require('./src/core/browser');

(async () => {
  cleanLocks();
  const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    ignoreDefaultArgs: ['--enable-automation']
  });

  const page = await browser.newPage();
  console.log('Navigating to @blxyzo...');
  await page.goto('https://www.tiktok.com/@blxyzo', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 4000));

  console.log('Current URL:', page.url());
  const btn = await page.$('button[data-e2e="message-button"]');
  if (btn) {
    const box = await btn.boundingBox();
    console.log('Found button[data-e2e="message-button"] at:', box);
    
    // Now click the button and see what happens!
    console.log('Clicking message button...');
    await btn.click();
    
    // Wait and observe URL and UI for 10 seconds
    for (let i = 1; i <= 5; i++) {
      await new Promise(r => setTimeout(r, 2000));
      console.log(`After ${i*2}s: URL=${page.url()}`);
      const popups = await page.$$('div[class*="Chat"], div[class*="Drawer"], div[class*="popup"], div[class*="Modal"]');
      console.log(`  Found ${popups.length} potential popup/chat elements`);
    }

    await page.screenshot({ path: 'C:/Users/HP/.gemini/antigravity/brain/752d30fe-3d68-4cd1-858d-06dcb0956405/test_after_click_msg.png' });
    console.log('Screenshot saved to test_after_click_msg.png');
  } else {
    console.log('button[data-e2e="message-button"] NOT found on @blxyzo page');
    const allBtns = await page.$$eval('button', btns => btns.map(b => b.innerText.trim()).filter(Boolean));
    console.log('Available buttons on page:', allBtns);
  }

  await browser.close();
  cleanLocks();
})();

