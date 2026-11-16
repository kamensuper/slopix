/** Decor of the three later worlds: the Stormbound Isles, the Ironworks and the Celestial Ruins. */
import { TAU } from '../../core/math';
import { contact, form, type Painter } from './envDecor';
import type { DecorInfo } from './types';

export const EXTRA_DECOR: Record<string, DecorInfo> = {
  // Stormbound Isles
  wind_tree: { theme: 'storm', w: 4, h: 4.6 },
  lightning_rod: { theme: 'storm', w: 1.2, h: 4.4, glow: { x: 0, y: 4.2, r: 1.1 } },
  basalt: { theme: 'storm', w: 2.4, h: 1.8 },
  windsock: { theme: 'storm', w: 1.8, h: 3.2 },
  sea_grass: { theme: 'storm', w: 1.4, h: 0.9 },
  beacon: { theme: 'storm', w: 1, h: 2.4, glow: { x: 0, y: 2.0, r: 1.5 } },
  // Ironworks
  pipes: { theme: 'ironworks', w: 2, h: 2.6 },
  cog_pile: { theme: 'ironworks', w: 2.6, h: 1.8 },
  furnace: { theme: 'ironworks', w: 2.2, h: 2.6, glow: { x: 0, y: 0.8, r: 1.6 } },
  barrel: { theme: 'ironworks', w: 0.9, h: 1.1 },
  warning_sign: { theme: 'ironworks', w: 1, h: 1.9 },
  lamp_post: { theme: 'ironworks', w: 1.2, h: 3.6, glow: { x: 0.38, y: 3.2, r: 1.5 } },
  // Celestial Ruins
  star_pillar: { theme: 'celestial', w: 1.2, h: 4 },
  rune_stone: { theme: 'celestial', w: 1.4, h: 2.4, glow: { x: 0, y: 1.3, r: 1.3 } },
  crystal_cluster: { theme: 'celestial', w: 1.8, h: 2.2, glow: { x: 0, y: 0.9, r: 1.4 } },
  floating_rock: { theme: 'celestial', w: 2.2, h: 3 },
  star_bloom: { theme: 'celestial', w: 1.2, h: 1 },
  ruin_ring: { theme: 'celestial', w: 4, h: 4.2 },
};

const poly = (pts: number[]): Path2D => {
  const p = new Path2D();
  for (let i = 0; i < pts.length; i += 2) {
    if (i === 0) p.moveTo(pts[i]!, pts[i + 1]!);
    else p.lineTo(pts[i]!, pts[i + 1]!);
  }
  p.closePath();
  return p;
};
const disc = (x: number, y: number, r: number): Path2D => {
  const p = new Path2D();
  p.arc(x, y, r, 0, TAU);
  return p;
};
const box = (x: number, y: number, w: number, h: number): Path2D => {
  const p = new Path2D();
  p.rect(x, y, w, h);
  return p;
};

// ---------------------------------------------------------------- Stormbound Isles

const windTree: Painter = (ctx, rng) => {
  contact(ctx, 200, 0.25);
  // The trunk leans hard with the wind; the crown trails off to the right.
  const trunk = new Path2D();
  trunk.moveTo(-26, 0);
  trunk.bezierCurveTo(-18, -120, -8, -220, 60, -320);
  trunk.lineTo(84, -310);
  trunk.bezierCurveTo(26, -210, 20, -110, 26, 0);
  trunk.closePath();
  form(ctx, trunk, -26, -320, 60, 0, '#8a7890', '#5a4a66', '#33283f');
  ctx.strokeStyle = 'rgba(30,20,40,0.4)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 4; i++) {
    const y = -60 - i * 60;
    ctx.beginPath();
    ctx.moveTo(-10 + i * 12, y);
    ctx.quadraticCurveTo(2 + i * 12, y - 20, -2 + i * 14, y - 40);
    ctx.stroke();
  }
  const lobes: [number, number, number][] = [
    [70, -350, 62],
    [130, -372, 54],
    [20, -330, 44],
    [176, -350, 40],
    [108, -412, 42],
  ];
  for (const [tone, dx, dy, k] of [['#24544a', 4, 6, 1.04], ['#3a8068', 0, 0, 1], ['#62b085', -8, -10, 0.72]] as const) {
    ctx.fillStyle = tone;
    ctx.beginPath();
    for (const [x, y, r] of lobes) {
      ctx.moveTo(x + dx + r * k, y + dy);
      ctx.arc(x + dx, y + dy, r * k, 0, TAU);
    }
    ctx.fill();
  }
  // Leaves torn off by the gale.
  ctx.fillStyle = '#7cc490';
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.ellipse(196 - i * 2 + rng.range(-6, 6), -300 + i * 22 + rng.range(-8, 8), 7, 3, rng.range(-0.8, 0.2), 0, TAU);
    ctx.fill();
  }
};

