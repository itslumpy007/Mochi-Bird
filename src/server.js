import express from 'express';
import path    from 'node:path';
import { fileURLToPath } from 'node:url';
import { completeSession, createSession, getSession, publicSession } from './state.js';
import { getLeaderboard, getPersonalBest, recordScore }              from './leaderboard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

function parseScore(v) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function createServer({ onScoreSubmitted } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());
  app.use(express.static(publicDir, { extensions: ['html'] }));

  // Serve index.html for /play (session link)
  app.get('/play', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));

  // Health
  app.get('/api/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

  // Config (lets the client know about activity mode)
  app.get('/api/config', (_req, res) => res.json({
    ok:              true,
    activityMode:    process.env.DISCORD_ACTIVITY_MODE === 'true',
    discordClientId: process.env.DISCORD_CLIENT_ID || null,
  }));

  // Get session
  app.get('/api/session/:id', (req, res) => {
    const s = getSession(req.params.id);
    if (!s) return res.status(404).json({ ok: false, error: 'Session not found or expired' });
    return res.json({ ok: true, session: publicSession(s) });
  });

  // Submit score
  app.post('/api/session/:id/score', async (req, res) => {
    const s = getSession(req.params.id);
    if (!s)                       return res.status(404).json({ ok: false, error: 'Session not found or expired' });
    if (s.status === 'completed') return res.status(409).json({ ok: false, error: 'Score already submitted' });

    const score = parseScore(req.body.score);
    if (score === null) return res.status(400).json({ ok: false, error: 'Invalid score' });

    const durationMs = Number(req.body.durationMs) || 0;
    const reason     = typeof req.body.reason === 'string' ? req.body.reason : 'game_over';

    const completed    = completeSession(req.params.id, { score, durationMs, reason });
    const personalBest = await recordScore({ userId: completed.userId, userTag: completed.userTag, score });
    const leaderboard  = await getLeaderboard(10);

    if (typeof onScoreSubmitted === 'function') {
      await onScoreSubmitted({ session: completed, score, durationMs, reason, personalBest, leaderboard }).catch(
        err => console.warn('onScoreSubmitted error:', err.message)
      );
    }

    return res.json({ ok: true, session: publicSession(completed), personalBest, leaderboard });
  });

  // Leaderboard
  app.get('/api/leaderboard', async (_req, res) => {
    const leaderboard = await getLeaderboard(10);
    res.json({ ok: true, leaderboard });
  });

  // Personal best
  app.get('/api/leaderboard/:userId', async (req, res) => {
    const entry = await getPersonalBest(req.params.userId);
    if (!entry) return res.status(404).json({ ok: false, error: 'No score yet' });
    res.json({ ok: true, entry });
  });

  return app;
}
