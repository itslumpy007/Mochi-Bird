import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { completeSession, createSession, getSession, publicSession } from './state.js';
import { getLeaderboard, getPersonalBest, recordScore } from './leaderboard.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');

function parseScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score) || score < 0) {
    return null;
  }
  return Math.floor(score);
}

export function createServer({ onScoreSubmitted } = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(express.static(publicDir, { extensions: ['html'] }));

  app.get('/', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  app.get('/play', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, uptime: process.uptime() });
  });

  app.get('/api/config', (_req, res) => {
    res.json({
      ok: true,
      activityMode: process.env.DISCORD_ACTIVITY_MODE === 'true',
      discordClientId: process.env.DISCORD_CLIENT_ID || null
    });
  });

  app.get('/api/session/:id', (req, res) => {
    const session = getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ ok: false, error: 'Session not found or expired' });
    }

    return res.json({
      ok: true,
      session: publicSession(session)
    });
  });

  app.post('/api/session/:id/score', async (req, res) => {
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
    const leaderboard = await getLeaderboard(10);

    if (typeof onScoreSubmitted === 'function') {
      await onScoreSubmitted({
        session: completedSession,
        score,
        durationMs,
        reason,
        personalBest,
        leaderboard
      });
    }

    return res.json({
      ok: true,
      session: publicSession(completedSession),
      personalBest,
      leaderboard
    });
  });

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

  app.get('/api/leaderboard', async (_req, res) => {
    const leaderboard = await getLeaderboard(10);
    res.json({ ok: true, leaderboard });
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
