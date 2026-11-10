// Performance probe: per-frame cost of simulation and rendering in headless Chrome.
// Usage: node tools/perf.mjs [levelIndex] [--dpr 2]
import { ensureServer, launchBrowser } from './browser.mjs';

const args = process.argv.slice(2);
const level = Number(args.find((a) => /^\d+$/.test(a)) ?? 29);
const dpr = Number(args[args.indexOf('--dpr') + 1] || 1);
const server = await ensureServer();
const browser = await launchBrowser();
try {
  const page = await (await browser.newContext({ viewport: { width: Number(process.env.W || 1280), height: Number(process.env.H || 720) }, deviceScaleFactor: dpr })).newPage();
  await page.goto(server.url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game?.ui.currentMenu === 'title');
  const measure = (label) =>
    page.evaluate(async (label) => {
      const game = window.__game;
      const scene = game.scene;
      const t = { update: 0, render: 0, frames: 0, step: 0, steps: 0 };
      const upd = scene.update.bind(scene);
      const ren = scene.render.bind(scene);
      scene.update = (dt) => {
        const s = performance.now();
        upd(dt);
        t.update += performance.now() - s;
      };
      scene.render = (ctx) => {
        const s = performance.now();
        ren(ctx);
        ctx.getImageData(0, 0, 1, 1); // flush so raster cost is counted
        t.render += performance.now() - s;
        t.frames++;
      };
      const sim = scene.sim;
      const step = sim.step.bind(sim);
      sim.step = () => {
        const s = performance.now();
        step();
        t.step += performance.now() - s;
        t.steps++;
      };
      const start = performance.now();
      await new Promise((r) => setTimeout(r, 3000));
      const secs = (performance.now() - start) / 1000;
      return `${label.padEnd(10)} fps=${(t.frames / secs).toFixed(0)} render=${(t.render / t.frames).toFixed(2)}ms update=${(t.update / t.frames).toFixed(2)}ms (sim step ${(t.step / Math.max(1, t.steps)).toFixed(2)}ms x${(t.steps / t.frames).toFixed(2)}/frame)`;
    }, label);
  console.log(await measure('menu'));
  await page.evaluate((i) => {
    window.__game.save.setFlag('seenHowTo', true);
    window.__game.actions.playLevel(i);
  }, level);
  await page.waitForTimeout(2500);
  console.log(await measure('aiming'));
  // Fire a strong shot into the structure and measure the collapse.
  await page.evaluate(() => {
    const scene = window.__game.playScene;
    const pig = [...scene.sim.pigs].sort((a, b) => a.x - b.x)[0];
    const pull = scene.aimPull(pig.x, pig.y, 1);
    scene.sim.launch(pull.x, pull.y);
  });
  console.log(await measure('impact'));
} finally {
  await browser.close();
  await server.close();
}