const lightningRod: Painter = (ctx) => {
  contact(ctx, 90, 0.25);
  form(ctx, poly([-34, 0, -22, -34, 22, -34, 34, 0]), -34, -34, 34, 0, '#8d96b8', '#59628a', '#343b5c');
  form(ctx, box(-6, -400, 12, 368), -6, -400, 6, -30, '#c9cfe6', '#8089ad', '#4a5275');
  for (const [y, w] of [[-320, 44], [-250, 34], [-180, 26]] as const) form(ctx, box(-w / 2, y, w, 6), -w / 2, y, w / 2, y + 6, '#c9cfe6', '#8089ad', '#4a5275', 2);
  // Insulator coils.
  ctx.strokeStyle = '#d98a4a';
  ctx.lineWidth = 5;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.ellipse(0, -90 - i * 16, 13, 5, 0, 0, TAU);
    ctx.stroke();
  }
  const g = ctx.createRadialGradient(-4, -424, 2, 0, -420, 18);
  g.addColorStop(0, '#fffbe0');
  g.addColorStop(0.6, '#ffd95a');
  g.addColorStop(1, '#e89a20');
  ctx.fillStyle = g;
  ctx.fill(disc(0, -420, 16));
  ctx.strokeStyle = 'rgba(60,40,10,0.6)';
  ctx.lineWidth = 2.5;
  ctx.stroke(disc(0, -420, 16));
};

const basalt: Painter = (ctx, rng) => {
  contact(ctx, 240, 0.25);
  // A cluster of hexagonal columns of different heights.
  const cols = [-90, -52, -14, 26, 64].map((x, i) => ({ x, h: [70, 130, 172, 110, 60][i]! + rng.range(-10, 10) }));
  for (const c of cols) {
    const shaft = box(c.x, -c.h, 40, c.h + 2);
    form(ctx, shaft, c.x, -c.h, c.x + 40, 0, '#7a84a8', '#4a5376', '#2a304c');
    form(ctx, poly([c.x, -c.h, c.x + 10, -c.h - 9, c.x + 30, -c.h - 9, c.x + 40, -c.h, c.x + 30, -c.h + 7, c.x + 10, -c.h + 7]), c.x, -c.h - 9, c.x + 40, -c.h + 7, '#aeb8d8', '#8490b6', '#59648c', 2);
    ctx.fillStyle = 'rgba(20,24,44,0.35)';
    ctx.fillRect(c.x + 27, -c.h + 7, 3, c.h - 8);
  }
  // Moss and a drip of wet shine.
  ctx.fillStyle = '#5fa878';
  for (const c of cols) {
    ctx.beginPath();
    ctx.ellipse(c.x + 16, -c.h - 4, 14, 5, 0, Math.PI, TAU);
    ctx.fill();
  }
};

