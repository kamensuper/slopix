// Screenshots of the cinematics: node tools/cine-shots.mjs <outDir>
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { ensureServer, launchBrowser, watchPage } from './browser.mjs';
const OUT = process.argv[2] ?? '/tmp/cine';
await mkdir(OUT, { recursive: true });
const server = await ensureServer();
const browser = await launchBrowser();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const problems = watchPage(page, { echo: true });
const shot = (n) => page.screenshot({ path: path.join(OUT, n + '.png') });
await page.goto(server.url, { waitUntil: 'load' });
await page.waitForSelector('[data-action=play]');
await page.evaluate(() => { window.__game.save.unlockAll = true; window.__game.save.setFlag('seenHowTo', true); });
// Boss intro: the last campaign level has the Baron.
await page.evaluate(() => window.__game.actions.playLevel(9));
await page.waitForTimeout(1500); await shot('1-boss-intro');
// Finisher: 2-1 is won by one Ember shot.
await page.evaluate(() => window.__game.actions.playLevel(3));
await page.waitForTimeout(2600);
await page.evaluate(() => { const s = window.__game.playScene; const p = s.sim.foes[0]; const pull = s.aimPull(p.x - 2, p.y, 1); s.sim.launch(pull.x, pull.y); });
await page.waitForFunction(() => window.__game.playScene.sim.birds.some((b) => b.impacted), null, { timeout: 8000 }).catch(() => {});
await page.evaluate(() => window.__game.playScene.sim.activateAbility());
await page.waitForFunction(() => window.__game.playScene.sim.foesAlive === 0, null, { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(450); await shot('2-finisher');
console.log('problems', problems.length);
await browser.close(); await server.close(); process.exit(0);
