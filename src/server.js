import express from 'express';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { completeSession, createSession, getSession, publicSession } from './state.js';
import {
  buildBootstrapPayload,
  getLeaderboard,
  getPersonalBest,
  getProfile,
  getRecentRuns,
  recordRun,
  recordScore,
  upsertProfile
} from './leaderboard.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');
const indexHtml = await readFile(path.join(publicDir, 'index.html'), 'utf8');

function parseScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score) || score < 0) {
    return null;
  }
  return Math.floor(score);
}

function safeJsonForHtml(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

async function renderGameHtml() {
  const bootstrap = {
    ...(await buildBootstrapPayload()),
    publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
    activityMode: process.env.DISCORD_ACTIVITY_MODE === 'true',
    discordClientId: process.env.DISCORD_CLIENT_ID || null,
    mochiPath: '/play',
    sessionTtlMinutes: Number(process.env.SESSION_TTL_MINUTES || 30)
  };

  const payloadTag = `<script id="mochi-bootstrap" type="application/json">${safeJsonForHtml(bootstrap)}</script>`;
  if (indexHtml.includes('<script id="mochi-bootstrap" type="application/json">')) {
    return indexHtml.replace(
      /<script id="mochi-bootstrap" type="application\/json">[\s\S]*?<\/script>/,
      payloadTag
    );
  }

  return indexHtml.replace('</body>', `${payloadTag}\n</body>`);
}

async function sendGamePage(res) {
  res.type('html').send(await renderGameHtml());
}

async function handleScoreSubmission(req, res, onScoreSubmitted) {
  const session = getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ ok: false, error: 'Session not found or expired' });
  }

  if (session.status === 'completed') {
    return res.status(409).json({
      ok: false,
      error: 'This score was already submitted',
      session: publicSession(session)
    });
  }

  const score = parseScore(req.body.score);
  if (score === null) {
    return res.status(400).json({ ok: false, error: 'Invalid score' });
  }

  const durationMs = Number(req.body.durationMs) || 0;
  const cans = Number(req.body.cans) || 0;
  const reason = typeof req.body.reason === 'string' ? req.body.reason : 'game_over';

  const completedSession = completeSession(req.params.id, {
    score,
    durationMs,
    reason
  });

  const personalBest = await recordScore({
    userId: completedSession.userId,
    userTag: completedSession.userTag,
    score
  });
  await recordRun({
    userId: completedSession.userId,
    userTag: completedSession.userTag,
    score,
    durationMs,
    cans,
    reason
  });
  const leaderboard = await getLeaderboard(10);
  const recentRuns = await getRecentRuns(8);

  if (typeof onScoreSubmitted === 'function') {
    await onScoreSubmitted({
      session: completedSession,
      score,
      durationMs,
      cans,
      reason,
      personalBest,
      leaderboard,
      recentRuns
    });
  }

  return res.json({
    ok: true,
    session: publicSession(completedSession),
    personalBest,
    leaderboard,
    recentRuns
  });
}

async function handleProfileRead(req, res) {
  const session = getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ ok: false, error: 'Session not found or expired' });
  }

  return res.json({
    ok: true,
    profile: await getProfile(session.userId)
  });
}

async function handleProfileWrite(req, res) {
  const session = getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ ok: false, error: 'Session not found or expired' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const profile = await upsertProfile(session.userId, {
    userTag: session.userTag,
    canWallet: body.canWallet,
    cosmeticState: body.cosmeticState
  });

  return res.json({ ok: true, profile });
}

