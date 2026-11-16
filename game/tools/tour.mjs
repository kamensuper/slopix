import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { ensureServer, launchBrowser, watchPage } from './browser.mjs';
const OUT = process.argv[2];
await mkdir(OUT, { recursive: true });
const server = await ensureServer();
const browser = await launchBrowser();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const problems = watchPage(page, { echo: true });
const shot = (n) => page.screenshot({ path: path.join(OUT, n + '.png') });
await page.goto(server.url, { waitUntil: 'load' });
await page.waitForSelector('[data-action=play]');
await page.waitForTimeout(800);
await shot('01-title');
await page.click('[data-action=play]'); await page.waitForTimeout(700); await shot('02-chapters');
await page.click('[data-action=chapter-0]'); await page.waitForTimeout(700); await shot('03-levels');
await page.evaluate(() => { window.__game.save.unlockAll = true; window.__game.save.setFlag('seenHowTo', true); });
for (const [i, name] of [[0,'04-play-1-1'],[4,'05-play-2-2'],[9,'06-play-3-4']]) {
  await page.evaluate((i) => window.__game.actions.playLevel(i), i);
  await page.waitForTimeout(3000); await shot(name);
}
// fire a shot in level 2-1 (index 3)
await page.evaluate(() => window.__game.actions.playLevel(3));
await page.waitForTimeout(2600);
await page.evaluate(() => { const s = window.__game.playScene; const p = s.sim.foes[0]; const pull = s.aimPull(p.x - 2, p.y, 1); s.sim.launch(pull.x, pull.y); });
await page.waitForTimeout(1500); await shot('07-flight');
await page.waitForTimeout(900); await shot('08-impact');
await page.evaluate(() => { const s = window.__game.playScene; s.sim.activateAbility(); });
await page.waitForTimeout(350); await shot('09-explosion');
await page.waitForTimeout(9000); await shot('10-after');
console.log(JSON.stringify(await page.evaluate(() => window.__game.debugInfo())));
await page.evaluate(() => window.__game.actions.requestPause()); await page.waitForTimeout(500); await shot('11-pause');
await page.evaluate(() => { window.__game.actions.resume(); window.__game.ui.showMenu('settings'); }); await page.waitForTimeout(600); await shot('12-settings');
console.log('problems', problems.length);
await browser.close(); await server.close(); process.exit(0);
