import express from 'express';
import path    from 'node:path';
import { fileURLToPath } from 'node:url';
import { completeSession, createSession, getSession, publicSession, getSessionByToken, getLatestSessionForUser, getPendingActivitySession } from './state.js';
import { getLeaderboard, getTodayLeaderboard, getPersonalBest, recordScore, getPlayerRank, getPlayerSkins, savePlayerSkins } from './leaderboard.js';
import { getPlayerProfile, savePlayerProfile } from './profile.js';
import { createRace, getRace, claimRaceSession, recordRaceScore, sanitizeRace } from './race.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

function parseScore(v) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function validateScoreSubmission(session, score) {
  const now = Date.now();
  const elapsedMs = Math.max(0, now - Number(session.createdAt || now));
  const elapsedSeconds = elapsedMs / 1000;
  const maxAllowedScore = Math.max(5, Math.floor(elapsedSeconds / 0.9) + 5);
  if (score > maxAllowedScore) {
    return {
      ok: false,
      error: 'Score exceeds what the session time allows',
      maxAllowedScore,
      elapsedMs,
    };
  }
  return {
    ok: true,
    elapsedMs,
    maxAllowedScore,
  };
}

export function createServer({ onScoreSubmitted, onShare } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  // Prevent caching of game files (Discord Activity proxy caches aggressively)
  app.use((req, res, next) => {
    if (req.path.match(/\.(js|html|css)$/)) {
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
    }
    next();
  });

  app.use(express.static(publicDir, { extensions: ['html'] }));

  // Serve index.html for /play (session link)
  app.get('/play', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));

  // Serve game.js under a version alias to bypass caching
  app.get('/game-v2.js', (_req, res) => res.sendFile(path.join(publicDir, 'game.js')));

  // Health
  app.get('/api/health', (_req, res) => res.json({ ok: true, uptime: process.uptime(), version: '2026-05-30-fc0e622' }));

  // Debug: Log request headers (to see if Discord sends user info)
  app.get('/api/debug-headers', (req, res) => {
    console.log('[DEBUG] Activity request headers:', req.headers);
    res.json({
      ok: true,
      headers: req.headers,
      cookies: req.headers.cookie || 'none',
    });
  });

  // Config (lets the client know about activity mode)
  app.get('/api/config', (_req, res) => res.json({
    ok:              true,
    activityMode:    process.env.DISCORD_ACTIVITY_MODE === 'true',
    discordClientId: process.env.DISCORD_CLIENT_ID || null,
  }));

  // Get session by ID
  app.get('/api/session/:id', (req, res) => {
    const s = getSession(req.params.id);
    if (!s) return res.status(404).json({ ok: false, error: 'Session not found or expired' });
    return res.json({ ok: true, session: publicSession(s) });
  });

  // Get session by token (for Discord Activity)
  app.get('/api/session-by-token/:token', (req, res) => {
    const s = getSessionByToken(req.params.token);
    if (!s) return res.status(404).json({ ok: false, error: 'Token invalid or expired' });
    return res.json({ ok: true, session: publicSession(s) });
  });

  // Get current user's latest session (for Discord Activity when userId is available)
  app.get('/api/session/current/:userId', (req, res) => {
    const s = getLatestSessionForUser(req.params.userId);
    if (!s) return res.status(404).json({ ok: false, error: 'No active session for user' });
    return res.json({ ok: true, session: publicSession(s) });
  });

  // Get pending Activity session (auto-link for Activities launched directly)
  // Returns the most recently created session if still within 5-minute window
  app.get('/api/session/pending-activity', (req, res) => {
    const s = getPendingActivitySession();
    const result = s ? `Found session for ${s.userTag}` : 'No pending session';
    console.log('[api] /session/pending-activity called, result:', result);

    if (!s) {
      return res.status(404).json({
        ok: false,
        error: 'No pending activity session',
        debug: { hasPendingSession: !!s, timestamp: new Date().toISOString() }
      });
    }
    return res.json({ ok: true, session: publicSession(s) });
  });

  // Submit score
  app.post('/api/session/:id/score', async (req, res) => {
    const s = getSession(req.params.id);
    if (!s)                       return res.status(404).json({ ok: false, error: 'Session not found or expired' });

    // Allow resubmission only if the new score is higher than the existing score
    if (s.status === 'completed' && (req.body.score === null || Number(req.body.score) <= s.score)) {
      return res.status(409).json({ ok: false, error: 'Score already submitted' });
    }

    const score = parseScore(req.body.score);
    if (score === null) return res.status(400).json({ ok: false, error: 'Invalid score' });

    const reason     = typeof req.body.reason === 'string' ? req.body.reason : 'game_over';
    const verification = validateScoreSubmission(s, score);
    if (!verification.ok) {
      console.warn(`[anti-cheat] Rejected score ${score} for ${s.userTag}: ${verification.error} (max ${verification.maxAllowedScore}, elapsed ${verification.elapsedMs}ms)`);
      return res.status(422).json({
        ok: false,
        error: verification.error,
        maxAllowedScore: verification.maxAllowedScore,
        elapsedMs: verification.elapsedMs,
      });
    }

    const durationMs = verification.elapsedMs;
    const completed    = completeSession(req.params.id, { score, durationMs, reason });
    const personalBest = await recordScore({ userId: completed.userId, userTag: completed.userTag, avatarHash: completed.avatarHash, score });
    const leaderboard  = await getLeaderboard(10);
    const profile      = req.body.profile && typeof req.body.profile === 'object'
      ? await savePlayerProfile({
          userId: completed.userId,
          userTag: completed.userTag,
          avatarHash: completed.avatarHash,
          profile: req.body.profile,
        })
      : await getPlayerProfile(completed.userId, { userTag: completed.userTag, avatarHash: completed.avatarHash });
    const race = s.raceId
      ? await recordRaceScore({
          raceId: s.raceId,
          userId: completed.userId,
          userTag: completed.userTag,
          avatarHash: completed.avatarHash,
          sessionId: completed.id,
          score,
        })
      : null;

    if (typeof onScoreSubmitted === 'function') {
      await onScoreSubmitted({ session: completed, score, durationMs, reason, personalBest, leaderboard, profile }).catch(
        err => console.warn('onScoreSubmitted error:', err.message)
      );
    }

    return res.json({ ok: true, session: publicSession(completed), personalBest, leaderboard, profile, race });
  });

  // Create a race challenge from an active session
  app.post('/api/session/:id/challenge', async (req, res) => {
    const s = getSession(req.params.id);
    if (!s) return res.status(404).json({ ok: false, error: 'Session not found or expired' });

    const targetScore = Number.isFinite(Number(req.body?.targetScore))
      ? Math.max(0, Math.floor(Number(req.body.targetScore)))
      : Math.max(0, Math.floor(Number(req.body?.score) || 0));
    if (targetScore <= 0) return res.status(400).json({ ok: false, error: 'Invalid target score' });

    const race = await createRace({
      creatorUserId: s.userId,
      creatorUserTag: s.userTag,
      creatorAvatarHash: s.avatarHash,
      targetScore,
      baseSessionId: s.id,
      baseSessionUserTag: s.userTag,
      challengeMessage: typeof req.body?.challengeMessage === 'string' ? req.body.challengeMessage : '',
    });

    return res.json({
      ok: true,
      race: race ? {
        id: race.id,
        targetScore: race.targetScore,
        creatorUserTag: race.creatorUserTag,
        challengeMessage: race.challengeMessage,
      } : null,
      raceUrl: `${s.baseUrl || req.body?.baseUrl || ''}/play?race=${race.id}`,
    });
  });

  // Share score to Discord channel
  app.post('/api/session/:id/share', async (req, res) => {
    const s = getSession(req.params.id);
    if (!s) return res.status(404).json({ ok: false, error: 'Session not found' });
    const score = parseScore(req.body.score);
    if (score === null) return res.status(400).json({ ok: false, error: 'Invalid score' });
    if (typeof onShare === 'function') await onShare({ session: s, score }).catch(() => {});
    res.json({ ok: true });
  });

  // Race lookup
  app.get('/api/race/:id', async (req, res) => {
    const race = await getRace(req.params.id);
    if (!race) return res.status(404).json({ ok: false, error: 'Race not found' });
    const viewerUserId = typeof req.query.userId === 'string' ? req.query.userId : null;
    res.json({ ok: true, race: sanitizeRace(race, viewerUserId) });
  });

  // Claim a race session for the current user
  app.post('/api/race/:id/claim', async (req, res) => {
    const race = await getRace(req.params.id);
    if (!race) return res.status(404).json({ ok: false, error: 'Race not found' });

    const userId = typeof req.body?.userId === 'string' ? req.body.userId : '';
    const userTag = typeof req.body?.userTag === 'string' ? req.body.userTag : '';
    if (!userId || !userTag) {
      return res.status(400).json({ ok: false, error: 'Missing user identity' });
    }

    const claimed = await claimRaceSession(req.params.id, {
      userId,
      userTag,
      avatarHash: typeof req.body?.avatarHash === 'string' ? req.body.avatarHash : null,
      channelId: typeof req.body?.channelId === 'string' ? req.body.channelId : '',
      guildId: typeof req.body?.guildId === 'string' ? req.body.guildId : '',
      baseUrl: typeof req.body?.baseUrl === 'string' ? req.body.baseUrl : '',
    });

    if (!claimed) return res.status(404).json({ ok: false, error: 'Race not found' });
    return res.json({
      ok: true,
      race: claimed.race,
      session: claimed.session,
    });
  });

  // Get player profile
  app.get('/api/session/:id/profile', async (req, res) => {
    const s = getSession(req.params.id);
    if (!s) return res.status(404).json({ ok: false, error: 'Session not found' });
    const profile = await getPlayerProfile(s.userId, { userTag: s.userTag, avatarHash: s.avatarHash });
    res.json({ ok: true, profile });
  });

  // Save player profile
  app.post('/api/session/:id/profile', async (req, res) => {
    const s = getSession(req.params.id);
    if (!s) return res.status(404).json({ ok: false, error: 'Session not found' });
    const profile = await savePlayerProfile({
      userId: s.userId,
      userTag: s.userTag,
      avatarHash: s.avatarHash,
      profile: req.body?.profile && typeof req.body.profile === 'object' ? req.body.profile : req.body,
    });
    res.json({ ok: true, profile });
  });

  // Today's leaderboard (must be BEFORE /api/leaderboard/:userId to avoid conflict)
  app.get('/api/leaderboard/today', async (_req, res) => {
    const leaderboard = await getTodayLeaderboard(10);
    res.json({ ok: true, leaderboard });
  });

  // Leaderboard
  app.get('/api/leaderboard', async (_req, res) => {
    const leaderboard = await getLeaderboard(10);
    res.json({ ok: true, leaderboard });
  });

  // Personal best + rank
  app.get('/api/leaderboard/:userId', async (req, res) => {
    const [entry, rank] = await Promise.all([
      getPersonalBest(req.params.userId),
      getPlayerRank(req.params.userId),
    ]);
    if (!entry) return res.status(404).json({ ok: false, error: 'No score yet' });
    res.json({ ok: true, entry, rank });
  });

  // Player skins — GET
  app.get('/api/session/:id/skins', async (req, res) => {
    const s = getSession(req.params.id);
    if (!s) return res.status(404).json({ ok: false, error: 'Session not found' });
    const skins = await getPlayerSkins(s.userId);
    res.json({ ok: true, ...skins });
  });

  // Player skins — POST
  app.post('/api/session/:id/skins', async (req, res) => {
    const s = getSession(req.params.id);
    if (!s) return res.status(404).json({ ok: false, error: 'Session not found' });
    const { ownedSkins, equippedSkin } = req.body;
    await savePlayerSkins({ userId: s.userId, ownedSkins, equippedSkin });
    res.json({ ok: true });
  });

  return app;
}
