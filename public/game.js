// ── DOM ───────────────────────────────────────────────────────────────────────
const canvas      = document.getElementById('game');
const ctx         = canvas.getContext('2d');
const scoreEl     = document.getElementById('score');
const bestScoreEl = document.getElementById('bestScore');
const statusEl    = document.getElementById('status');
const overlayEl   = document.getElementById('overlay');
const titleEl     = document.getElementById('overlayTitle');
const textEl      = document.getElementById('overlayText');
const startBtn    = document.getElementById('startBtn');
const stageEl     = document.getElementById('stage');
const lbStatusEl  = document.getElementById('lbStatus');
const lbListEl    = document.getElementById('lbList');
const refreshBtn  = document.getElementById('refreshBtn');

// ── Constants ──────────────────────────────────────────────────────────────────
const GRAVITY       = 1100;
const FLAP_VEL      = -340;
const PIPE_SPEED    = 170;
const PIPE_W        = 72;
const PIPE_GAP      = 166;
const PIPE_INTERVAL = 1.35;
const GROUND_H      = 90;

// ── Canvas ─────────────────────────────────────────────────────────────────────
let W = 360, H = 640, DPR = 1;
function resize() {
  const rect = canvas.getBoundingClientRect();
  W   = Math.max(1, rect.width);
  H   = Math.max(1, rect.height);
  DPR = Math.max(1, window.devicePixelRatio || 1);
  canvas.width  = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}

function applyLayout() {
  const wide = window.innerWidth >= 700;
  document.body.classList.toggle('desktop', wide);
  document.body.classList.toggle('mobile',  !wide);
}

// ── Game state (single source of truth) ──────────────────────────────────────
// Explicit states: 'loading' | 'ready' | 'playing' | 'dead' | 'error'
let gameState = 'loading';

let bird = { x: 100, y: 270, r: 14, vy: 0 };
let pipes = [];
let clouds = [];
let stars = [];
let bgOffset = 0, spawnTimer = 0, elapsedMs = 0, score = 0, bestScore = 0;

let sessionId = new URLSearchParams(location.search).get('sid');
let isPractice = !sessionId;
let sessionData = null;
let lbEntries = [];
let bestScoreKey = 'mochi-bird-best-practice';

const sprite = new Image();
sprite.src = '/assets/avatar.png';

// ── State machine ──────────────────────────────────────────────────────────────
function setGameState(state) {
  console.log(`[state] ${gameState} → ${state}`);
  gameState = state;
  updateUI();
}

function updateUI() {
  switch (gameState) {
    case 'loading':
      showOverlay('Mochi Bird', 'Loading…');
      startBtn.disabled = true;
      break;

    case 'ready':
      if (isPractice) {
        showOverlay('Practice Mode', 'Click or press Space to start!', 'Play');
        statusEl.textContent = 'Practice mode';
      } else {
        showOverlay('Ready', `Playing as ${sessionData?.userTag || 'guest'}`, 'Play');
        statusEl.textContent = `Ready — ${sessionData?.userTag || 'guest'}`;
      }
      startBtn.disabled = false;
      break;

    case 'playing':
      hideOverlay();
      statusEl.textContent = isPractice ? 'Playing' : 'Session running';
      startBtn.disabled = true;
      break;

    case 'dead':
      const plural = score === 1 ? 'point' : 'points';
      showOverlay('Game Over', `You scored ${score} ${plural}`, 'Play Again');
      statusEl.textContent = `Game over — scored ${score}`;
      startBtn.disabled = false;
      break;

    case 'error':
      showOverlay('Error', 'Session expired. Reload to try again.', 'Reload');
      startBtn.disabled = false;
      break;
  }
}

// ── Button handler (simple and explicit) ───────────────────────────────────────
startBtn.addEventListener('click', () => {
  if (gameState === 'error') {
    location.reload();
    return;
  }

  if (gameState === 'dead') {
    // Reset and go back to ready
    resetGame();
    setGameState('ready');
    return;
  }

  if (gameState === 'ready') {
    // Start playing
    setGameState('playing');
    return;
  }
});

// ── Overlay helpers ────────────────────────────────────────────────────────────
function showOverlay(title, text, btnLabel = 'Start') {
  titleEl.textContent = title;
  textEl.textContent = text;
  startBtn.textContent = btnLabel;
  overlayEl.classList.remove('hidden');
}

function hideOverlay() {
  overlayEl.classList.add('hidden');
}

