import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const dataDir = (
  process.env.MOCHI_DATA_DIR ||
  process.env.DATA_DIR ||
  process.env.RAILWAY_VOLUME_MOUNT_PATH ||
  path.join(process.cwd(), 'data')
).trim();

const filePath = path.join(dataDir, 'profiles.json');

let cache = null; // Map<userId, profile>
let writeQueue = Promise.resolve();

function defaultProfile(userId, userTag = '', avatarHash = null) {
  return {
    userId,
    userTag,
    avatarHash,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ownedSkins: ['default'],
    equippedSkin: 'default',
    lifetimeCans: 0,
    difficulty: 'normal',
    muted: false,
    particlesEnabled: true,
    hellMode: false,
    runHistory: [],
    questDate: null,
    questProgress: [],
    streakCount: 0,
    streakDate: null,
    totalGames: 0,
    totalCansEarned: 0,
    totalPipes: 0,
    bestComboEver: 0,
    bestScoreEver: 0,
    cansSpent: 0,
    unlockedAchievements: [],
    achievementRewardClaims: [],
    equippedTitle: null,
    seasonId: null,
    seasonPoints: 0,
    seasonRewardClaimed: false,
    reviveDate: null,
    tutorialDone: false,
  };
}

function clampInt(value, fallback = 0) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function clampFloat(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function normalizeRunEntry(entry) {
  if (typeof entry === 'number') {
    return {
      score: clampInt(entry, 0),
      durationMs: 0,
      reason: 'legacy',
      playedAt: null,
      cansEarned: 0,
      combo: 0,
      pipes: clampInt(entry, 0),
    };
  }

  if (!entry || typeof entry !== 'object') {
    return null;
  }

  return {
    score: clampInt(entry.score, 0),
    durationMs: clampInt(entry.durationMs, 0),
    reason: typeof entry.reason === 'string' && entry.reason ? entry.reason : 'game_over',
    playedAt: typeof entry.playedAt === 'string' ? entry.playedAt : new Date().toISOString(),
    cansEarned: clampInt(entry.cansEarned, 0),
    combo: clampInt(entry.combo, 0),
    pipes: clampInt(entry.pipes, clampInt(entry.score, 0)),
  };
}

function normalizeStringList(value) {
  return Array.isArray(value)
    ? [...new Set(value.filter(v => typeof v === 'string' && v.trim()).map(v => v.trim()).slice(0, 50))]
    : [];
}

function normalizeQuestEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  return {
    id: typeof entry.id === 'string' ? entry.id : '',
    value: clampInt(entry.value, 0),
    completed: toBool(entry.completed, false),
    claimed: toBool(entry.claimed, false),
  };
}

function toBool(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value === 'true';
  return fallback;
}

function sanitizeProfile(input, base) {
  const profile = { ...base, ...input };
  const ownedSkins = Array.isArray(profile.ownedSkins) && profile.ownedSkins.length
    ? [...new Set(profile.ownedSkins.filter(Boolean))]
    : ['default'];
  const runHistory = Array.isArray(profile.runHistory)
    ? profile.runHistory
        .map(normalizeRunEntry)
        .filter(Boolean)
        .slice(-25)
    : [];

  profile.userId = base.userId;
  profile.userTag = typeof profile.userTag === 'string' ? profile.userTag : base.userTag;
  profile.avatarHash = profile.avatarHash ?? base.avatarHash ?? null;
  profile.createdAt = base.createdAt || profile.createdAt || new Date().toISOString();
  profile.updatedAt = new Date().toISOString();
  profile.ownedSkins = ownedSkins;
  profile.equippedSkin = typeof profile.equippedSkin === 'string' && profile.equippedSkin
    ? profile.equippedSkin
    : 'default';
  profile.lifetimeCans = clampInt(profile.lifetimeCans, base.lifetimeCans ?? 0);
  profile.difficulty = ['easy', 'normal', 'hard'].includes(profile.difficulty) ? profile.difficulty : 'normal';
  profile.muted = toBool(profile.muted, false);
  profile.particlesEnabled = toBool(profile.particlesEnabled, true);
  profile.hellMode = toBool(profile.hellMode, false);
  profile.runHistory = runHistory;
  profile.questDate = typeof profile.questDate === 'string' ? profile.questDate : null;
  profile.questProgress = Array.isArray(profile.questProgress)
    ? profile.questProgress.map(normalizeQuestEntry).filter(q => q && q.id)
    : [];
  profile.streakCount = clampInt(profile.streakCount, 0);
  profile.streakDate = typeof profile.streakDate === 'string' ? profile.streakDate : null;
  profile.totalGames = clampInt(profile.totalGames, 0);
  profile.totalCansEarned = clampInt(profile.totalCansEarned, 0);
  profile.totalPipes = clampInt(profile.totalPipes, 0);
  profile.bestComboEver = clampInt(profile.bestComboEver, 0);
  profile.bestScoreEver = clampInt(profile.bestScoreEver, 0);
  profile.cansSpent = clampInt(profile.cansSpent, 0);
  profile.unlockedAchievements = normalizeStringList(profile.unlockedAchievements);
  profile.achievementRewardClaims = normalizeStringList(profile.achievementRewardClaims);
  profile.equippedTitle = typeof profile.equippedTitle === 'string' && profile.equippedTitle.trim()
    ? profile.equippedTitle.trim()
    : null;
  profile.seasonId = typeof profile.seasonId === 'string' && profile.seasonId.trim()
    ? profile.seasonId.trim()
    : null;
  profile.seasonPoints = clampInt(profile.seasonPoints, 0);
  profile.seasonRewardClaimed = toBool(profile.seasonRewardClaimed, false);
  profile.reviveDate = typeof profile.reviveDate === 'string' && profile.reviveDate.trim()
    ? profile.reviveDate.trim()
    : null;
  profile.tutorialDone = toBool(profile.tutorialDone, false);
  return profile;
}

async function load() {
  if (cache) return cache;
  try {
    const raw = await readFile(filePath, 'utf8');
    cache = new Map(JSON.parse(raw).map(entry => [entry.userId, entry]));
  } catch {
    cache = new Map();
  }
  return cache;
}

async function persist() {
  const store = await load();
  const entries = [...store.values()].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  await mkdir(dataDir, { recursive: true });
  await writeFile(filePath, JSON.stringify(entries, null, 2), 'utf8');
}

function enqueuePersist() {
  writeQueue = writeQueue
    .then(persist)
    .then(() => { cache = null; })
    .catch(err => console.warn('Profile persist failed:', err.message));
}

export async function getPlayerProfile(userId, { userTag = '', avatarHash = null } = {}) {
  const store = await load();
  const existing = store.get(userId);
  if (existing) {
    return sanitizeProfile(existing, defaultProfile(userId, userTag || existing.userTag, avatarHash ?? existing.avatarHash ?? null));
  }
  return defaultProfile(userId, userTag, avatarHash);
}

export async function savePlayerProfile({ userId, userTag = '', avatarHash = null, profile = {} }) {
  await writeQueue;
  cache = null;

  const store = await load();
  const base = store.get(userId) || defaultProfile(userId, userTag, avatarHash);
  const merged = sanitizeProfile({ ...base, ...profile, userTag: userTag || base.userTag, avatarHash: avatarHash ?? base.avatarHash }, base);
  store.set(userId, merged);
  enqueuePersist();
  return merged;
}
