import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const dataDir  = (
  process.env.MOCHI_DATA_DIR ||
  process.env.DATA_DIR ||
  process.env.RAILWAY_VOLUME_MOUNT_PATH ||
  path.join(process.cwd(), 'data')
).trim();

const filePath = path.join(dataDir, 'leaderboard.json');

let cache      = null;       // Map<userId, entry>
let writeQueue = Promise.resolve();

async function load() {
  if (cache) return cache;
  try {
    const raw = await readFile(filePath, 'utf8');
    cache = new Map(JSON.parse(raw).map(e => [e.userId, e]));
  } catch {
    cache = new Map();
  }
  return cache;
}

async function persist() {
  const board   = await load();
  const entries = [...board.values()].sort(
    (a, b) => b.bestScore - a.bestScore || a.userTag.localeCompare(b.userTag)
  );
  await mkdir(dataDir, { recursive: true });
  await writeFile(filePath, JSON.stringify(entries, null, 2), 'utf8');
}

function enqueuePersist() {
  writeQueue = writeQueue
    .then(persist)
    .then(() => { cache = null; }) // Clear cache after successful persist
    .catch(err => console.warn('Leaderboard persist failed:', err.message));
}

export async function recordScore({ userId, userTag, score }) {
  // Always wait for previous writes to complete, then clear cache
  await writeQueue;
  cache = null;

  const board    = await load();
  const existing = board.get(userId);
  const bestScore = existing ? Math.max(existing.bestScore, score) : score;
  const entry    = { userId, userTag, bestScore, lastScore: score, updatedAt: new Date().toISOString() };
  board.set(userId, entry);
  console.log(`[leaderboard] Recorded score for ${userTag}: ${score} (best: ${bestScore})`);
  enqueuePersist();
  return entry;
}

export async function getLeaderboard(limit = 10) {
  const board = await load();
  return [...board.values()]
    .sort((a, b) => b.bestScore - a.bestScore || a.userTag.localeCompare(b.userTag))
    .slice(0, limit);
}

export async function getPersonalBest(userId) {
  const board = await load();
  return board.get(userId) ?? null;
}
