import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

function resolveDataDir(value, fallback) {
  const dir = typeof value === 'string' ? value.trim() : '';
  return dir || fallback;
}

const dataDir = resolveDataDir(
  process.env.MOCHI_DATA_DIR || process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH,
  path.join(process.cwd(), 'data')
);

const leaderboardPath = path.join(dataDir, 'mochi-leaderboard.json');
const recentRunsPath = path.join(dataDir, 'mochi-runs.json');
const profilesPath = path.join(dataDir, 'mochi-profiles.json');
const defaultCosmeticId = 'avatar-v3';

let leaderboardCache = null;
let recentRunsCache = null;
let profilesCache = null;
let writeQueue = Promise.resolve();

function normalizeLeaderboardEntry(raw) {
  const entry = raw && typeof raw === 'object' ? raw : {};
  return {
    userId: String(entry.userId || '').trim(),
    userTag: typeof entry.userTag === 'string' ? entry.userTag.trim() : '',
    bestScore: Math.max(0, Math.floor(Number(entry.bestScore) || 0)),
    lastScore: Math.max(0, Math.floor(Number(entry.lastScore) || 0)),
    updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : new Date().toISOString()
  };
}

function normalizeRecentRun(raw) {
  const run = raw && typeof raw === 'object' ? raw : {};
  return {
    userId: String(run.userId || '').trim(),
    userTag: typeof run.userTag === 'string' ? run.userTag.trim() : '',
    score: Math.max(0, Math.floor(Number(run.score) || 0)),
    durationMs: Math.max(0, Math.floor(Number(run.durationMs) || 0)),
    cans: Math.max(0, Math.floor(Number(run.cans) || 0)),
    reason: typeof run.reason === 'string' && run.reason.trim() ? run.reason.trim() : 'game_over',
    updatedAt: typeof run.updatedAt === 'string' ? run.updatedAt : new Date().toISOString()
  };
}

export function normalizeCosmeticState(raw) {
  const ownedIds = new Set([defaultCosmeticId]);
  const ownedSource = Array.isArray(raw?.ownedIds) ? raw.ownedIds : [];

  for (const id of ownedSource) {
    if (typeof id === 'string' && id.trim()) {
      ownedIds.add(id.trim());
    }
  }

  let selectedId = typeof raw?.selectedId === 'string' ? raw.selectedId.trim() : defaultCosmeticId;
  if (!ownedIds.has(selectedId)) {
    selectedId = defaultCosmeticId;
  }

  return {
    selectedId,
    ownedIds: [...ownedIds]
  };
}

function normalizeProfile(raw, fallbackUserId = '') {
  const profile = raw && typeof raw === 'object' ? raw : {};
  return {
    userId: String(profile.userId || fallbackUserId || '').trim(),
    userTag: typeof profile.userTag === 'string' ? profile.userTag.trim() : '',
    canWallet: Math.max(0, Math.floor(Number(profile.canWallet) || 0)),
    cosmeticState: normalizeCosmeticState(profile.cosmeticState),
    updatedAt: typeof profile.updatedAt === 'string' ? profile.updatedAt : null
  };
}

async function ensureLoadedLeaderboard() {
  if (leaderboardCache) {
    return leaderboardCache;
  }

  try {
    const raw = await readFile(leaderboardPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      leaderboardCache = new Map(parsed.map((entry) => [String(entry.userId || '').trim(), normalizeLeaderboardEntry(entry)]));
    } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.entries)) {
      leaderboardCache = new Map(parsed.entries.map((entry) => [String(entry.userId || '').trim(), normalizeLeaderboardEntry(entry)]));
    } else {
      leaderboardCache = new Map();
    }
  } catch {
    leaderboardCache = new Map();
  }

  return leaderboardCache;
}

async function ensureLoadedRecentRuns() {
  if (recentRunsCache) {
    return recentRunsCache;
  }

  try {
    const raw = await readFile(recentRunsPath, 'utf8');
    const parsed = JSON.parse(raw);
    recentRunsCache = Array.isArray(parsed) ? parsed.map(normalizeRecentRun) : [];
  } catch {
    recentRunsCache = [];
  }

  return recentRunsCache;
}

async function ensureLoadedProfiles() {
  if (profilesCache) {
    return profilesCache;
  }

  try {
    const raw = await readFile(profilesPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      profilesCache = new Map(Object.entries(parsed).map(([userId, profile]) => [userId, normalizeProfile(profile, userId)]));
    } else {
      profilesCache = new Map();
    }
  } catch {
    profilesCache = new Map();
  }

  return profilesCache;
}

