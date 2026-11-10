/**
 * The campaign: the ten featured levels in three worlds, plus the metadata menus need.
 * The older 30-level set (chapter1-3.ts) stays in the source as LEGACY_LEVELS but is not played.
 */
import type { CampaignMeta, ChapterMeta, LevelDef, LevelMeta, ThemeId } from '../core/types';
import { CHAPTER_1 } from './chapter1';
import { CHAPTER_2 } from './chapter2';
import { CHAPTER_3 } from './chapter3';
import { FEATURED } from './featured';

export interface ChapterDef {
  id: string;
  title: string;
  subtitle: string;
  theme: ThemeId;
  levels: LevelDef[];
}

const THEMES: ThemeId[] = ['grasslands', 'desert', 'snowlands'];

export const CHAPTERS: ChapterDef[] = FEATURED.map((chapter, i) => ({ ...chapter, theme: THEMES[i] as ThemeId }));

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
