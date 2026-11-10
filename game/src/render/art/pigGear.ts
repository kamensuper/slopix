/**
 * Pig equipment: the foot soldier's iron kettle helmet, the knight's helm, plume and breastplate,
 * and the king's crown, cape, ermine trim and moustache.
 *
 * Everything is painted in character space at the position where it is worn. Armour pieces take
 * a condition 0 (pristine) .. 2 (dented, cracked, rivets missing) that mirrors their hit points.
 */
import { DEG, TAU } from '../../core/math';
import { DETAIL_LINE, FEATURE_LINE, OUTLINE, traceFeather } from './charParts';
import { cachedGradient, paintRivet, type MetalTones, type RoyalTones } from './pigKit';

type Wear = 0 | 1 | 2;

function metalGradient(ctx: CanvasRenderingContext2D, t: MetalTones, key: string, x0: number, y0: number, x1: number, y1: number): CanvasGradient {
  return cachedGradient(ctx, t, key, (c) => {
    const gradient = c.createLinearGradient(x0, y0, x1, y1);
    gradient.addColorStop(0, t.hi);
    gradient.addColorStop(0.42, t.body);
    gradient.addColorStop(1, t.lo);
    return gradient;
  });
}

/** A dent: a dark crease with a bright lip below it, as light catches the far edge. */
function paintDent(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, angle: number, t: MetalTones): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = t.dark;
  ctx.globalAlpha *= 0.55;
  ctx.beginPath();
  ctx.ellipse(0, 0, size, size * 0.55, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha /= 0.55;
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = t.dark;
  ctx.beginPath();
  ctx.ellipse(0, 0, size, size * 0.55, 0, Math.PI * 1.05, Math.PI * 1.95);
  ctx.stroke();
  ctx.strokeStyle = t.spec;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(0, 1.5, size * 0.92, size * 0.5, 0, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
  ctx.restore();
}

/** A jagged crack along `points` (flattened x, y pairs) with a bright edge beside it. */
function paintCrack(ctx: CanvasRenderingContext2D, points: readonly number[], t: MetalTones): void {
  ctx.beginPath();
  ctx.moveTo(points[0] + 2, points[1] + 1.5);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i] + 2, points[i + 1] + 1.5);
  ctx.strokeStyle = t.scratch;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
  ctx.strokeStyle = t.ink;
  ctx.lineWidth = 4.5;
  ctx.stroke();
}

function paintScratches(ctx: CanvasRenderingContext2D, lines: readonly number[], t: MetalTones): void {
  ctx.strokeStyle = t.scratch;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let i = 0; i < lines.length; i += 4) {
    ctx.moveTo(lines[i], lines[i + 1]);
    ctx.lineTo(lines[i + 2], lines[i + 3]);
  }
  ctx.stroke();
}

// ---------------------------------------------------------------- foot soldier: kettle helmet

/** Centre line of the rivet band at x. */
function bandY(x: number): number {
  return -70 + 8 * (x / 96) ** 2;
}

function traceDome(ctx: CanvasRenderingContext2D, dent: number): void {
  const mx = 66 - dent * 9;
  const my = -110 + dent * 9;
  ctx.moveTo(-96, -46);
  ctx.bezierCurveTo(-102, -104, -56, -134, 0, -134);
  ctx.bezierCurveTo(30, -134, 52, -126 + dent * 4, mx, my);
  ctx.bezierCurveTo(82, -92, 98, -74, 96, -46);
  ctx.closePath();
}

