/** The campaign: three chapters of hand-built levels, plus the metadata menus need. */
import type { CampaignMeta, ChapterMeta, LevelDef, LevelMeta, ThemeId } from '../core/types';
import { CHAPTER_1 } from './chapter1';
import { CHAPTER_2 } from './chapter2';
import { CHAPTER_3 } from './chapter3';

export interface ChapterDef {
  id: string;
  title: string;
  subtitle: string;
  theme: ThemeId;
  levels: LevelDef[];
}

export const CHAPTERS: ChapterDef[] = [
  { id: '1', title: 'Grasslands', subtitle: 'Green hills and wobbly towers', theme: 'grasslands', levels: CHAPTER_1 },
  { id: '2', title: 'Desert', subtitle: 'New birds, new tricks', theme: 'desert', levels: CHAPTER_2 },
  { id: '3', title: 'Snowlands', subtitle: 'Frozen fortresses', theme: 'snowlands', levels: CHAPTER_3 },
];

/** Every level in campaign order. */
export const LEVELS: LevelDef[] = CHAPTERS.flatMap((chapter) => chapter.levels);

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

/** "2-7" style label of a level. */
export function levelLabel(index: number): string {
  const meta = CAMPAIGN.levels[index];
  return meta ? `${meta.chapter + 1}-${meta.number}` : '';
}