const windsock: Painter = (ctx) => {
  contact(ctx, 60, 0.22);
  form(ctx, box(-5, -300, 10, 302), -5, -300, 5, 0, '#c9cfe6', '#8089ad', '#4a5275');
  form(ctx, box(-16, -8, 32, 10), -16, -8, 16, 2, '#8d96b8', '#59628a', '#343b5c');
  // The sock streams out flat: red and white hoops tapering to the tip.
  const hoops = 5;
  for (let i = 0; i < hoops; i++) {
    const x0 = 6 + i * 32;
    const x1 = x0 + 32;
    const h0 = 26 - i * 3.6;
    const h1 = 26 - (i + 1) * 3.6;
    const wave = Math.sin(i * 0.9) * 5;
    const wave1 = Math.sin((i + 1) * 0.9) * 5;
    const p = poly([x0, -280 - h0 + wave, x1, -280 - h1 + wave1, x1, -280 + h1 + wave1, x0, -280 + h0 + wave]);
    form(ctx, p, x0, -306, x1, -254, i % 2 ? '#ffffff' : '#ff8a6a', i % 2 ? '#eef0fa' : '#e2503c', i % 2 ? '#b9bfd8' : '#a52f2a', 2.5);
  }
  ctx.strokeStyle = '#4a5275';
  ctx.lineWidth = 4;
  ctx.stroke(disc(4, -280, 27));
};

const seaGrass: Painter = (ctx, rng) => {
  for (let i = 0; i < 11; i++) {
    const x = -50 + i * 10 + rng.range(-3, 3);
    const h = rng.range(40, 84);
    const p = new Path2D();
    p.moveTo(x - 4, 2);
    p.quadraticCurveTo(x - 2, -h * 0.6, x + h * 0.6, -h);
    p.quadraticCurveTo(x + 8, -h * 0.5, x + 4, 2);
    p.closePath();
    ctx.fillStyle = i % 3 === 0 ? '#9fd08c' : i % 3 === 1 ? '#5fa878' : '#3f806a';
    ctx.fill(p);
  }
};

const beacon: Painter = (ctx) => {
  contact(ctx, 80, 0.25);
  form(ctx, poly([-30, 0, -20, -150, 20, -150, 30, 0]), -30, -150, 30, 0, '#f4efe6', '#d9d0c4', '#9c8f86');
  form(ctx, poly([-26, -60, -22, -100, 22, -100, 26, -60]), -26, -100, 26, -60, '#ff8a6a', '#d94f3c', '#9c2f2a', 0);
  form(ctx, box(-28, -160, 56, 12), -28, -160, 28, -148, '#6a7090', '#474c6a', '#2a2e48');
  const g = ctx.createRadialGradient(0, -196, 2, 0, -196, 30);
  g.addColorStop(0, '#fffbe0');
  g.addColorStop(0.5, '#ffe07a');
  g.addColorStop(1, '#f0a02a');
  ctx.fillStyle = g;
  ctx.fill(box(-20, -224, 40, 64));
  ctx.strokeStyle = '#3a3f5c';
  ctx.lineWidth = 4;
  ctx.strokeRect(-20, -224, 40, 64);
  ctx.beginPath();
  ctx.moveTo(0, -224);
  ctx.lineTo(0, -160);
  ctx.stroke();
  form(ctx, poly([-28, -224, 0, -244, 28, -224]), -28, -244, 28, -224, '#6a7090', '#474c6a', '#2a2e48');
};

// ---------------------------------------------------------------- Ironworks

const pipes: Painter = (ctx) => {
  contact(ctx, 200, 0.28);
  const pipe = (x: number, h: number, w: number): void => {
    form(ctx, box(x, -h, w, h + 2), x, -h, x + w, 0, '#e09a62', '#b0623c', '#6a3524');
    ctx.fillStyle = 'rgba(255,230,190,0.35)';
    ctx.fillRect(x + w * 0.16, -h + 4, w * 0.14, h - 6);
    for (const y of [-h, -h * 0.5, -14]) form(ctx, box(x - 5, y, w + 10, 12), x - 5, y, x + w + 5, y + 12, '#9a8f98', '#6a6270', '#3f3a48', 2.5);
  };
  pipe(-84, 250, 40);
  pipe(-26, 180, 46);
  pipe(40, 110, 40);
  // Elbow joining the two tall pipes, and a valve wheel.
  form(ctx, box(-60, -216, 60, 26), -60, -216, 0, -190, '#e09a62', '#b0623c', '#6a3524');
  ctx.strokeStyle = '#c9302c';
  ctx.lineWidth = 7;
  ctx.stroke(disc(60, -130, 22));
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(38, -130);
  ctx.lineTo(82, -130);
  ctx.moveTo(60, -152);
  ctx.lineTo(60, -108);
  ctx.stroke();
  ctx.fillStyle = '#3f3a48';
  ctx.fill(disc(60, -130, 6));
  // A wisp of steam.
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  for (let i = 0; i < 4; i++) ctx.fill(disc(-64 + i * 9, -262 - i * 14, 8 + i * 3));
};

