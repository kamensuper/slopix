// Screenshots of the world and level menus: node tools/menu-shots.mjs <outDir>
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { ensureServer, launchBrowser, watchPage } from './browser.mjs';
const OUT = process.argv[2] ?? '/tmp/menu';
await mkdir(OUT, { recursive: true });
const server = await ensureServer();
const browser = await launchBrowser();
let problems = 0;
for (const [name, w, h, touch] of [['desktop', 1280, 720, false], ['phone', 390, 844, true], ['phone-wide', 844, 390, true]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage();
  const seen = watchPage(page, { echo: true });
  await page.goto(server.url, { waitUntil: 'load' });
  await page.waitForSelector('[data-action=play]');
  await page.evaluate(() => { window.__game.save.unlockAll = true; });
  await page.click('[data-action=play]'); await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, `${name}-worlds.png`) });
  await page.click('[data-action=chapter-3]'); await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, `${name}-levels.png`) });
  problems += seen.length;
  await ctx.close();
}
console.log('problems', problems);
await browser.close(); await server.close(); process.exit(0);
