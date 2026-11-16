const { launchPersistentBrowserContext } = require('./src/core/browser');

(async () => {
  let context;
  try {
    context = await launchPersistentBrowserContext({ headless: true });
    const page = context.pages()[0] || await context.newPage();

    console.log('Opening https://www.tiktok.com/messages...');
    await page.goto('https://www.tiktok.com/messages', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(r => setTimeout(r, 6000));

    // Click Marsono to open the chat room
    const marsono = await page.$('text="Marsono, M.Si"');
    if (marsono) {
      await marsono.click();
      await new Promise(r => setTimeout(r, 4000));

      const chatInfo = await page.evaluate(() => {
        // Inspect chat feed / history elements
        const bubbles = [];
        document.querySelectorAll('div[class*="Message"], div[class*="Chat"], p, span').forEach(el => {
          const t = (el.innerText || '').trim();
          if (t && (t.includes('Message request') || t.includes('deleted a message') || el.getAttribute('data-e2e'))) {
            bubbles.push({
              tag: el.tagName,
              e2e: el.getAttribute('data-e2e'),
              className: el.className,
              text: t.substring(0, 80)
            });
          }
        });

        // Inspect input box
        const inputs = [];
        document.querySelectorAll('div[contenteditable="true"], textarea, [data-e2e*="input"], div[class*="InputArea"]').forEach(el => {
          inputs.push({
            tag: el.tagName,
            e2e: el.getAttribute('data-e2e'),
            className: el.className,
            text: el.innerText || el.value || '',
            contentEditable: el.getAttribute('contenteditable')
          });
        });

        return { bubbles: bubbles.slice(0, 10), inputs };
      });

      console.log('Chat Info:', JSON.stringify(chatInfo, null, 2));
    }

  } catch (e) {
    console.error('Error:', e);
  } finally {
    if (context) await context.close();
  }
})();

