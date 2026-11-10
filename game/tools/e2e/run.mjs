// End-to-end smoke test in headless Chrome with real mouse and touch input.
// Usage: npm run e2e   (screenshots go to .hoplite/artifacts/e2e-*.png)
import path from 'node:path';
import { ARTIFACTS, ensureServer, launchBrowser, watchPage } from '../browser.mjs';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
};
const shot = (page, name) => page.screenshot({ path: path.join(ARTIFACTS, `e2e-${name}.png`) });
const info = (page) => page.evaluate(() => window.__game.debugInfo());

/** Screen positions of the loaded bird and of the pouch pulled to hit the target with the given power. */
async function aimPoints(page, targetIndex, power) {
  return page.evaluate(
    ([i, p]) => {
      const scene = window.__game.playScene;
      const sim = scene.sim;
      const pig = sim.pigs.filter((x) => x.alive).sort((a, b) => a.x - b.x)[i] ?? sim.pigs[0];
      const pull = scene.aimPull(pig.x, pig.y, p);
      const cam = scene.camera;
      return {
        from: { x: cam.toScreenX(sim.anchor.x), y: cam.toScreenY(sim.anchor.y) },
        to: { x: cam.toScreenX(sim.anchor.x + pull.x), y: cam.toScreenY(sim.anchor.y + pull.y) },
        pull,
      };
    },
    [targetIndex, power],
  );
}

async function waitFor(page, fn, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await page.evaluate(fn)) return true;
    await page.waitForTimeout(150);
  }
  return false;
}

const server = await ensureServer();
const browser = await launchBrowser();
try {
  // ------------------------------------------------------------------ desktop / mouse
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const problems = watchPage(page, { echo: false });
  await page.goto(server.url, { waitUntil: 'load' });
  await page.waitForSelector('[data-action=play]');
  await page.click('[data-action=play]');
  await page.click('[data-action=chapter-0]');
  check('level 2 locked on a fresh save', await page.isDisabled('[data-action=level-1]'));
  await page.click('[data-action=level-0]');
  await page.click('[data-action=close-howto]');
  await page.waitForTimeout(2600);
  await shot(page, 'aim-before');

  let launched = false;
  for (let attempt = 0; attempt < 4; attempt++) {
    const phase = (await info(page)).play.phase;
    if (phase !== 'aiming' || (await info(page)).play.pigs === 0) break;
    const { from, to, pull } = await aimPoints(page, 0, 0.9);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let s = 1; s <= 12; s++) await page.mouse.move(from.x + ((to.x - from.x) * s) / 12, from.y + ((to.y - from.y) * s) / 12);
    if (attempt === 0) await shot(page, 'aim-drag');
    await page.mouse.up();
    await page.waitForTimeout(250);
    const bird = await page.evaluate(() => {
      const b = window.__game.playScene.sim.activeBird;
      return b ? { vx: b.vx, vy: b.vy } : null;
    });
    if (attempt === 0) {
      launched = !!bird;
      check('mouse drag launches the bird', launched);
      check('bird flies opposite to the drag', !!bird && Math.sign(bird.vx) === -Math.sign(pull.x) && Math.sign(bird.vy) === -Math.sign(pull.y), JSON.stringify({ pull, bird }));
      await page.waitForTimeout(500);
      const cam = (await info(page)).play;
      check('camera follows the bird', cam.mode === 'follow', cam.mode);
    }
    await waitFor(page, () => ['aiming', 'won', 'lost'].includes(window.__game.debugInfo().play?.phase));
  }
  const won = await waitFor(page, () => !!document.querySelector('[data-kind=results]'), 20000);
  const end = await info(page);
  check('results screen appears', won, `phase=${end.play?.phase} score=${end.play?.score}`);
  await page.waitForTimeout(2200);
  await shot(page, 'results');
  const stars = await page.$$eval('.result-stars .star.lit', (s) => s.length);
  check('stars revealed on a win', end.play?.phase !== 'won' || stars >= 1, `stars=${stars}`);

  // Restart, pause / resume.
  await page.click('[data-action=retry]');
  await page.waitForTimeout(400);
  const fresh = await info(page);
  check('retry restores the level', fresh.play.phase === 'aiming' && fresh.play.score === 0 && fresh.play.tick < 60, JSON.stringify(fresh.play.queue));
  await page.click('[data-action=pause]');
  check('pause menu opens', await page.isVisible('[data-kind=pause]'));
  const t0 = (await info(page)).play.tick;
  await page.waitForTimeout(400);
  check('simulation is frozen while paused', (await info(page)).play.tick === t0);
  await page.click('[data-action=resume]');
  check('resume closes the pause menu', !(await page.isVisible('[data-kind=pause]')));

  // Persistence across reloads.
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('[data-action=play]');
  await page.click('[data-action=play]');
  await page.click('[data-action=chapter-0]');
  check('progress persists after reload (level 2 unlocked)', end.play?.phase !== 'won' || !(await page.isDisabled('[data-action=level-1]')));
  await shot(page, 'levels');
  check('no console errors (desktop)', problems.length === 0, problems.slice(0, 3).join(' | '));

  // ------------------------------------------------------------------ mobile / touch + ability
  const mctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const mpage = await mctx.newPage();
  const mproblems = watchPage(mpage, { echo: false });
  await mpage.goto(server.url, { waitUntil: 'load' });
  await mpage.waitForSelector('[data-action=play]');
  await mpage.evaluate(() => {
    window.__game.save.unlockAll = true;
    window.__game.save.setFlag('seenHowTo', true);
    window.__game.actions.playLevel(10); // 2-1, Chuck
  });
  await mpage.waitForTimeout(2600);
  const cdp = await mctx.newCDPSession(mpage);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const { from, to } = await aimPoints(mpage, 0, 0.95);
  await touch('touchStart', from.x, from.y);
  for (let s = 1; s <= 10; s++) await touch('touchMove', from.x + ((to.x - from.x) * s) / 10, from.y + ((to.y - from.y) * s) / 10);
  await touch('touchEnd');
  await mpage.waitForTimeout(450);
  check('touch drag launches the bird', !!(await mpage.evaluate(() => window.__game.playScene.sim.activeBird)));
  await mpage.touchscreen.tap(400, 150);
  await mpage.waitForTimeout(120);
  const used = await mpage.evaluate(() => window.__game.playScene.sim.activeBird?.abilityUsed === true);
  check('tap activates the ability (Chuck boost)', used);
  await shot(mpage, 'mobile-boost');
  await mpage.waitForTimeout(3000);
  await shot(mpage, 'mobile-after');
  check('no console errors (mobile)', mproblems.length === 0, mproblems.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  await server.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