function cogShape(x: number, y: number, r: number, teeth: number, phase: number): Path2D {
  const p = new Path2D();
  const inner = r * 0.8;
  for (let i = 0; i < teeth; i++) {
    const a0 = phase + (i / teeth) * TAU;
    const a1 = a0 + (0.5 / teeth) * TAU;
    const pts: [number, number][] = [[inner, a0 - 0.03], [r, a0 + 0.05], [r, a1 - 0.05], [inner, a1 + 0.03]];
    pts.forEach(([rr, a], k) => {
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr;
      if (i === 0 && k === 0) p.moveTo(px, py);
      else p.lineTo(px, py);
    });
  }
  p.closePath();
  return p;
}

const cogPile: Painter = (ctx) => {
  contact(ctx, 260, 0.28);
  const cog = (x: number, y: number, r: number, teeth: number, phase: number, tones: [string, string, string]): void => {
    form(ctx, cogShape(x, y, r, teeth, phase), x - r, y - r, x + r, y + r, tones[0], tones[1], tones[2]);
    ctx.fillStyle = 'rgba(30,18,24,0.55)';
    ctx.fill(disc(x, y, r * 0.3));
    ctx.strokeStyle = 'rgba(255,240,210,0.35)';
    ctx.lineWidth = 3;
    ctx.stroke(disc(x, y, r * 0.56));
  };
  cog(-50, -84, 84, 12, 0.2, ['#d8a070', '#a8683e', '#5f3524']);
  cog(60, -52, 52, 9, 0.6, ['#b9b7c6', '#7d7a8c', '#454252']);
  cog(8, -24, 30, 7, 0.1, ['#e8c060', '#c08a2a', '#7a5214']);
};

const furnace: Painter = (ctx) => {
  contact(ctx, 220, 0.3);
  form(ctx, poly([-96, 0, -84, -170, 84, -170, 96, 0]), -96, -170, 96, 0, '#9a6a58', '#6a4038', '#3a2024');
  // Brick courses.
  ctx.strokeStyle = 'rgba(30,14,18,0.45)';
  ctx.lineWidth = 2.5;
  for (let y = -150; y < 0; y += 24) {
    ctx.beginPath();
    ctx.moveTo(-90, y);
    ctx.lineTo(90, y);
    ctx.stroke();
  }
  // Chimney with a collar.
  form(ctx, box(-30, -250, 60, 84), -30, -250, 30, -166, '#8d8794', '#5f5868', '#353040');
  form(ctx, box(-38, -258, 76, 12), -38, -258, 38, -246, '#b9b7c6', '#7d7a8c', '#454252', 2.5);
  // The fire door.
  const door = new Path2D();
  door.moveTo(-44, -10);
  door.lineTo(-44, -70);
  door.arc(0, -70, 44, Math.PI, 0);
  door.lineTo(44, -10);
  door.closePath();
  const g = ctx.createRadialGradient(0, -50, 4, 0, -50, 60);
  g.addColorStop(0, '#fff6c0');
  g.addColorStop(0.45, '#ffb030');
  g.addColorStop(1, '#d9401a');
  ctx.fillStyle = g;
  ctx.fill(door);
  ctx.strokeStyle = '#2a1a20';
  ctx.lineWidth = 7;
  ctx.stroke(door);
  ctx.lineWidth = 4;
  for (const x of [-22, 0, 22]) {
    ctx.beginPath();
    ctx.moveTo(x, -10);
    ctx.lineTo(x, -108 + Math.abs(x) * 0.5);
    ctx.stroke();
  }
};