function enqueuePersist(persistFn) {
  writeQueue = writeQueue
    .then(persistFn)
    .catch((error) => {
      console.warn('Failed to persist Mochi Bird data:', error.message);
    });
  return writeQueue;
}

async function persistLeaderboard() {
  await mkdir(dataDir, { recursive: true });
  const entries = [...(await ensureLoadedLeaderboard()).values()]
    .sort((a, b) => b.bestScore - a.bestScore || a.userTag.localeCompare(b.userTag));
  await writeFile(leaderboardPath, JSON.stringify(entries, null, 2), 'utf8');
}

async function persistRecentRuns() {
  await mkdir(dataDir, { recursive: true });
  const entries = (await ensureLoadedRecentRuns()).slice(0, 50);
  await writeFile(recentRunsPath, JSON.stringify(entries, null, 2), 'utf8');
}

async function persistProfiles() {
  await mkdir(dataDir, { recursive: true });
  const payload = Object.fromEntries([... (await ensureLoadedProfiles()).entries()].sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(profilesPath, JSON.stringify(payload, null, 2), 'utf8');
}

export async function recordScore({ userId, userTag, score }) {
  const board = await ensureLoadedLeaderboard();
  const normalizedUserId = String(userId || '').trim();
  const normalizedUserTag = typeof userTag === 'string' ? userTag.trim() : '';
  const normalizedScore = Math.max(0, Math.floor(Number(score) || 0));
  const existing = board.get(normalizedUserId);
  const bestScore = existing ? Math.max(existing.bestScore, normalizedScore) : normalizedScore;

  const entry = {
    userId: normalizedUserId,
    userTag: normalizedUserTag || existing?.userTag || normalizedUserId,
    bestScore,
    lastScore: normalizedScore,
    updatedAt: new Date().toISOString()
  };

  board.set(normalizedUserId, entry);
  await enqueuePersist(persistLeaderboard);
  return entry;
}

export async function recordRun({ userId, userTag, score, durationMs = 0, cans = 0, reason = 'game_over' }) {
  const runs = await ensureLoadedRecentRuns();
  const entry = normalizeRecentRun({
    userId,
    userTag,
    score,
    durationMs,
    cans,
    reason,
    updatedAt: new Date().toISOString()
  });

  runs.unshift(entry);
  if (runs.length > 50) {
    runs.length = 50;
  }

  await enqueuePersist(persistRecentRuns);
  return entry;
}

export async function getLeaderboard(limit = 10) {
  const board = await ensureLoadedLeaderboard();
  return [...board.values()]
    .sort((a, b) => b.bestScore - a.bestScore || a.userTag.localeCompare(b.userTag))
    .slice(0, limit);
}

export async function getPersonalBest(userId) {
  const board = await ensureLoadedLeaderboard();
  return board.get(String(userId || '').trim()) ?? null;
}

export async function getRecentRuns(limit = 8) {
  const runs = await ensureLoadedRecentRuns();
  return runs
    .slice()
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, limit);
}

export async function getProfile(userId) {
  const profiles = await ensureLoadedProfiles();
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) {
    return normalizeProfile(null, '');
  }
  return profiles.get(normalizedUserId) || normalizeProfile({ userId: normalizedUserId });
}

export async function upsertProfile(userId, patch = {}) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) {
    return normalizeProfile(null, '');
  }

  const profiles = await ensureLoadedProfiles();
  const current = normalizeProfile(profiles.get(normalizedUserId) || null, normalizedUserId);
  const next = {
    ...current,
    userId: normalizedUserId
  };

  if (typeof patch.userTag === 'string' && patch.userTag.trim()) {
    next.userTag = patch.userTag.trim();
  }
  if (patch.canWallet !== undefined) {
    next.canWallet = Math.max(0, Math.floor(Number(patch.canWallet) || 0));
  }
  if (patch.cosmeticState) {
    next.cosmeticState = normalizeCosmeticState({
      selectedId: patch.cosmeticState.selectedId,
      ownedIds: patch.cosmeticState.ownedIds
    });
  }

  next.updatedAt = new Date().toISOString();
  profiles.set(normalizedUserId, next);
  await enqueuePersist(persistProfiles);
  return next;
}

export async function buildBootstrapPayload() {
  return {
    leaderboard: await getLeaderboard(10),
    recentRuns: await getRecentRuns(8)
  };
}
