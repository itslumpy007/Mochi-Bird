import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createSession, getSession, publicSession } from './state.js';

const dataDir = (
  process.env.MOCHI_DATA_DIR ||
  process.env.DATA_DIR ||
  process.env.RAILWAY_VOLUME_MOUNT_PATH ||
  path.join(process.cwd(), 'data')
).trim();

const filePath = path.join(dataDir, 'races.json');

let cache = null; // Map<raceId, race>
let writeQueue = Promise.resolve();

function loadStatus(race, userId) {
  const participant = race.participants?.[userId];
  if (participant?.bestScore != null) {
    return participant.bestScore > race.targetScore ? 'ahead' : participant.bestScore === race.targetScore ? 'tied' : 'behind';
  }
  return 'open';
}

export function sanitizeRace(race, viewerUserId = null) {
  const participants = Object.fromEntries(
    Object.entries(race.participants || {}).map(([userId, p]) => [userId, {
      userId,
      userTag: p.userTag || '',
      avatarHash: p.avatarHash || null,
      bestScore: Number(p.bestScore || 0),
      submittedAt: p.submittedAt || null,
      sessionId: p.sessionId || null,
      status: loadStatus(race, userId),
    }])
  );

  return {
    id: race.id,
    createdAt: race.createdAt,
    updatedAt: race.updatedAt,
    expiresAt: race.expiresAt,
    creatorUserId: race.creatorUserId,
    creatorUserTag: race.creatorUserTag,
    creatorAvatarHash: race.creatorAvatarHash || null,
    targetScore: Number(race.targetScore || 0),
    targetLabel: race.targetLabel || 'Beat the best score',
    baseSessionId: race.baseSessionId || null,
    baseSessionUserTag: race.baseSessionUserTag || '',
    challengeMessage: race.challengeMessage || '',
    participants,
    viewerStatus: viewerUserId ? loadStatus(race, viewerUserId) : 'open',
  };
}

function clampInt(value, fallback = 0) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

async function load() {
  if (cache) return cache;
  try {
    const raw = await readFile(filePath, 'utf8');
    cache = new Map(JSON.parse(raw).map(entry => [entry.id, entry]));
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
    .catch(err => console.warn('Race persist failed:', err.message));
}

export async function createRace({ creatorUserId, creatorUserTag, creatorAvatarHash = null, targetScore, baseSessionId = null, baseSessionUserTag = '', challengeMessage = '' }) {
  await writeQueue;
  cache = null;
  const store = await load();

  const race = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    creatorUserId,
    creatorUserTag,
    creatorAvatarHash: creatorAvatarHash || null,
    targetScore: clampInt(targetScore, 0),
    targetLabel: 'Beat the best score',
    baseSessionId,
    baseSessionUserTag,
    challengeMessage,
    participants: {},
  };

  store.set(race.id, race);
  enqueuePersist();
  return race;
}

export async function getRace(raceId) {
  const store = await load();
  return store.get(raceId) ?? null;
}

export async function claimRaceSession(raceId, { userId, userTag, avatarHash = null, channelId = '', guildId = '', baseUrl = '' }) {
  await writeQueue;
  cache = null;
  const store = await load();
  const race = store.get(raceId);
  if (!race) return null;

  const existing = race.participants?.[userId];
  if (existing?.sessionId) {
    const session = getSession(existing.sessionId);
    if (session) return { race: sanitizeRace(race, userId), session: publicSession(session) };
  }

  const session = createSession({
    userId,
    userTag,
    avatarHash,
    channelId,
    guildId,
    baseUrl,
    raceId,
    raceTargetScore: race.targetScore,
    raceCreatorUserId: race.creatorUserId,
    raceCreatorUserTag: race.creatorUserTag,
  });

  race.participants = race.participants || {};
  race.participants[userId] = {
    sessionId: session.id,
    userId,
    userTag,
    avatarHash: avatarHash || null,
    bestScore: Number(existing?.bestScore || 0),
    submittedAt: existing?.submittedAt || null,
  };
  race.updatedAt = new Date().toISOString();
  store.set(race.id, race);
  enqueuePersist();
  return { race: sanitizeRace(race, userId), session: publicSession(session) };
}

export async function recordRaceScore({ raceId, userId, userTag, avatarHash = null, sessionId, score }) {
  await writeQueue;
  cache = null;
  const store = await load();
  const race = store.get(raceId);
  if (!race) return null;

  race.participants = race.participants || {};
  const existing = race.participants[userId] || { userId, userTag, avatarHash: avatarHash || null, sessionId: sessionId || null, bestScore: 0, submittedAt: null };
  const bestScore = Math.max(Number(existing.bestScore || 0), clampInt(score, 0));
  race.participants[userId] = {
    ...existing,
    userTag: userTag || existing.userTag || '',
    avatarHash: avatarHash ?? existing.avatarHash ?? null,
    sessionId: sessionId || existing.sessionId || null,
    bestScore,
    submittedAt: new Date().toISOString(),
  };
  race.updatedAt = new Date().toISOString();
  store.set(race.id, race);
  enqueuePersist();

  return sanitizeRace(race, userId);
}