// ── Leaderboard ────────────────────────────────────────────────────────────────
function renderLeaderboard(entries) {
  lbEntries = Array.isArray(entries) ? entries : [];
  lbListEl.innerHTML = '';

  if (!lbEntries.length) {
    lbStatusEl.textContent = 'No scores yet';
    const li = document.createElement('li');
    li.className = 'lb-item';
    li.innerHTML = `<span class="lb-rank">-</span><span class="lb-name">Waiting for scores</span><span class="lb-score">0</span>`;
    lbListEl.appendChild(li);
    return;
  }

  lbStatusEl.textContent = `${lbEntries.length} player${lbEntries.length === 1 ? '' : 's'}`;
  lbEntries.forEach((e, i) => {
    const li = document.createElement('li');
    li.className = 'lb-item' + (sessionData?.userId === e.userId ? ' me' : '');
    li.innerHTML = `
      <span class="lb-rank">${i + 1}</span>
      <span class="lb-name">${e.userTag || e.userId || 'Unknown'}</span>
      <span class="lb-score">${Number(e.bestScore) || 0}</span>
    `;
    lbListEl.appendChild(li);
  });
}

async function fetchLeaderboard() {
  try {
    const res = await fetch('/api/leaderboard');
    const data = await res.json();
    renderLeaderboard(data.leaderboard ?? []);
  } catch (err) {
    lbStatusEl.textContent = 'Could not load leaderboard';
  }
}

// ── Game logic ─────────────────────────────────────────────────────────────────
function resetGame() {
  score = 0;
  elapsedMs = 0;
  bgOffset = 0;
  spawnTimer = 0.65;
  pipes = [];

  bird.x = W * 0.28;
  bird.y = H * 0.42;
  bird.vy = 0;

  stars = Array.from({ length: 28 }, (_, i) => ({
    x: (i * 97) % W,
    y: (i * 71) % (H * 0.45),
    r: 0.8 + (i % 3) * 0.5,
    twinkle: 0.3 + (i % 5) * 0.11,
  }));

  clouds = Array.from({ length: 5 }, (_, i) => ({
    x: W * (0.2 + i * 0.22),
    y: H * (0.12 + (i % 2) * 0.08),
    speed: 8 + i * 2,
    size: 0.8 + i * 0.16,
  }));

  scoreEl.textContent = '0';
  bestScore = Number(localStorage.getItem(bestScoreKey) || 0);
  bestScoreEl.textContent = String(bestScore);
}

