/**
 * The campaign: five worlds. The first three are the featured hand-composed levels (the Frostbound
 * Heights also take the four frost levels), then the Stormreach Skies and the Ironworks.
 *
 * A level's `id` is its save key and never changes; the number shown to the player comes from its
 * position in its world, so levels can be inserted without disturbing saved progress.
 * Levels that do not yet pass tools/check-levels.ts are listed in HELD_BACK and not played.
 */
import type { CampaignMeta, ChapterMeta, LevelDef, LevelMeta, ThemeId } from '../core/types';
import { CHAPTER_1 } from './chapter1';
import { CHAPTER_2 } from './chapter2';
import { CHAPTER_3 } from './chapter3';
import { FEATURED } from './featured';
import { FROST_NEW } from './worldFrost';
import { IRON } from './worldIron';
import { STORM } from './worldStorm';

export interface ChapterDef {
  id: string;
  title: string;
  subtitle: string;
  theme: ThemeId;
  levels: LevelDef[];
}

/** Built but not yet proven stable and winnable; kept out of the campaign until they are. */
export const HELD_BACK: readonly string[] = ['4-12', '5-9', '5-10'];
const ready = (levels: LevelDef[]): LevelDef[] => levels.filter((level) => !HELD_BACK.includes(level.id));

const [wild, badlands, frost] = FEATURED as [(typeof FEATURED)[number], (typeof FEATURED)[number], (typeof FEATURED)[number]];
const [ironRoof, avalanche, iceBridge, baronsPeak] = frost.levels as [LevelDef, LevelDef, LevelDef, LevelDef];

export const CHAPTERS: ChapterDef[] = [
  { ...wild, theme: 'grasslands' },
  { ...badlands, theme: 'desert' },
  {
    ...frost,
    theme: 'snowlands',
    // Ice and frost are taught between the featured set pieces; the Baron stays the finale.
    levels: [ironRoof, FROST_NEW.curlingStones, FROST_NEW.thinIce, avalanche, FROST_NEW.coldSnap, iceBridge, FROST_NEW.deepFreeze, baronsPeak],
  },
  { id: '4', title: 'The Stormreach Skies', subtitle: 'Wind, balloons and lightning', theme: 'storm', levels: ready(STORM) },
  { id: '5', title: 'The Ironworks', subtitle: 'Belts, presses, rubber and powder', theme: 'ironworks', levels: ready(IRON) },
];

/** Every campaign level in order. */
export const LEVELS: LevelDef[] = CHAPTERS.flatMap((chapter) => chapter.levels);

/** The earlier, unpolished level set; kept for reference and tooling, not part of the campaign. */
export const LEGACY_LEVELS: LevelDef[] = [...CHAPTER_1, ...CHAPTER_2, ...CHAPTER_3];

function buildMeta(): CampaignMeta {
  const chapters: ChapterMeta[] = [];
  const levels: LevelMeta[] = [];
  CHAPTERS.forEach((chapter, chapterIndex) => {
    const metas = chapter.levels.map((level, i): LevelMeta => {
      const meta: LevelMeta = {
        id: level.id,
        index: levels.length,
        number: i + 1,
        chapter: chapterIndex,
        name: level.name,
        birds: [...level.birds],
      };
      levels.push(meta);
      return meta;
    });
    chapters.push({ id: chapter.id, index: chapterIndex, title: chapter.title, subtitle: chapter.subtitle, theme: chapter.theme, levels: metas });
  });
  return { chapters, levels };
}

export const CAMPAIGN: CampaignMeta = buildMeta();

/** "2-3" style label of a level. */
export function levelLabel(index: number): string {
  const meta = CAMPAIGN.levels[index];
  return meta ? `${meta.chapter + 1}-${meta.number}` : '';
}
