import { randomUUID, randomBytes } from 'node:crypto';

const TTL_MS   = Number(process.env.SESSION_TTL_MINUTES || 240) * 60 * 1000; // 4 hours by default
const sessions = new Map();
const tokens   = new Map(); // Map of token -> sessionId
const userSessions = new Map(); // Map of userId -> sessionId (latest session for each user)
let lastCreatedSession = null; // Track most recent session for Activity linking

function now() { return Date.now(); }

function prune() {
  const t = now();
  for (const [id, s] of sessions) {
    if (s.expiresAt <= t) sessions.delete(id);
  }
}

export function createSession({ userId, userTag, avatarHash = null, channelId, guildId = '', baseUrl = '' }) {
  prune();
  const id        = randomUUID();
  const createdAt = now();
  const session   = {
    id, userId, userTag, avatarHash, channelId, guildId, baseUrl,
    createdAt,
    expiresAt:   createdAt + TTL_MS,
    status:      'active',
    score:       null,
    submittedAt: null,
  };
  sessions.set(id, session);
  // Store latest session for this user
  userSessions.set(userId, id);
  // Track most recent session for Activity auto-linking (expires in 5 minutes)
  lastCreatedSession = { session, expiresAt: createdAt + 300000 };
  console.log(`[state] Created session for ${userTag}, pending activity expires at ${new Date(createdAt + 300000).toISOString()}`);
  return session;
}

export function getSession(id) {
  prune();
  return sessions.get(id) ?? null;
}

export function completeSession(id, { score, durationMs, reason }) {
  prune();
  const s = sessions.get(id);
  if (!s || s.status === 'completed') return s ?? null;
  s.status      = 'completed';
  s.score       = score;
  s.durationMs  = durationMs;
  s.reason      = reason;
  s.submittedAt = now();
  return s;
}

export function publicSession(s) {
  if (!s) return null;
  return {
    id: s.id, userId: s.userId, userTag: s.userTag, avatarHash: s.avatarHash ?? null,
    channelId: s.channelId, guildId: s.guildId,
    createdAt: s.createdAt, expiresAt: s.expiresAt,
    status: s.status, score: s.score, submittedAt: s.submittedAt,
  };
}

export function createSessionToken(sessionId) {
  // Generate a random 32-byte token
  const token = randomBytes(32).toString('hex');
  tokens.set(token, sessionId);
  return token;
}

export function getSessionByToken(token) {
  prune();
  const sessionId = tokens.get(token);
  if (!sessionId) return null;
  const session = sessions.get(sessionId);
  return session ?? null;
}

export function getLatestSessionForUser(userId) {
  prune();
  const sessionId = userSessions.get(userId);
  if (!sessionId) return null;
  const session = sessions.get(sessionId);
  return session ?? null;
}

export function getPendingActivitySession() {
  const currentTime = now();
  console.log(`[state] getPendingActivitySession called. lastCreatedSession:`, lastCreatedSession ? `exists, expires at ${new Date(lastCreatedSession.expiresAt).toISOString()}, now is ${new Date(currentTime).toISOString()}` : 'null');

  if (!lastCreatedSession) {
    console.log('[state] lastCreatedSession is null');
    return null;
  }

  if (currentTime > lastCreatedSession.expiresAt) {
    console.log('[state] Session expired');
    lastCreatedSession = null;
    return null;
  }

  console.log('[state] Returning pending session');
  return lastCreatedSession.session;
}

export function buildPlayUrl(baseUrl, sessionId) {
  const url = new URL('/play', baseUrl);
  url.searchParams.set('sid', sessionId);
  return url.toString();
}

export function buildActivityUrl(baseUrl, sessionId) {
  const token = createSessionToken(sessionId);
  const url = new URL('/play', baseUrl);
  url.searchParams.set('token', token);
  return url.toString();
}