const barrel: Painter = (ctx) => {
  contact(ctx, 90, 0.26);
  const body = new Path2D();
  body.moveTo(-34, 0);
  body.quadraticCurveTo(-44, -52, -34, -104);
  body.lineTo(34, -104);
  body.quadraticCurveTo(44, -52, 34, 0);
  body.closePath();
  form(ctx, body, -40, -104, 40, 0, '#5fb0c8', '#2f7f9c', '#174a62');
  for (const y of [-88, -52, -18]) form(ctx, box(-40, y, 80, 8), -40, y, 40, y + 8, '#b9b7c6', '#7d7a8c', '#454252', 2);
  // Hazard diamond.
  form(ctx, poly([0, -74, 16, -58, 0, -42, -16, -58]), -16, -74, 16, -42, '#ffe07a', '#f2b53a', '#b9801a', 2);
  ctx.fillStyle = '#2a1d24';
  ctx.fillRect(-2, -68, 4, 12);
  ctx.fillRect(-2, -53, 4, 4);
};

const warningSign: Painter = (ctx) => {
  contact(ctx, 60, 0.22);
  form(ctx, box(-5, -150, 10, 152), -5, -150, 5, 0, '#b9b7c6', '#7d7a8c', '#454252');
  const tri = poly([0, -190, 46, -110, -46, -110]);
  form(ctx, tri, -46, -190, 46, -110, '#ffe98a', '#f2b53a', '#b9801a', 5);
  // A falling-block pictogram.
  ctx.fillStyle = '#2a1d24';
  ctx.save();
  ctx.translate(0, -138);
  ctx.rotate(0.35);
  ctx.fillRect(-9, -14, 18, 18);
  ctx.restore();
  ctx.fillRect(-18, -118, 36, 4);
};

const lampPost: Painter = (ctx) => {
  contact(ctx, 70, 0.25);
  form(ctx, poly([-16, 0, -10, -30, 10, -30, 16, 0]), -16, -30, 16, 0, '#6a6270', '#454050', '#262230');
  form(ctx, box(-5, -340, 10, 312), -5, -340, 5, -28, '#6a6270', '#454050', '#262230');
  const arm = new Path2D();
  arm.moveTo(-5, -340);
  arm.quadraticCurveTo(-4, -366, 30, -362);
  arm.lineTo(54, -356);
  arm.lineTo(54, -348);
  arm.lineTo(28, -352);
  arm.quadraticCurveTo(6, -354, 5, -334);
  arm.closePath();
  form(ctx, arm, -5, -366, 54, -334, '#6a6270', '#454050', '#262230');
  form(ctx, poly([22, -350, 56, -350, 50, -332, 28, -332]), 22, -350, 56, -332, '#8d8794', '#5f5868', '#353040', 2.5);
  const g = ctx.createRadialGradient(39, -322, 1, 39, -322, 14);
  g.addColorStop(0, '#fffbe0');
  g.addColorStop(1, '#ffb84a');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(39, -326, 11, 9, 0, 0, Math.PI);
  ctx.fill();
};

// ---------------------------------------------------------------- Celestial Ruins

const MARBLE: [string, string, string] = ['#f4eeff', '#c9bcec', '#8672c0'];

