const { launchPersistentBrowserContext } = require('./src/core/browser');

(async () => {
  let context;
  try {
    context = await launchPersistentBrowserContext({ headless: true });
    const page = context.pages()[0] || await context.newPage();

    console.log('Opening https://www.tiktok.com/messages...');
    await page.goto('https://www.tiktok.com/messages', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(r => setTimeout(r, 6000));

    console.log('Finding Marsono item in sidebar...');
    const marsono = await page.$('text="Marsono, M.Si"');
    if (marsono) {
      console.log('Clicking Marsono...');
      await marsono.click();
      await new Promise(r => setTimeout(r, 6000));
      console.log('URL after click:', page.url());
      await page.screenshot({ path: 'scratch_after_click_marsono.png' });

      const text = await page.innerText('body');
      console.log('Body after clicking Marsono:', text.substring(0, 400).replace(/\n+/g, ' '));
    } else {
      console.log('Marsono not found in sidebar!');
    }

  } catch (e) {
    console.error('Error:', e);
  } finally {
    if (context) await context.close();
  }
})();