/** Iron kettle helmet with a rivet band and a wide brim, worn low over the brows. */
export function paintSoldierHelmet(ctx: CanvasRenderingContext2D, t: MetalTones, wear: Wear): void {
  ctx.strokeStyle = t.ink;
  // Dome.
  ctx.beginPath();
  traceDome(ctx, wear);
  ctx.fillStyle = metalGradient(ctx, t, 'dome', -70, -130, 60, -40);
  ctx.fill();
  ctx.lineWidth = OUTLINE;
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  traceDome(ctx, wear);
  ctx.clip();
  // Cel shade on the right, rim of reflected light on the far left.
  ctx.fillStyle = t.dark;
  ctx.globalAlpha = 0.42;
  ctx.beginPath();
  ctx.moveTo(30, -140);
  ctx.quadraticCurveTo(116, -100, 100, -30);
  ctx.lineTo(62, -30);
  ctx.quadraticCurveTo(80, -96, 30, -140);
  ctx.fill();
  ctx.globalAlpha = 1;
  // Rivet band.
  ctx.beginPath();
  ctx.moveTo(-104, -74);
  ctx.quadraticCurveTo(0, -94, 104, -74);
  ctx.lineTo(104, -56);
  ctx.quadraticCurveTo(0, -76, -104, -56);
  ctx.closePath();
  ctx.fillStyle = t.lo;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.stroke();
  if (wear >= 1) paintDent(ctx, 52, -108, 16, 0.7, t);
  if (wear >= 1) paintScratches(ctx, [-54, -100, -32, -110, -48, -92, -30, -99, 18, -84, 34, -90], t);
  if (wear >= 2) {
    paintDent(ctx, -40, -116, 11, -0.5, t);
    paintCrack(ctx, [-6, -136, 2, -120, -10, -108, -2, -96, -12, -84], t);
  }
  ctx.restore();

  // Specular streak along the lit shoulder of the dome.
  ctx.strokeStyle = t.spec;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(-70, -92);
  ctx.quadraticCurveTo(-64, -120, -26, -126);
  ctx.stroke();
  ctx.fillStyle = t.spec;
  ctx.beginPath();
  ctx.arc(-8, -127, 4, 0, TAU);
  ctx.fill();

  for (let i = 0; i < 5; i++) {
    const x = -66 + i * 33;
    paintRivet(ctx, x, bandY(x) + 1, 5.5, t, wear >= 2 && i === 3);
  }

  // Top knob.
  ctx.beginPath();
  ctx.ellipse(0, -136, 12, 7, 0, 0, TAU);
  ctx.fillStyle = t.body;
  ctx.fill();
  ctx.lineWidth = FEATURE_LINE;
  ctx.strokeStyle = t.ink;
  ctx.stroke();

  // Brim; a badly battered helmet has its right tip bent down.
  const bend = wear >= 2 ? 9 : 0;
  ctx.beginPath();
  ctx.moveTo(-116, -48);
  ctx.quadraticCurveTo(0, -70, 116, -48 + bend);
  ctx.quadraticCurveTo(121, -38 + bend, 108, -36 + bend);
  ctx.quadraticCurveTo(0, -54, -108, -36);
  ctx.quadraticCurveTo(-121, -38, -116, -48);
  ctx.closePath();
  ctx.fillStyle = metalGradient(ctx, t, 'brim', -100, -70, 100, -30);
  ctx.fill();
  ctx.lineWidth = OUTLINE;
  ctx.stroke();
  ctx.strokeStyle = t.spec;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(-100, -50);
  ctx.quadraticCurveTo(-50, -61, -10, -62);
  ctx.stroke();
  if (wear >= 1) {
    // Chipped brim edge.
    ctx.strokeStyle = t.ink;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(-70, -42);
    ctx.lineTo(-64, -48);
    ctx.lineTo(-58, -43);
    ctx.stroke();
  }
}

