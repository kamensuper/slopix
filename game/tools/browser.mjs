// Shared helpers for the browser-driven tools (screenshots, end-to-end tests, performance probes).
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = path.resolve(ROOT, '..');
/** Screenshots and other throw-away output go here (git-ignored). */
export const ARTIFACTS = path.join(REPO_ROOT, '.hoplite', 'artifacts');

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/usr/local/bin/google-chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

/** Launches headless Chrome. Set CHROME_PATH to point at a specific binary. */
export async function launchBrowser(extraArgs = []) {
  const executablePath = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
  return chromium.launch({
    ...(executablePath ? { executablePath } : { channel: 'chrome' }),
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', ...extraArgs],
  });
}

async function isUp(url) {
  try {
    const response = await fetch(`${url}/`, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Returns the base URL of a running dev server. Reuses GAME_URL / localhost:5173 when something
 * answers there, otherwise starts a private Vite dev server for the lifetime of the tool.
 */
export async function ensureServer() {
  const preferred = (process.env.GAME_URL || `http://localhost:${process.env.GAME_PORT || 5173}`).replace(/\/$/, '');
  if (await isUp(preferred)) return { url: preferred, close: async () => {} };

  const { createServer } = await import('vite');
  // Private cache dir: several tools may start servers at the same time.
  const cacheDir = path.join(ROOT, 'node_modules', `.vite-tool-${process.pid}`);
  const server = await createServer({
    root: ROOT,
    logLevel: 'error',
    cacheDir,
    server: { host: '127.0.0.1', port: 5300 + Math.floor(Math.random() * 500), strictPort: false },
  });
  await server.listen();
  const url = (server.resolvedUrls?.local[0] ?? '').replace(/\/$/, '');
  return {
    url,
    close: async () => {
      await server.close();
      await rm(cacheDir, { recursive: true, force: true });
    },
  };
}

/** Collects console errors / warnings and uncaught exceptions of a page. */
export function watchPage(page, { echo = true } = {}) {
  const problems = [];
  page.on('console', (message) => {
    const type = message.type();
    if (type !== 'error' && type !== 'warning') return;
    const entry = `[console.${type}] ${message.text()}`;
    problems.push(entry);
    if (echo) console.log(entry);
  });
  page.on('pageerror', (error) => {
    const entry = `[pageerror] ${error.message}`;
    problems.push(entry);
    if (echo) console.log(entry);
  });
  return problems;
}
