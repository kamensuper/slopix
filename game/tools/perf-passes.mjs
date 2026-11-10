// Per-pass raster cost (each pass flushed with a 1px readback). Usage: W=1920 H=1080 node tools/perf-passes.mjs [level] [--dpr 2]
import { ensureServer, launchBrowser } from './browser.mjs';

const args = process.argv.slice(2);
const level = Number(args.find((a) => /^\d+$/.test(a)) ?? 29);
const dpr = Number(args[args.indexOf('--dpr') + 1] || 1);
const server = await ensureServer();
const browser = await launchBrowser();
try {
  const viewport = { width: Number(process.env.W || 1280), height: Number(process.env.H || 720) };
  const page = await (await browser.newContext({ viewport, deviceScaleFactor: dpr })).newPage();
  await page.goto(server.url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game?.ui.currentMenu === 'title');
  await page.evaluate((i) => {
    window.__game.save.setFlag('seenHowTo', true);
    window.__game.actions.playLevel(i);
  }, level);
  await page.waitForTimeout(2500);
  const report = await page.evaluate(async () => {
    const r = window.__game.renderer;
    const totals = {};
    const names = ['drawSky', 'drawGround', 'drawTerrain', 'drawBlock', 'drawBird', 'drawPig', 'drawSlingshotBack', 'drawSlingshotFront', 'drawForeground'];
    for (const name of names) {
      const orig = r[name].bind(r);
      r[name] = (...a) => {
        const s = performance.now();
        orig(...a);
        r.ctx.getImageData(0, 0, 1, 1);
        totals[name] = (totals[name] ?? 0) + performance.now() - s;
      };
    }
    let frames = 0;
    let all = 0;
    const scene = window.__game.scene;
    const ren = scene.render.bind(scene);
    scene.render = (c) => {
      const s = performance.now();
      ren(c);
      c.getImageData(0, 0, 1, 1);
      all += performance.now() - s;
      frames++;
    };
    await new Promise((res) => setTimeout(res, 2500));
    const parts = Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${(v / frames).toFixed(2)}`);
    return `total=${(all / frames).toFixed(2)}ms  ${parts.join('  ')}`;
  });
  console.log(report);
} finally {
  await browser.close();
  await server.close();
}