const starPillar: Painter = (ctx, rng) => {
  contact(ctx, 110, 0.25);
  form(ctx, box(-52, -22, 104, 24), -52, -22, 52, 2, ...MARBLE);
  form(ctx, box(-42, -40, 84, 20), -42, -40, 42, -20, ...MARBLE);
  const shaft = new Path2D();
  shaft.moveTo(-30, -38);
  shaft.lineTo(-27, -330);
  shaft.lineTo(-10, -372 + rng.range(-8, 8));
  shaft.lineTo(4, -338);
  shaft.lineTo(18, -360);
  shaft.lineTo(27, -322);
  shaft.lineTo(30, -38);
  shaft.closePath();
  form(ctx, shaft, -30, -372, 30, -38, ...MARBLE);
  ctx.strokeStyle = 'rgba(80,60,140,0.4)';
  ctx.lineWidth = 3;
  for (const x of [-15, 0, 15]) {
    ctx.beginPath();
    ctx.moveTo(x, -50);
    ctx.lineTo(x * 0.92, -316);
    ctx.stroke();
  }
  // A glowing rune band.
  ctx.fillStyle = '#8ff0ff';
  ctx.fillRect(-29, -214, 58, 6);
  for (let i = 0; i < 5; i++) ctx.fill(disc(-22 + i * 11, -196, 2.6));
};

const runeStone: Painter = (ctx) => {
  contact(ctx, 130, 0.25);
  const stone = poly([-56, 0, -46, -170, -8, -236, 40, -188, 60, 0]);
  form(ctx, stone, -56, -236, 60, 0, '#a996dc', '#6f5aae', '#3f2f78');
  ctx.fillStyle = 'rgba(30,20,70,0.3)';
  ctx.fill(poly([14, 0, 10, -218, 40, -188, 60, 0]));
  // Carved glyph: a circle crossed by a line with three dots, lit from inside.
  ctx.strokeStyle = '#a8fbff';
  ctx.lineWidth = 6;
  ctx.shadowColor = '#7af0ff';
  ctx.shadowBlur = 14;
  ctx.stroke(disc(-4, -134, 26));
  ctx.beginPath();
  ctx.moveTo(-4, -180);
  ctx.lineTo(-4, -64);
  ctx.moveTo(-34, -64);
  ctx.lineTo(26, -64);
  ctx.stroke();
  ctx.fillStyle = '#e0feff';
  for (const [x, y] of [[-26, -40], [-4, -36], [18, -40]] as const) ctx.fill(disc(x, y, 4));
  ctx.shadowBlur = 0;
};

const crystalCluster: Painter = (ctx, rng) => {
  contact(ctx, 170, 0.25);
  const shard = (x: number, h: number, w: number, lean: number): void => {
    const tx = x + lean * h;
    const p = poly([x - w, 2, tx - w * 0.9, -h * 0.78, tx, -h, tx + w * 0.9, -h * 0.8, x + w, 2]);
    const g = ctx.createLinearGradient(x - w, -h, x + w, 0);
    g.addColorStop(0, '#e9fdff');
    g.addColorStop(0.4, '#7fe0f6');
    g.addColorStop(1, '#5a6ee0');
    ctx.fillStyle = g;
    ctx.fill(p);
    ctx.strokeStyle = 'rgba(40,40,120,0.55)';
    ctx.lineWidth = 3;
    ctx.stroke(p);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fill(poly([x - w, 2, tx - w * 0.9, -h * 0.78, tx, -h, tx - w * 0.2, 2]));
  };
  shard(-50, 110 + rng.range(-10, 10), 16, -0.2);
  shard(46, 130 + rng.range(-10, 10), 18, 0.18);
  shard(0, 200, 24, 0.02);
  shard(-22, 70, 12, -0.4);
  shard(24, 60, 11, 0.45);
};

const floatingRock: Painter = (ctx, rng) => {
  // No contact shadow: it hovers. A faint ring of dust underneath instead.
  ctx.fillStyle = 'rgba(160,240,255,0.2)';
  ctx.beginPath();
  ctx.ellipse(0, -8, 70, 9, 0, 0, TAU);
  ctx.fill();
  const rock = poly([-96, -210, 96, -210, 70, -160, 30, -110, 6, -64, -30, -120, -74, -164]);
  form(ctx, rock, -96, -210, 96, -64, '#a996dc', '#6f5aae', '#3f2f78');
  ctx.fillStyle = 'rgba(30,20,70,0.3)';
  ctx.fill(poly([10, -208, 96, -210, 70, -160, 6, -64]));
  form(ctx, box(-104, -224, 208, 16), -104, -224, 104, -208, ...MARBLE);
  // A broken column stump on top and a crystal hanging below.
  form(ctx, poly([-50, -224, -48, -280, -34, -296, -20, -276, -12, -288, -8, -224]), -50, -296, -8, -224, ...MARBLE);
  const g = ctx.createLinearGradient(-8, -60, 14, -20);
  g.addColorStop(0, '#e9fdff');
  g.addColorStop(1, '#5ad0f0');
  ctx.fillStyle = g;
  ctx.fill(poly([-4, -58, 6, -66, 16, -58, 6, -18 + rng.range(-4, 4)]));
  // Pebbles drifting alongside.
  ctx.fillStyle = '#6f5aae';
  for (const [x, y, r] of [[84, -120, 9], [-88, -128, 7], [56, -78, 5]] as const) ctx.fill(disc(x, y, r));
};

