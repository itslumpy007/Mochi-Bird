import { randomUUID } from 'node:crypto';

const ttlMinutes = Number(process.env.SESSION_TTL_MINUTES || 30);
const DEFAULT_TTL_MS = Number.isFinite(ttlMinutes) && ttlMinutes > 0 ? ttlMinutes * 60 * 1000 : 30 * 60 * 1000;
const sessions = new Map();

function now() {
  return Date.now();
}

export function createSession({
  userId,
  userTag,
  channelId,
  guildId,
  baseUrl,
  ttlMs = DEFAULT_TTL_MS
}) {
  const id = randomUUID();
  const createdAt = now();

  const session = {
    id,
    userId,
    userTag,
    channelId,
    guildId,
    createdAt,
    expiresAt: createdAt + ttlMs,
    status: 'active',
    score: null,
    submittedAt: null,
    baseUrl
  };

  sessions.set(id, session);
  return session;
}

export function getSession(id) {
  cleanupSessions();
  return sessions.get(id) ?? null;
}

export function completeSession(id, payload) {
  cleanupSessions();
  const session = sessions.get(id);
  if (!session) {
    return null;
  }

  if (session.status === 'completed') {
    return session;
  }

  session.status = 'completed';
  session.score = payload.score;
  session.submittedAt = now();
  session.lastResult = payload;
  sessions.set(id, session);
  return session;
}

export function publicSession(session) {
  if (!session) {
    return null;
  }

  return {
    id: session.id,
    userTag: session.userTag,
    userId: session.userId,
    channelId: session.channelId,
    guildId: session.guildId,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    status: session.status,
    score: session.score,
    submittedAt: session.submittedAt
  };
}

export function buildPlayUrl(baseUrl, sessionId) {
  const url = new URL('/play', baseUrl);
  url.searchParams.set('sid', sessionId);
  return url.toString();
}

export function cleanupSessions() {
  const current = now();
  for (const [id, session] of sessions.entries()) {
    if (session.expiresAt <= current) {
      sessions.delete(id);
    }
  }
}
