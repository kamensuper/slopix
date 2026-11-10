/**
 * Dev gallery for the environment: one band per world with its sky, parallax layers and ground,
 * every decor kind standing on the ground and sample terrain pieces.
 *   ?theme=desert      show a single world, larger
 *   ?zoom=40           pixels per metre for decor / terrain (default fits the band)
 *   ?t=12              animation time in seconds (cloud drift, sway)
 *   ?cam=20            camera x in metres (pans the parallax layers)
 */
import { RENDER } from '../src/core/config';
import type { ThemeId } from '../src/core/types';
import { DECOR, paintDecor, paintTerrain, sceneFor } from '../src/render/art/environment';
import { EnvRenderer } from '../src/render/art/envLayers';
import type { EnvView, TerrainSpec } from '../src/render/art/types';

const params = new URLSearchParams(location.search);
const only = params.get('theme') as ThemeId | null;
const themes: ThemeId[] = only ? [only] : ['grasslands', 'desert', 'snowlands'];
const time = Number(params.get('t') ?? 6);
const canvas = document.getElementById('c') as HTMLCanvasElement;
const dpr = Math.min(2, window.devicePixelRatio || 1);
const W = window.innerWidth;
const H = window.innerHeight;
canvas.width = W * dpr;
canvas.height = H * dpr;
canvas.style.width = `${W}px`;
canvas.style.height = `${H}px`;
const ctx = canvas.getContext('2d')!;
const SPRITE = RENDER.spritePxPerMeter / 100;

const terrains: TerrainSpec[] = [
  { shape: 'rect', w: 300, h: 160 },
  { shape: 'poly', w: 800, h: 220, points: [[-400, 110], [400, 110], [180, -110], [-180, -110]] },
  { shape: 'rect', w: 120, h: 260 },
  { shape: 'rect', w: 340, h: 60 },
];

const bandH = H / themes.length;
themes.forEach((theme, row) => {
  const top = row * bandH;
  const band = document.createElement('canvas');
  band.width = Math.round(W * dpr);
  band.height = Math.round(bandH * dpr);
  const bctx = band.getContext('2d', { alpha: false })!;
  const zoom = Number(params.get('zoom') ?? bandH / 7.2);
  const groundY = bandH * 0.84;
  const camX = Number(params.get('cam') ?? W / zoom / 2);
  const view: EnvView = { width: W, height: bandH, camX, camY: 0, zoom, time, groundY, worldWidth: W / zoom, seed: 3 };
  const env = new EnvRenderer(sceneFor);
  bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  env.drawSky(bctx, theme, view, dpr, 3);
  const scale = (dpr * zoom) / 100;
  let x = 1.2;
  const labels: [string, number][] = [];
  for (const [kind, info] of Object.entries(DECOR)) {
    if (info.theme !== theme) continue;
    x += info.w / 2;
    bctx.setTransform(scale, 0, 0, scale, dpr * x * zoom, dpr * groundY);
    paintDecor(bctx, kind, 1);
    labels.push([kind, x]);
    x += info.w / 2 + 0.5;
  }
  // Terrain samples rest on the ground (their bounding box is centred on the origin).
  for (const spec of terrains) {
    x += spec.w / 200;
    bctx.setTransform(scale, 0, 0, scale, dpr * x * zoom, dpr * (groundY - (spec.h / 200) * zoom));
    paintTerrain(bctx, theme, spec, Math.round(x));
    x += spec.w / 200 + 0.5;
  }
  bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  env.drawGround(bctx, theme, view, dpr);
  env.drawForeground(bctx, theme, view, dpr);
  bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  bctx.font = '600 12px system-ui, sans-serif';
  bctx.textAlign = 'center';
  for (const [kind, lx] of labels) {
    bctx.fillStyle = 'rgba(0,0,0,0.6)';
    bctx.fillText(kind, lx * zoom + 1, groundY + 19);
    bctx.fillStyle = '#fff';
    bctx.fillText(kind, lx * zoom, groundY + 18);
  }
  bctx.textAlign = 'left';
  bctx.font = '700 14px system-ui, sans-serif';
  bctx.fillStyle = '#fff';
  bctx.fillText(theme + '  (sprites ' + (SPRITE * 100).toFixed(0) + ' px/m, view ' + zoom.toFixed(0) + ' px/m)', 10, 18);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(band, 0, Math.round(top * dpr));
});
