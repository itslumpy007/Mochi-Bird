import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

function resolveDataDir(value, fallback) {
  const dir = typeof value === 'string' ? value.trim() : '';
  if (dir) {
    return dir;
  }
  return fallback;
}

const dataDir = resolveDataDir(
  process.env.MOCHI_DATA_DIR || process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH,
  path.join(process.cwd(), 'data')
);
const leaderboardPath = path.join(dataDir, 'leaderboard.json');

let cache = null;
let writeQueue = Promise.resolve();

async function ensureLoaded() {
  if (cache) {
    return cache;
  }

  try {
    const raw = await readFile(leaderboardPath, 'utf8');
    const parsed = JSON.parse(raw);
    cache = new Map(parsed.map((entry) => [entry.userId, entry]));
  } catch {
    cache = new Map();
  }

  return cache;
}

async function persist() {
  await mkdir(dataDir, { recursive: true });
  const entries = [...(await ensureLoaded()).values()]
    .sort((a, b) => b.bestScore - a.bestScore || a.userTag.localeCompare(b.userTag));
  await writeFile(leaderboardPath, JSON.stringify(entries, null, 2), 'utf8');
}

function enqueuePersist() {
  writeQueue = writeQueue
    .then(() => persist())
    .catch((error) => {
      console.warn('Failed to persist leaderboard:', error.message);
    });
  return writeQueue;
}

export async function recordScore({ userId, userTag, score }) {
  const board = await ensureLoaded();
  const existing = board.get(userId);
  const bestScore = existing ? Math.max(existing.bestScore, score) : score;

  const entry = {
    userId,
    userTag,
    bestScore,
    lastScore: score,
    updatedAt: new Date().toISOString()
  };

  board.set(userId, entry);
  await enqueuePersist();
  return entry;
}

export async function getLeaderboard(limit = 10) {
  const board = await ensureLoaded();
  return [...board.values()]
    .sort((a, b) => b.bestScore - a.bestScore || a.userTag.localeCompare(b.userTag))
    .slice(0, limit);
}

export async function getPersonalBest(userId) {
  const board = await ensureLoaded();
  return board.get(userId) ?? null;
}
