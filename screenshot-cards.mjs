import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1400, height: 900 });

  console.log('Opening card-test.html...');
  await page.goto('http://localhost:5173/card-test.html', { waitUntil: 'networkidle', timeout: 30000 });

  // Wait for generation to complete
  await page.waitForSelector('[data-ready="true"]', { timeout: 30000 });
  console.log('Cards generated, taking screenshots...');

  // Screenshot full page grid
  await page.screenshot({ path: path.join(__dirname, 'cards-all.png'), fullPage: true });
  console.log('Saved: cards-all.png');

  // Screenshot each iframe individually
  const frames = [
    { id: 'id-front',  out: 'card-id-front.png'  },
    { id: 'id-back',   out: 'card-id-back.png'   },
    { id: 'biz-front', out: 'card-biz-front.png' },
    { id: 'biz-back',  out: 'card-biz-back.png'  },
  ];

  for (const { id, out } of frames) {
    const el = await page.$(`#${id}`);
    if (el) {
      await el.screenshot({ path: path.join(__dirname, out) });
      console.log(`Saved: ${out}`);
    } else {
      console.warn(`Not found: #${id}`);
    }
  }

  await browser.close();
  console.log('Done.');
})();
