/**
 * Scratch: Diagnosis halaman /messages - apakah bisa buka chat room?
 * Juga test: klik sidebar item pertama, apakah bisa buka?
 */
const { chromium } = require('playwright');
const path = require('path');
const { PROFILE_DIR } = require('./config/paths');

(async () => {
  console.log('Profile dir:', PROFILE_DIR);
  const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    ignoreDefaultArgs: ['--enable-automation'],
  });

  const page = browser.pages()[0] || await browser.newPage();
  page.setDefaultTimeout(0);

  console.log('Membuka halaman messages...');
  await page.goto('https://www.tiktok.com/messages?lang=en', { waitUntil: 'domcontentloaded', timeout: 0 });
  await new Promise(r => setTimeout(r, 5000));

  // Screenshot 1: State awal
  await page.screenshot({ path: 'C:/Users/HP/.gemini/antigravity/brain/752d30fe-3d68-4cd1-858d-06dcb0956405/diag_messages_initial.png' });
  console.log('Screenshot 1 (awal) tersimpan');

  // Ambil semua sidebar items
  const items = await page.$$('div[class*="ConversationItem"], div[class*="DivConversationItem"], div[data-e2e="chat-item"]');
  console.log(`Jumlah sidebar items ditemukan: ${items.length}`);

  for (let i = 0; i < items.length; i++) {
    const b = await items[i].boundingBox().catch(() => null);
    const txt = await items[i].innerText().catch(() => '').then(t => t.slice(0, 50));
    console.log(`  Item ${i}: box=${JSON.stringify(b)}, text="${txt.replace(/\n/g, ' ')}"`);
  }

  // Coba klik item pertama yang valid
  let clicked = false;
  for (const item of items) {
    const b = await item.boundingBox().catch(() => null);
    if (b && b.x < 450 && b.y > 60 && b.width > 100 && b.height > 30) {
      console.log(`Mengklik item di: x=${b.x}, y=${b.y}, w=${b.width}, h=${b.height}`);
      await item.click().catch(e => console.log('Klik gagal:', e.message));
      clicked = true;
      break;
    }
  }

  if (!clicked) {
    console.log('Tidak ada sidebar item valid, coba klik koordinat y=85...');
    await page.mouse.click(170, 85);
  }

  await new Promise(r => setTimeout(r, 4000));
  await page.screenshot({ path: 'C:/Users/HP/.gemini/antigravity/brain/752d30fe-3d68-4cd1-858d-06dcb0956405/diag_messages_after_click.png' });
  console.log('Screenshot 2 (setelah klik) tersimpan');

  // Cek apakah ada input box
  const inputSels = [
    'div[data-e2e="dm-new-input-editor"]',
    'div[class*="DivInputAreaContainer"]',
    'div[class*="DivEditorContainer"]',
    'div[contenteditable="true"]',
    'textarea',
  ];
  for (const sel of inputSels) {
    const el = await page.$(sel);
    if (el && await el.isVisible()) {
      const b = await el.boundingBox();
      console.log(`✅ Input box ditemukan dengan sel "${sel}": ${JSON.stringify(b)}`);
    }
  }

  // Cek apakah ada "Something went wrong"
  const bodyText = await page.innerText('body').catch(() => '');
  if (bodyText.toLowerCase().includes('something went wrong')) {
    console.log('❌ "Something went wrong" masih terdeteksi di halaman!');
  } else {
    console.log('✅ "Something went wrong" TIDAK ditemukan');
  }

  console.log('\nURL saat ini:', page.url());
  console.log('Done. Browser tetap terbuka 30 detik...');
  await new Promise(r => setTimeout(r, 30000));
  await browser.close();
})();