/** Leather chin strap with a brass buckle; painted inside the body clip, under the face. */
export function paintChinStrap(ctx: CanvasRenderingContext2D, royal: RoyalTones): void {
  ctx.beginPath();
  ctx.moveTo(-90, -40);
  ctx.bezierCurveTo(-98, 14, -72, 76, 0, 90);
  ctx.bezierCurveTo(72, 76, 98, 14, 90, -40);
  ctx.strokeStyle = royal.ink;
  ctx.lineWidth = 17;
  ctx.stroke();
  ctx.strokeStyle = royal.leather;
  ctx.lineWidth = 9.5;
  ctx.stroke();
  ctx.strokeStyle = royal.leatherLo;
  ctx.lineWidth = 2;
  ctx.stroke();
  // Buckle.
  ctx.save();
  ctx.translate(-86, 28);
  ctx.rotate(-0.28);
  ctx.beginPath();
  ctx.rect(-10, -9, 20, 18);
  ctx.fillStyle = royal.buckle;
  ctx.fill();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = royal.ink;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.lineTo(0, 9);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- knight: helm, plume, breastplate

function traceHelm(ctx: CanvasRenderingContext2D): void {
  ctx.moveTo(-100, 50);
  ctx.lineTo(-108, -16);
  ctx.bezierCurveTo(-108, -88, -60, -126, 0, -126);
  ctx.bezierCurveTo(60, -126, 108, -88, 108, -16);
  ctx.lineTo(100, 50);
  ctx.quadraticCurveTo(80, 62, 60, 52);
  ctx.lineTo(65, -28);
  ctx.quadraticCurveTo(63, -58, 34, -60);
  ctx.lineTo(-34, -60);
  ctx.quadraticCurveTo(-63, -58, -65, -28);
  ctx.lineTo(-60, 52);
  ctx.quadraticCurveTo(-80, 62, -100, 50);
  ctx.closePath();
}

/** Plume behind the helm; it loses feathers as the armour takes damage. */
export function paintPlume(ctx: CanvasRenderingContext2D, royal: RoyalTones, wear: Wear, time: number): void {
  const sway = Math.sin(time * 2.1) * 0.06;
  ctx.lineWidth = FEATURE_LINE;
  ctx.strokeStyle = royal.ink;
  const count = wear >= 2 ? 1 : 3;
  for (let i = 0; i < count; i++) {
    const angle = (wear >= 2 ? -150 : -128 + i * 22) * DEG + sway * (1 + i * 0.4);
    const length = wear >= 2 ? 46 : wear === 1 ? 64 - i * 8 : 78 - i * 8;
    ctx.beginPath();
    traceFeather(ctx, 0, -110, angle, length, 34 - i * 4, wear >= 2 ? 16 : -10, 0.35);
    ctx.fillStyle = i === 1 ? royal.plumeLo : royal.plume;
    ctx.fill();
    ctx.stroke();
  }
}

/** Knight helm with a raised visor; the face shows through the opening. */
export function paintKnightHelm(ctx: CanvasRenderingContext2D, t: MetalTones, wear: Wear): void {
  ctx.beginPath();
  traceHelm(ctx);
  ctx.fillStyle = metalGradient(ctx, t, 'helm', -90, -120, 90, 40);
  ctx.fill();
  ctx.lineWidth = OUTLINE;
  ctx.strokeStyle = t.ink;
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  traceHelm(ctx);
  ctx.clip();
  ctx.fillStyle = t.dark;
  ctx.globalAlpha = 0.4;
  ctx.beginPath();
  ctx.moveTo(40, -140);
  ctx.quadraticCurveTo(126, -90, 108, 70);
  ctx.lineTo(80, 70);
  ctx.quadraticCurveTo(96, -70, 40, -140);
  ctx.fill();
  ctx.globalAlpha = 1;
  // Raised ridge over the crown of the helm.
  ctx.strokeStyle = t.ink;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, -126);
  ctx.lineTo(0, -98);
  ctx.stroke();
  ctx.strokeStyle = t.spec;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-4, -122);
  ctx.lineTo(-4, -100);
  ctx.stroke();
  if (wear >= 1) {
    paintDent(ctx, -66, -82, 15, -0.9, t);
    paintScratches(ctx, [70, -60, 88, -40, 78, -70, 92, -54, -92, 10, -76, 24], t);
  }
  if (wear >= 2) {
    paintDent(ctx, 82, 14, 12, 1.3, t);
    paintCrack(ctx, [72, -96, 82, -78, 74, -62, 88, -44, 82, -26], t);
  }
  ctx.restore();

  ctx.strokeStyle = t.spec;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(-90, 6);
  ctx.quadraticCurveTo(-96, -76, -48, -110);
  ctx.stroke();
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-84, 22);
  ctx.lineTo(-85, 34);
  ctx.stroke();

  // Raised visor resting on the brow of the helm; a heavy blow knocks it askew.
  ctx.save();
  if (wear >= 2) {
    ctx.translate(-74, -74);
    ctx.rotate(-0.16);
    ctx.translate(74, 74);
  }
  ctx.beginPath();
  ctx.moveTo(-78, -78);
  ctx.quadraticCurveTo(0, -116, 78, -78);
  ctx.lineTo(74, -60);
  ctx.quadraticCurveTo(0, -96, -74, -60);
  ctx.closePath();
  ctx.fillStyle = metalGradient(ctx, t, 'visor', -60, -110, 60, -60);
  ctx.fill();
  ctx.lineWidth = FEATURE_LINE;
  ctx.strokeStyle = t.ink;
  ctx.stroke();
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const x = 22 + i * 13;
    const y = -86 + i * 3.2;
    ctx.moveTo(x - 4, y);
    ctx.lineTo(x + 4, y + 2);
  }
  ctx.stroke();
  ctx.strokeStyle = t.spec;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-60, -80);
  ctx.quadraticCurveTo(-30, -96, -6, -98);
  ctx.stroke();
  paintRivet(ctx, -72, -70, 7, t, false);
  paintRivet(ctx, 72, -70, 7, t, wear >= 2);
  ctx.restore();

  paintRivet(ctx, -63, -10, 5, t, false);
  paintRivet(ctx, -61, 28, 5, t, wear >= 1);
  paintRivet(ctx, 63, -10, 5, t, wear >= 2);
  paintRivet(ctx, 61, 28, 5, t, false);
}

