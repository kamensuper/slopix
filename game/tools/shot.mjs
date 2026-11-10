#!/usr/bin/env node
// Screenshot helper.
//
//   node tools/shot.mjs <page-path-or-url> [out.png] [options]
//
//   <page-path-or-url>   e.g. "dev/birds.html", "/?level=3" or a full http(s) URL
//   [out.png]            defaults to <repo>/.hoplite/artifacts/shot.png; relative paths are resolved there
//
//   --w 1280 --h 720     viewport size in CSS px
//   --dpr 1              device pixel ratio
//   --wait 600           ms to wait after load before the screenshot
//   --eval "js"          expression evaluated in the page after the wait (its JSON result is printed)
//   --after 300          ms to wait after --eval
//   --touch              emulate a touch device (mobile viewport, touch events)
//   --full               capture the full scrollable page
//
// Console errors, warnings and uncaught exceptions of the page are echoed to stdout.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { ARTIFACTS, ensureServer, launchBrowser, watchPage } from './browser.mjs';

const args = process.argv.slice(2);
const positional = [];
const options = { w: 1280, h: 720, dpr: 1, wait: 600, after: 300, eval: '', touch: false, full: false };
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    if (key === 'touch' || key === 'full') options[key] = true;
    else if (key === 'eval') options.eval = args[++i] ?? '';
    else options[key] = Number(args[++i]);
  } else positional.push(arg);
}

if (positional.length === 0) {
  console.error('usage: node tools/shot.mjs <page-path-or-url> [out.png] [--w 1280 --h 720 --dpr 1 --wait 600 --eval "js" --touch --full]');
  process.exit(2);
}

const target = positional[0];
const outArg = positional[1] ?? 'shot.png';
const out = path.isAbsolute(outArg) ? outArg : path.join(ARTIFACTS, outArg);
await mkdir(path.dirname(out), { recursive: true });

const server = /^https?:/.test(target) ? { url: '', close: async () => {} } : await ensureServer();
const url = /^https?:/.test(target) ? target : `${server.url}/${target.replace(/^\//, '')}`;
const browser = await launchBrowser();
let exitCode = 0;
try {
  const context = await browser.newContext({
    viewport: { width: options.w, height: options.h },
    deviceScaleFactor: options.dpr,
    hasTouch: options.touch,
    isMobile: options.touch,
  });
  const page = await context.newPage();
  watchPage(page);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(options.wait);
  if (options.eval) {
    const result = await page.evaluate(options.eval);
    if (result !== undefined) console.log('[eval]', JSON.stringify(result));
    await page.waitForTimeout(options.after);
  }
  await page.screenshot({ path: out, fullPage: options.full });
  console.log(`saved ${out}`);
} catch (error) {
  console.error(`shot failed: ${error instanceof Error ? error.message : error}`);
  exitCode = 1;
} finally {
  await browser.close();
  await server.close();
}
process.exit(exitCode);