function addPipe() {
  const topH = 60 + Math.random() * (H - GROUND_H - PIPE_GAP - 140);
  pipes.push({ x: W + 30, topH, passed: false });
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function birdBox() {
  return { x: bird.x - bird.r, y: bird.y - bird.r, w: bird.r * 2, h: bird.r * 2 };
}

async function submitScore() {
  if (isPractice || !sessionId) return;

  try {
    const res = await fetch(`/api/session/${sessionId}/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score, durationMs: Math.round(elapsedMs), reason: 'hit_obstacle' }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const pb = data.personalBest?.bestScore ?? score;
    bestScore = Math.max(bestScore, pb);
    localStorage.setItem(bestScoreKey, String(bestScore));
    bestScoreEl.textContent = String(bestScore);
    fetchLeaderboard();
  } catch (err) {
    console.error('Score submit failed:', err);
  }
}

function update(dt) {
  if (gameState !== 'playing') return;

  elapsedMs += dt * 1000;
  bird.vy += GRAVITY * dt;
  bird.y += bird.vy * dt;
  bgOffset = (bgOffset + PIPE_SPEED * dt) % W;

  // Ceiling
  if (bird.y - bird.r <= 0) {
    bird.y = bird.r;
    bird.vy = Math.max(0, bird.vy);
  }

  // Ground
  if (bird.y + bird.r >= H - GROUND_H) {
    setGameState('dead');
    submitScore();
    if (score > bestScore) {
      bestScore = score;
      bestScoreEl.textContent = String(bestScore);
      localStorage.setItem(bestScoreKey, String(bestScore));
    }
    return;
  }

  // Pipes
  spawnTimer -= dt;
  if (spawnTimer <= 0) { addPipe(); spawnTimer = PIPE_INTERVAL; }

  const bb = birdBox();
  for (const p of pipes) {
    p.x -= PIPE_SPEED * dt;

    const top = { x: p.x, y: 0, w: PIPE_W, h: p.topH };
    const bottom = { x: p.x, y: p.topH + PIPE_GAP, w: PIPE_W, h: H - GROUND_H - (p.topH + PIPE_GAP) };

    if (rectsOverlap(bb, top) || rectsOverlap(bb, bottom)) {
      setGameState('dead');
      submitScore();
      if (score > bestScore) {
        bestScore = score;
        bestScoreEl.textContent = String(bestScore);
        localStorage.setItem(bestScoreKey, String(bestScore));
      }
      return;
    }

    if (!p.passed && p.x + PIPE_W < bird.x - bird.r) {
      p.passed = true;
      score++;
      scoreEl.textContent = String(score);
      if (score > bestScore) {
        bestScore = score;
        bestScoreEl.textContent = String(bestScore);
        localStorage.setItem(bestScoreKey, String(bestScore));
      }
    }
  }

  pipes = pipes.filter(p => p.x > -PIPE_W - 40);
}

// ── Input ──────────────────────────────────────────────────────────────────────
window.addEventListener('keydown', (e) => {
  if ((e.code === 'Space' || e.code === 'ArrowUp') && gameState === 'playing') {
    e.preventDefault();
    bird.vy = FLAP_VEL;
  }
});

stageEl.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (gameState === 'playing') bird.vy = FLAP_VEL;
});

stageEl.addEventListener('touchstart', (e) => {
  e.preventDefault();
  if (gameState === 'playing') bird.vy = FLAP_VEL;
}, { passive: false });

refreshBtn.addEventListener('click', () => fetchLeaderboard());

// Auto-refresh leaderboard every 15 seconds
setInterval(() => fetchLeaderboard(), 15000);

window.addEventListener('resize', () => { applyLayout(); resize(); });

// ── Drawing ────────────────────────────────────────────────────────────────────
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function drawSky() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#78cffd');
  g.addColorStop(0.6, '#beeefe');
  g.addColorStop(1, '#ffe28a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  for (const s of stars) {
    const alpha = 0.3 + Math.sin((elapsedMs / 1000) * s.twinkle + s.x) * 0.2;
    ctx.globalAlpha = clamp(alpha, 0.1, 0.45);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawClouds() {
  for (const c of clouds) {
    if (gameState === 'playing') {
      c.x -= c.speed * 0.008;
      if (c.x < -120) {
        c.x = W + 120;
        c.y = H * (0.12 + Math.random() * 0.18);
      }
    }
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.scale(c.size, c.size);
    ctx.fillStyle = 'rgba(255,255,255,.66)';
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.arc(18, -8, 22, 0, Math.PI * 2);
    ctx.arc(38, 0, 16, 0, Math.PI * 2);
    ctx.arc(20, 8, 19, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawPipes() {
  for (const p of pipes) {
    const botY = p.topH + PIPE_GAP;
    const botH = H - GROUND_H - botY;

    ctx.fillStyle = '#1d7f52';
    roundRect(p.x, 0, PIPE_W, p.topH, 10);
    ctx.fill();

    ctx.fillStyle = '#2fd18d';
    roundRect(p.x - 4, Math.max(0, p.topH - 16), PIPE_W + 8, 16, 6);
    ctx.fill();

    ctx.fillStyle = '#1d7f52';
    roundRect(p.x, botY, PIPE_W, botH, 10);
    ctx.fill();

    ctx.fillStyle = '#2fd18d';
    roundRect(p.x - 4, botY, PIPE_W + 8, 16, 6);
    ctx.fill();
  }
}

function drawGround() {
  const y = H - GROUND_H;
  const g = ctx.createLinearGradient(0, y, 0, H);
  g.addColorStop(0, '#e6c265');
  g.addColorStop(1, '#c69a3a');
  ctx.fillStyle = g;
  ctx.fillRect(0, y, W, GROUND_H);

  ctx.fillStyle = 'rgba(0,0,0,.13)';
  for (let i = -1; i < W / 36 + 2; i++) {
    const x = ((i * 36) - bgOffset * 0.6 % (W + 36));
    ctx.fillRect(x, y + 8, 22, 4);
  }
}

function drawBird() {
  const tilt = clamp(bird.vy / 400, -0.6, 0.8);
  ctx.save();
  ctx.translate(bird.x, bird.y);
  ctx.rotate(tilt);

  // Base circle
  ctx.fillStyle = '#ffd84d';
  ctx.beginPath();
  ctx.arc(0, 0, bird.r, 0, Math.PI * 2);
  ctx.fill();

  // Wing
  ctx.fillStyle = '#ffb31f';
  ctx.beginPath();
  ctx.ellipse(-3, 4, 9, 6, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // Eye
  ctx.fillStyle = '#1a2230';
  ctx.beginPath();
  ctx.arc(5, -4, 2.1, 0, Math.PI * 2);
  ctx.fill();

  // Beak
  ctx.fillStyle = '#f27d2f';
  ctx.beginPath();
  ctx.moveTo(11, -1);
  ctx.lineTo(20, 3);
  ctx.lineTo(11, 7);
  ctx.closePath();
  ctx.fill();

  // Sprite on top
  if (sprite.complete && sprite.naturalWidth > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, bird.r, 0, Math.PI * 2);
    ctx.clip();
    const s = bird.r * 2;
    ctx.drawImage(sprite, -bird.r, -bird.r, s, s);
    ctx.restore();
  }

  ctx.restore();
}

function drawDim() {
  if (gameState === 'playing') return;
  ctx.fillStyle = 'rgba(7,16,24,.10)';
  ctx.fillRect(0, 0, W, H);
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

let lastTs = 0;
function loop(ts) {
  const dt = Math.min(0.033, lastTs ? (ts - lastTs) / 1000 : 0);
  lastTs = ts;

  update(dt);

  ctx.clearRect(0, 0, W, H);
  drawSky();
  drawClouds();
  drawPipes();
  drawGround();
  drawBird();
  drawDim();

  requestAnimationFrame(loop);
}

// ── Discord Activity support ──────────────────────────────────────────────────
let discordSdk = null;

async function tryInitDiscordActivity() {
  try {
    console.log('[activity] Attempting Discord Activity initialization...');

    // Check if we're in a Discord iframe (iframe detection)
    if (window.self === window.top) {
      console.log('[activity] Not in iframe, skipping Discord Activity');
      return false;
    }

    // Load Discord SDK with timeout
    console.log('[activity] Loading Discord SDK...');
    const sdkModule = await Promise.race([
      import('https://cdn.jsdelivr.net/npm/@discord/embedded-app-sdk/+esm'),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('SDK load timeout')), 5000)
      ),
    ]);

    // Get config
    const configRes = await fetch('/api/config');
    const config = await configRes.json();
    const clientId = config.discordClientId;

    if (!clientId) {
      console.log('[activity] No Discord client ID configured');
      return false;
    }

    console.log('[activity] Initializing Discord SDK...');
    discordSdk = new sdkModule.DiscordSDK(clientId);
    await Promise.race([
      discordSdk.ready(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('SDK ready timeout')), 5000)
      ),
    ]);

    console.log('[activity] Getting activity participants...');
    const participants = await discordSdk.commands.getInstanceConnectedParticipants();
    const participant = participants?.[0];

    if (!participant?.user?.id) {
      throw new Error(`No participant found (got: ${JSON.stringify(participants)})`);
    }

    console.log('[activity] Getting channel info...');
    const channel = await discordSdk.commands.getChannel({
      channel_id: discordSdk.channelId,
    });

    console.log('[activity] Creating activity session...');
    const res = await fetch('/api/activity/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: participant.user.id,
        userTag: participant.user.username || participant.user.global_name || 'Player',
        channelId: discordSdk.channelId,
        guildId: channel?.guild_id || '',
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(`Session creation failed: ${data.error}`);
    }

    sessionId = data.session.id;
    sessionData = data.session;
    isPractice = false;
    bestScoreKey = `mochi-bird-best-${sessionData.userId}`;

    console.log('[activity] Discord Activity initialized successfully');
    return true;
  } catch (err) {
    console.warn('[activity] Discord Activity initialization failed:', err.message);
    return false;
  }
}

async function loadSession() {
  resetGame();

  // Try Discord Activity first (with 10 second timeout to prevent hanging)
  console.log('[boot] Starting session load...');
  const isActivity = await Promise.race([
    tryInitDiscordActivity(),
    new Promise(resolve => setTimeout(() => { console.warn('[boot] Activity init timeout'); resolve(false); }, 10000)),
  ]);

  if (!sessionId) {
    // Practice mode
    bestScoreKey = 'mochi-bird-best-practice';
    setGameState('ready');
    fetchLeaderboard();
    return;
  }

  // Load existing session
  try {
    const res = await fetch(`/api/session/${sessionId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    sessionData = data.session;
    bestScoreKey = `mochi-bird-best-${sessionData.userId}`;

    try {
      const pbRes = await fetch(`/api/leaderboard/${sessionData.userId}`);
      const pbData = await pbRes.json();
      if (pbRes.ok && pbData.entry?.bestScore) {
        bestScore = Number(pbData.entry.bestScore) || 0;
        localStorage.setItem(bestScoreKey, String(bestScore));
        bestScoreEl.textContent = String(bestScore);
      }
    } catch {}

    setGameState('ready');
    fetchLeaderboard();
  } catch (err) {
    console.error('Session error:', err);
    setGameState('error');
  }
}

// ── Boot ───────────────────────────────────────────────────────────────────────
applyLayout();
resize();
requestAnimationFrame(loop);
loadSession();