/** Breastplate over the lower body; painted inside the body clip. */
export function paintBreastplate(ctx: CanvasRenderingContext2D, t: MetalTones, royal: RoyalTones, wear: Wear): void {
  ctx.beginPath();
  ctx.moveTo(-124, 82);
  ctx.quadraticCurveTo(0, 46, 124, 82);
  ctx.lineTo(124, 140);
  ctx.lineTo(-124, 140);
  ctx.closePath();
  ctx.fillStyle = metalGradient(ctx, t, 'plate', -80, 50, 80, 120);
  ctx.fill();
  ctx.lineWidth = FEATURE_LINE;
  ctx.strokeStyle = t.ink;
  ctx.stroke();
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-124, 100);
  ctx.quadraticCurveTo(0, 66, 124, 100);
  ctx.stroke();
  ctx.strokeStyle = t.spec;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-84, 74);
  ctx.quadraticCurveTo(-50, 64, -22, 62);
  ctx.stroke();
  paintRivet(ctx, -50, 74, 5, t, wear >= 2);
  paintRivet(ctx, 50, 74, 5, t, false);
  // Small gold boss with the tusk crest of the pig knights.
  ctx.beginPath();
  ctx.moveTo(0, 70);
  ctx.quadraticCurveTo(14, 72, 14, 82);
  ctx.quadraticCurveTo(12, 94, 0, 100);
  ctx.quadraticCurveTo(-12, 94, -14, 82);
  ctx.quadraticCurveTo(-14, 72, 0, 70);
  ctx.closePath();
  ctx.fillStyle = royal.gold;
  ctx.fill();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = t.ink;
  ctx.stroke();
  ctx.fillStyle = royal.goldHi;
  ctx.beginPath();
  ctx.ellipse(-5, 78, 3.5, 2.2, -0.5, 0, TAU);
  ctx.fill();
  if (wear >= 1) paintScratches(ctx, [30, 86, 48, 80, 34, 94, 52, 88], t);
  if (wear >= 2) paintCrack(ctx, [-76, 72, -66, 86, -76, 98, -66, 112], t);
}

// ---------------------------------------------------------------- king: crown, cape, ermine, moustache

const CROWN_POINTS: readonly number[] = [-62, -138, -44, -112, -30, -148, -14, -114, 0, -154, 14, -114, 30, -148, 44, -112, 62, -138];

