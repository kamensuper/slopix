/**
 * Level validation: every level must (1) have a well-formed definition, (2) stand perfectly still
 * before it is hit and (3) be winnable with its own birds (see solver.ts).
 *
 *   npx tsx tools/check-levels.ts            every campaign level
 *   npx tsx tools/check-levels.ts 0 9        levels by global index range (inclusive)
 *   npx tsx tools/check-levels.ts --json out.json   also write the results (scores, birds used)
 */
import { writeFileSync } from 'node:fs';
import type { LevelDef } from '../src/core/types';
import { LEVELS } from '../src/levels/campaign';
import { levelProblems } from '../src/levels/schema';
import { checkStable, solve } from './solver';

const args = process.argv.slice(2);
// --set <module> <export>: check an exported level list (array or record) instead of the campaign.
const setAt = args.indexOf('--set');
let levels: LevelDef[] = LEVELS;
if (setAt >= 0) {
  const mod = (await import(`../src/levels/${args[setAt + 1]}.ts`)) as Record<string, unknown>;
  const value = mod[args[setAt + 2] as string];
  levels = (Array.isArray(value) ? value : Object.values(value as object)) as LevelDef[];
  args.splice(setAt, 3);
}
const jsonAt = args.indexOf('--json');
const jsonPath = jsonAt >= 0 ? args[jsonAt + 1] : undefined;
if (jsonAt >= 0) args.splice(jsonAt, 2);
const [from, to] = [Number(args[0] ?? 0), Number(args[1] ?? levels.length - 1)];

const report: Record<string, unknown>[] = [];
let failures = 0;
for (let i = from; i <= to && i < levels.length; i++) {
  const level = levels[i]!;
  const start = Date.now();
  const invalid = levelProblems(level);
  const unstable = invalid.length === 0 ? checkStable(level) : [];
  let result = invalid.length === 0 ? solve(level) : null;
  // Greedy play fails the big set pieces; give those a wider search before calling them unsolved.
  if (result && !result.won) result = solve(level, 12000, 4);
  const ok = invalid.length === 0 && unstable.length === 0 && !!result?.won;
  if (!ok) failures++;
  const detail = !result ? `invalid: ${invalid.slice(0, 2).join('; ')}` : result.won ? `score ${result.score} trials ${result.trials}` : `foes left ${result.foesLeft} [${result.left}]`;
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${level.id.padEnd(6)} ${level.name.padEnd(22)} stable=${unstable.length === 0 ? 'yes' : unstable.join('; ')} solved=${!!result?.won} birds=${result?.birdsUsed ?? 0}/${level.birds.length} ${detail} ${((Date.now() - start) / 1000).toFixed(0)}s`,
  );
  report.push({ id: level.id, name: level.name, ok, stable: unstable.length === 0, solved: !!result?.won, score: result?.score ?? 0, birdsUsed: result?.birdsUsed ?? 0, birds: level.birds.length, stars: level.stars, problems: [...invalid, ...unstable] });
}
console.log(`${report.length - failures}/${report.length} levels pass`);
if (jsonPath) writeFileSync(jsonPath, JSON.stringify(report, null, 1));
process.exit(failures > 0 ? 1 : 0);
