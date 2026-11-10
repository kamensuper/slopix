/**
 * Asset manager. The game ships no image or audio files: its "assets" are the bundled web fonts
 * and the sprites painted procedurally at start-up. This loads the former, pre-renders the
 * latter into the shared sprite cache and reports progress to the boot screen.
 */
import type { ParticleKind } from '../render/art/types';
import type { WorldRenderer } from '../render/WorldRenderer';

const FONTS = ['400 32px "Lilita One"', '500 16px "Fredoka Variable"', '700 16px "Fredoka Variable"'];
const FONT_TIMEOUT_MS = 4000;
const PARTICLE_KINDS: ParticleKind[] = ['splinter', 'woodchip', 'shard', 'rock', 'dust', 'smoke', 'spark', 'star', 'feather', 'fire'];

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export class AssetManager {
  /** Fonts that could not be loaded in time (the game falls back to system fonts). */
  readonly missingFonts: string[] = [];

  constructor(private readonly renderer: WorldRenderer) {}

  async load(onProgress: (fraction: number) => void): Promise<void> {
    onProgress(0.05);
    await this.loadFonts();
    onProgress(0.6);
    await nextFrame();
    this.renderer.warmUp(PARTICLE_KINDS);
    onProgress(1);
    await nextFrame();
  }

  private async loadFonts(): Promise<void> {
    if (!('fonts' in document)) return;
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, FONT_TIMEOUT_MS));
    const loads = Promise.all(
      FONTS.map(async (font) => {
        try {
          const faces = await document.fonts.load(font);
          if (faces.length === 0) this.missingFonts.push(font);
        } catch {
          this.missingFonts.push(font);
        }
      }),
    );
    // Canvas text is drawn with these fonts, so wait for them, but never hang the boot on a slow font.
    await Promise.race([loads, timeout]);
  }
}