/** Velvet cap inside a gold crown with pearls and gems. `lift` raises it (surprise), `tilt` cocks it. */
export function paintCrown(ctx: CanvasRenderingContext2D, t: RoyalTones, lift: number, tilt: number): void {
  ctx.save();
  ctx.translate(0, -88 - lift);
  ctx.rotate(tilt);
  ctx.translate(0, 88);

  ctx.beginPath();
  ctx.moveTo(-50, -96);
  ctx.bezierCurveTo(-52, -146, 52, -146, 50, -96);
  ctx.closePath();
  ctx.fillStyle = t.velvet;
  ctx.fill();
  ctx.lineWidth = FEATURE_LINE;
  ctx.strokeStyle = t.ink;
  ctx.stroke();
  ctx.fillStyle = t.velvetHi;
  ctx.beginPath();
  ctx.ellipse(-22, -124, 10, 5, -0.5, 0, TAU);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-56, -84);
  for (let i = 0; i < CROWN_POINTS.length; i += 2) ctx.lineTo(CROWN_POINTS[i], CROWN_POINTS[i + 1]);
  ctx.lineTo(56, -84);
  ctx.quadraticCurveTo(0, -74, -56, -84);
  ctx.closePath();
  ctx.fillStyle = cachedGradient(ctx, t, 'gold', (c) => {
    const gradient = c.createLinearGradient(-50, -150, 50, -80);
    gradient.addColorStop(0, t.goldHi);
    gradient.addColorStop(0.45, t.gold);
    gradient.addColorStop(1, t.goldLo);
    return gradient;
  });
  ctx.fill();
  ctx.lineWidth = OUTLINE * 0.85;
  ctx.stroke();

  // Band.
  ctx.beginPath();
  ctx.moveTo(-58, -104);
  ctx.quadraticCurveTo(0, -94, 58, -104);
  ctx.lineTo(56, -84);
  ctx.quadraticCurveTo(0, -74, -56, -84);
  ctx.closePath();
  ctx.fillStyle = t.goldLo;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.strokeStyle = t.goldHi;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-50, -100);
  ctx.quadraticCurveTo(-20, -95, 0, -95);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-50, -106);
  ctx.lineTo(-56, -132);
  ctx.stroke();

  // Gems.
  ctx.strokeStyle = t.ink;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(0, -89, 9, 8, 0, 0, TAU);
  ctx.fillStyle = t.ruby;
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = t.sapphire;
  for (const x of [-32, 32]) {
    ctx.beginPath();
    ctx.ellipse(x, -91, 6, 5.5, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = t.rubyHi;
  ctx.beginPath();
  ctx.arc(-3, -92, 2.6, 0, TAU);
  ctx.fill();
  ctx.fillStyle = t.sapphireHi;
  for (const x of [-34, 30]) {
    ctx.beginPath();
    ctx.arc(x, -93, 1.8, 0, TAU);
    ctx.fill();
  }
  // Pearls on the tips.
  ctx.fillStyle = t.pearl;
  for (let i = 2; i < CROWN_POINTS.length; i += 4) {
    ctx.beginPath();
    ctx.arc(CROWN_POINTS[i], CROWN_POINTS[i + 1] - 3, 6, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(-62, -141, 5, 0, TAU);
  ctx.arc(62, -141, 5, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Red velvet cape peeking out behind the lower body. */
export function paintCape(ctx: CanvasRenderingContext2D, t: RoyalTones, time: number): void {
  const flutter = Math.sin(time * 1.7) * 3;
  ctx.beginPath();
  ctx.moveTo(-78, 10);
  ctx.quadraticCurveTo(-116, 56, -122 - flutter, 102);
  ctx.quadraticCurveTo(-60, 116, 0, 108);
  ctx.quadraticCurveTo(60, 116, 122 + flutter, 102);
  ctx.quadraticCurveTo(116, 56, 78, 10);
  ctx.closePath();
  ctx.fillStyle = t.velvet;
  ctx.fill();
  ctx.lineWidth = OUTLINE;
  ctx.strokeStyle = t.ink;
  ctx.stroke();
  ctx.strokeStyle = t.velvetLo;
  ctx.lineWidth = DETAIL_LINE;
  ctx.beginPath();
  ctx.moveTo(-108 - flutter * 0.5, 98);
  ctx.quadraticCurveTo(-104, 76, -96, 60);
  ctx.moveTo(108 + flutter * 0.5, 98);
  ctx.quadraticCurveTo(104, 76, 96, 60);
  ctx.stroke();
}

/** Ermine trim across the lower body; painted inside the body clip. */
export function paintErmine(ctx: CanvasRenderingContext2D, t: RoyalTones): void {
  ctx.beginPath();
  ctx.moveTo(-124, 74);
  for (let i = 0; i < 10; i++) {
    const x0 = -124 + i * 24.8;
    ctx.quadraticCurveTo(x0 + 12.4, 56 + Math.abs(i - 4.5) * 2.2, x0 + 24.8, 70 + Math.abs(i - 4.5) * 1.2);
  }
  ctx.lineTo(124, 140);
  ctx.lineTo(-124, 140);
  ctx.closePath();
  ctx.fillStyle = t.ermine;
  ctx.fill();
  ctx.lineWidth = FEATURE_LINE;
  ctx.strokeStyle = t.ink;
  ctx.stroke();
  ctx.fillStyle = t.ermineShade;
  ctx.beginPath();
  ctx.ellipse(70, 100, 60, 26, -0.2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = t.ermineTail;
  for (let i = 0; i < 7; i++) {
    const x = -66 + i * 22;
    const y = i % 2 === 0 ? 86 : 100;
    ctx.beginPath();
    ctx.moveTo(x, y - 7);
    ctx.quadraticCurveTo(x + 5, y + 2, x, y + 8);
    ctx.quadraticCurveTo(x - 5, y + 2, x, y - 7);
    ctx.fill();
  }
  // Gold clasp.
  ctx.beginPath();
  ctx.arc(0, 70, 10, 0, TAU);
  ctx.fillStyle = t.gold;
  ctx.fill();
  ctx.lineWidth = 3.5;
  ctx.stroke();
  ctx.fillStyle = t.ruby;
  ctx.beginPath();
  ctx.arc(0, 70, 4.5, 0, TAU);
  ctx.fill();
}

/** Curled handlebar moustache under the snout; `twitch` -1..1 flicks the tips. */
export function paintMoustache(ctx: CanvasRenderingContext2D, t: RoyalTones, y: number, twitch: number): void {
  ctx.lineWidth = FEATURE_LINE;
  ctx.strokeStyle = t.ink;
  for (const s of [-1, 1]) {
    const up = twitch * 6;
    ctx.beginPath();
    ctx.moveTo(0, y - 6);
    ctx.bezierCurveTo(s * 22, y - 16, s * 44, y - 8, s * 58, y - 14 - up);
    ctx.quadraticCurveTo(s * 72, y - 22 - up, s * 66, y - 34 - up);
    ctx.quadraticCurveTo(s * 84, y - 18 - up, s * 62, y + 4);
    ctx.bezierCurveTo(s * 44, y + 14, s * 18, y + 12, 0, y + 6);
    ctx.closePath();
    ctx.fillStyle = t.stache;
    ctx.fill();
    ctx.stroke();
  }
  ctx.strokeStyle = t.stacheHi;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-10, y - 6);
  ctx.quadraticCurveTo(-30, y - 12, -48, y - 9);
  ctx.moveTo(10, y - 6);
  ctx.quadraticCurveTo(30, y - 12, 48, y - 9);
  ctx.stroke();
  ctx.strokeStyle = t.stacheLo;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-14, y + 6);
  ctx.quadraticCurveTo(-34, y + 7, -50, y + 2);
  ctx.moveTo(14, y + 6);
  ctx.quadraticCurveTo(34, y + 7, 50, y + 2);
  ctx.stroke();
}