export function createServer({ onScoreSubmitted } = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(express.static(publicDir, { extensions: ['html'], index: false }));

  app.get('/', async (_req, res) => {
    await sendGamePage(res);
  });

  app.get('/play', async (_req, res) => {
    await sendGamePage(res);
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, uptime: process.uptime() });
  });

  app.get('/api/config', async (_req, res) => {
    res.json({
      ok: true,
      gameTitle: 'Mochi Bird',
      publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
      activityMode: process.env.DISCORD_ACTIVITY_MODE === 'true',
      discordClientId: process.env.DISCORD_CLIENT_ID || null,
      leaderboard: await getLeaderboard(10),
      recentRuns: await getRecentRuns(8)
    });
  });

  app.get('/api/mochi/config', async (_req, res) => {
    res.json({
      ok: true,
      gameTitle: 'Mochi Bird',
      publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
      mochiPath: '/play',
      sessionTtlMinutes: Number(process.env.SESSION_TTL_MINUTES || 30),
      activityMode: process.env.DISCORD_ACTIVITY_MODE === 'true',
      discordClientId: process.env.DISCORD_CLIENT_ID || null,
      leaderboard: await getLeaderboard(10),
      recentRuns: await getRecentRuns(8)
    });
  });

  app.post('/api/mochi/activity/session', async (req, res) => {
    const userId = typeof req.body.userId === 'string' ? req.body.userId.trim() : '';
    const userTag = typeof req.body.userTag === 'string' ? req.body.userTag.trim() : '';
    const channelId = typeof req.body.channelId === 'string' ? req.body.channelId.trim() : '';
    const guildId = typeof req.body.guildId === 'string' ? req.body.guildId.trim() : '';

    if (!userId || !userTag || !channelId) {
      return res.status(400).json({ ok: false, error: 'Missing activity session fields' });
    }

    const session = createSession({
      userId,
      userTag,
      channelId,
      guildId,
      baseUrl: process.env.PUBLIC_BASE_URL || ''
    });

    res.json({
      ok: true,
      session: publicSession(session)
    });
  });

  app.get('/api/mochi/session/:id', async (req, res) => {
    const session = getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ ok: false, error: 'Session not found or expired' });
    }

    return res.json({
      ok: true,
      session: publicSession(session),
      profile: await getProfile(session.userId)
    });
  });

  app.get('/api/mochi/session/:id/profile', handleProfileRead);
  app.post('/api/mochi/session/:id/profile', handleProfileWrite);
  app.post('/api/mochi/session/:id/score', async (req, res) => {
    return handleScoreSubmission(req, res, onScoreSubmitted);
  });

  app.get('/api/mochi/leaderboard', async (_req, res) => {
    res.json({
      ok: true,
      leaderboard: await getLeaderboard(10),
      recentRuns: await getRecentRuns(8)
    });
  });

  app.get('/api/mochi/leaderboard/:userId', async (req, res) => {
    const entry = await getPersonalBest(req.params.userId);
    if (!entry) {
      return res.status(404).json({ ok: false, error: 'No score yet' });
    }
    res.json({ ok: true, entry });
  });

  // Legacy aliases for older clients and local testing.
  app.post('/api/activity/session', async (req, res) => {
    const userId = typeof req.body.userId === 'string' ? req.body.userId.trim() : '';
    const userTag = typeof req.body.userTag === 'string' ? req.body.userTag.trim() : '';
    const channelId = typeof req.body.channelId === 'string' ? req.body.channelId.trim() : '';
    const guildId = typeof req.body.guildId === 'string' ? req.body.guildId.trim() : '';

    if (!userId || !userTag || !channelId) {
      return res.status(400).json({ ok: false, error: 'Missing activity session fields' });
    }

    const session = createSession({
      userId,
      userTag,
      channelId,
      guildId,
      baseUrl: process.env.PUBLIC_BASE_URL || ''
    });

    res.json({
      ok: true,
      session: publicSession(session)
    });
  });

  app.get('/api/session/:id', async (req, res) => {
    const session = getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ ok: false, error: 'Session not found or expired' });
    }

    return res.json({
      ok: true,
      session: publicSession(session),
      profile: await getProfile(session.userId)
    });
  });

  app.post('/api/session/:id/score', async (req, res) => {
    return handleScoreSubmission(req, res, onScoreSubmitted);
  });

  app.get('/api/leaderboard', async (_req, res) => {
    res.json({
      ok: true,
      leaderboard: await getLeaderboard(10),
      recentRuns: await getRecentRuns(8)
    });
  });

  app.get('/api/leaderboard/:userId', async (req, res) => {
    const entry = await getPersonalBest(req.params.userId);
    if (!entry) {
      return res.status(404).json({ ok: false, error: 'No score yet' });
    }
    res.json({ ok: true, entry });
  });

  return app;
}
