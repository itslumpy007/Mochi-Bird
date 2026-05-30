import { randomUUID, randomBytes } from 'node:crypto';

const TTL_MS   = Number(process.env.SESSION_TTL_MINUTES || 240) * 60 * 1000; // 4 hours by default
const sessions = new Map();
const tokens   = new Map(); // Map of token -> sessionId

function now() { return Date.now(); }

function prune() {
  const t = now();
  for (const [id, s] of sessions) {
    if (s.expiresAt <= t) sessions.delete(id);
  }
}

export function createSession({ userId, userTag, channelId, guildId = '', baseUrl = '' }) {
  prune();
  const id        = randomUUID();
  const createdAt = now();
  const session   = {
    id, userId, userTag, channelId, guildId, baseUrl,
    createdAt,
    expiresAt:   createdAt + TTL_MS,
    status:      'active',
    score:       null,
    submittedAt: null,
  };
  sessions.set(id, session);
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
    id: s.id, userId: s.userId, userTag: s.userTag,
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