const starBloom: Painter = (ctx, rng) => {
  for (let i = 0; i < 5; i++) {
    const x = -44 + i * 22 + rng.range(-4, 4);
    const h = rng.range(34, 80);
    ctx.strokeStyle = '#5a8ad0';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(x, 2);
    ctx.quadraticCurveTo(x + 6, -h * 0.5, x - 2, -h);
    ctx.stroke();
    // Four-point star flower.
    const r = rng.range(9, 14);
    const cx = x - 2;
    const cy = -h;
    const p = new Path2D();
    p.moveTo(cx, cy - r);
    p.quadraticCurveTo(cx, cy, cx + r, cy);
    p.quadraticCurveTo(cx, cy, cx, cy + r);
    p.quadraticCurveTo(cx, cy, cx - r, cy);
    p.quadraticCurveTo(cx, cy, cx, cy - r);
    ctx.fillStyle = i % 2 ? '#fff2a8' : '#c8fbff';
    ctx.shadowColor = i % 2 ? '#ffe07a' : '#7af0ff';
    ctx.shadowBlur = 10;
    ctx.fill(p);
    ctx.shadowBlur = 0;
  }
};

const ruinRing: Painter = (ctx) => {
  contact(ctx, 380, 0.25);
  // Three quarters of a great stone ring standing on two plinths.
  const ring = new Path2D();
  ring.arc(0, -220, 190, Math.PI * 0.86, Math.PI * 2.02);
  ring.arc(0, -220, 150, Math.PI * 2.02, Math.PI * 0.86, true);
  ring.closePath();
  form(ctx, ring, -190, -410, 190, -30, '#d6c8f6', '#9c88d2', '#56418a');
  ctx.strokeStyle = 'rgba(60,40,120,0.4)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.92 + i * 0.13);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 150, -220 + Math.sin(a) * 150);
    ctx.lineTo(Math.cos(a) * 190, -220 + Math.sin(a) * 190);
    ctx.stroke();
  }
  ctx.fillStyle = '#8ff0ff';
  for (let i = 0; i < 8; i++) {
    const a = Math.PI * (0.985 + i * 0.13);
    ctx.fill(disc(Math.cos(a) * 170, -220 + Math.sin(a) * 170, 5));
  }
  form(ctx, box(-196, -40, 76, 42), -196, -40, -120, 2, ...MARBLE);
  form(ctx, box(120, -40, 76, 42), 120, -40, 196, 2, ...MARBLE);
  // The fallen quarter lies in front.
  form(ctx, poly([110, 0, 126, -34, 176, -22, 190, 0]), 110, -34, 190, 0, '#d6c8f6', '#9c88d2', '#56418a');
};

export const EXTRA_PAINTERS: Record<string, Painter> = {
  wind_tree: windTree,
  lightning_rod: lightningRod,
  basalt,
  windsock,
  sea_grass: seaGrass,
  beacon,
  pipes,
  cog_pile: cogPile,
  furnace,
  barrel,
  warning_sign: warningSign,
  lamp_post: lampPost,
  star_pillar: starPillar,
  rune_stone: runeStone,
  crystal_cluster: crystalCluster,
  floating_rock: floatingRock,
  star_bloom: starBloom,
  ruin_ring: ruinRing,
};
