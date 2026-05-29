// ── DOM refs ──────────────────────────────────────────────────────────────────
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

// ── Game constants ─────────────────────────────────────────────────────────────
const GRAVITY       = 1100;
const FLAP_VEL      = -340;
const PIPE_SPEED    = 170;
const PIPE_W        = 72;
const PIPE_GAP      = 166;
const PIPE_INTERVAL = 1.35;
const GROUND_H      = 90;

// ── State ──────────────────────────────────────────────────────────────────────
let W = 360, H = 640, DPR = 1;

// Bird is always a valid object — never null
let bird = { x: 100, y: 270, r: 14, vy: 0 };

let pipes        = [];
let clouds       = [];
let stars        = [];
let bgOffset     = 0;
let spawnTimer   = 0;
let elapsedMs    = 0;
let score        = 0;
let bestScore    = 0;
let started      = false;
let dead         = false;
let submitted    = false;

// Session / leaderboard
let sessionId      = new URLSearchParams(location.search).get('sid');
let isPractice     = !sessionId;
let sessionData    = null;
let lbEntries      = [];
let bestScoreKey   = 'mochi-bird-best-practice';

// Overlay mode: 'start' | 'dead' | 'reload'
let overlayMode = 'start';

// Bird sprite (custom image)
const sprite = new Image();
sprite.src   = '/assets/avatar.png';

// ── Layout mode (desktop vs mobile/activity) ───────────────────────────────────
function applyLayout() {
  const wide = window.innerWidth >= 700;
  document.body.classList.toggle('desktop', wide);
  document.body.classList.toggle('mobile',  !wide);
}

// ── Canvas sizing ──────────────────────────────────────────────────────────────
function resize() {
  applyLayout();
  // Wait one tick so CSS has applied before reading canvas size
  requestAnimationFrame(() => {
    const rect = canvas.getBoundingClientRect();
    W   = Math.max(1, rect.width);
    H   = Math.max(1, rect.height);
    DPR = Math.max(1, window.devicePixelRatio || 1);
    canvas.width  = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    // Reposition bird after resize
    bird.x = W * 0.28;
    bird.y = H * 0.42;
  });
}

// ── Reset game state ───────────────────────────────────────────────────────────
function resetGame() {
  started    = false;
  dead       = false;
  submitted  = false;
  score      = 0;
  elapsedMs  = 0;
  bgOffset   = 0;
  spawnTimer = 0.65;
  pipes      = [];

  bird.x  = W * 0.28;
  bird.y  = H * 0.42;
  bird.vy = 0;

  stars = Array.from({ length: 28 }, (_, i) => ({
    x: (i * 97)  % W,
    y: (i * 71)  % (H * 0.45),
    r: 0.8 + (i % 3) * 0.5,
    twinkle: 0.3 + (i % 5) * 0.11,
  }));

  clouds = Array.from({ length: 5 }, (_, i) => ({
    x:     W * (0.2 + i * 0.22),
    y:     H * (0.12 + (i % 2) * 0.08),
    speed: 8 + i * 2,
    size:  0.8 + i * 0.16,
  }));

  scoreEl.textContent = '0';
  bestScore = Number(localStorage.getItem(bestScoreKey) || 0);
  bestScoreEl.textContent = String(bestScore);
}

// ── Overlay helpers ────────────────────────────────────────────────────────────
function showOverlay(title, text, btnLabel) {
  titleEl.textContent = title;
  textEl.textContent  = text;
  startBtn.textContent = btnLabel;
  overlayEl.classList.remove('hidden');
}

function hideOverlay() {
  overlayEl.classList.add('hidden');
}

function setStatus(text) {
  statusEl.textContent = text;
}

function enableStart(label = 'Start') {
  startBtn.textContent = label;
  startBtn.disabled    = false;
}

// ── Leaderboard ────────────────────────────────────────────────────────────────
function renderLeaderboard(entries) {
  lbEntries      = Array.isArray(entries) ? entries : [];
  lbListEl.innerHTML = '';

  if (!lbEntries.length) {
    lbStatusEl.textContent = 'No scores yet — be the first!';
    const li = document.createElement('li');
    li.className = 'lb-item';
    li.innerHTML = `<span class="lb-rank">-</span><span class="lb-name">Waiting for scores</span><span class="lb-score">0</span>`;
    lbListEl.appendChild(li);
    return;
  }

  lbStatusEl.textContent = `${lbEntries.length} player${lbEntries.length === 1 ? '' : 's'}`;

  for (const [i, e] of lbEntries.entries()) {
    const li = document.createElement('li');
    li.className = 'lb-item' + (sessionData?.userId === e.userId ? ' me' : '');
    li.innerHTML = `
      <span class="lb-rank">${i + 1}</span>
      <span class="lb-name">${e.userTag || e.userId || 'Unknown'}</span>
      <span class="lb-score">${Number(e.bestScore) || 0}</span>
    `;
    lbListEl.appendChild(li);
  }
}

async function fetchLeaderboard(force = false) {
  if (!force && lbEntries.length) return;
  lbStatusEl.textContent = 'Loading…';
  try {
    const res  = await fetch('/api/leaderboard', { headers: { Accept: 'application/json' } });
    const data = await res.json();
    renderLeaderboard(data.leaderboard ?? []);
  } catch {
    lbStatusEl.textContent = 'Could not load leaderboard.';
  }
}

// ── Score submit ───────────────────────────────────────────────────────────────
async function submitScore(reason) {
  if (isPractice || submitted || !sessionId) return;
  submitted = true;

  try {
    const res  = await fetch(`/api/session/${sessionId}/score`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ score, durationMs: Math.round(elapsedMs), reason }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to submit score');

    const pb = data.personalBest?.bestScore ?? score;
    bestScore = Math.max(bestScore, pb);
    localStorage.setItem(bestScoreKey, String(bestScore));
    bestScoreEl.textContent = String(bestScore);
    setStatus(`Submitted! Personal best: ${pb}`);
    fetchLeaderboard(true);
  } catch (err) {
    setStatus(`Submit failed: ${err.message}`);
  }
}

// ── Session loading ────────────────────────────────────────────────────────────
async function loadSession() {
  // Always reset first so bird and world are ready to render immediately
  resetGame();

  if (isPractice) {
    setStatus('Practice mode');
    showOverlay(
      'Practice mode',
      'Scores aren\'t recorded here. Open a session from Discord to go on the leaderboard.',
      'Play'
    );
    enableStart('Play');
    fetchLeaderboard();
    return;
  }

  setStatus('Loading session…');
  showOverlay('Mochi Bird', 'Loading your session…', 'Start');

  try {
    const res  = await fetch(`/api/session/${sessionId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Session not found');

    sessionData  = data.session;
    bestScoreKey = `mochi-bird-best-${sessionData.userId}`;

    // Load personal best from server
    try {
      const pbRes  = await fetch(`/api/leaderboard/${sessionData.userId}`);
      const pbData = await pbRes.json();
      if (pbRes.ok && pbData.entry?.bestScore !== undefined) {
        bestScore = Number(pbData.entry.bestScore) || 0;
        localStorage.setItem(bestScoreKey, String(bestScore));
        bestScoreEl.textContent = String(bestScore);
      }
    } catch { /* optional */ }

    setStatus(`Ready — ${sessionData.userTag}`);
    showOverlay(
      'Ready to fly',
      `Playing as ${sessionData.userTag}. Your score will be recorded.`,
      'Start'
    );
    enableStart('Start');
    fetchLeaderboard(true);
  } catch (err) {
    setStatus(`Session error: ${err.message}`);
    overlayMode = 'reload';
    showOverlay(
      'Session unavailable',
      'This link has expired. Use /mochi in Discord to get a fresh one.',
      'Reload page'
    );
    enableStart('Reload page');
  }
}

// ── Input ──────────────────────────────────────────────────────────────────────
function flap() {
  if (startBtn.disabled) return;
  if (dead) return;

  if (!started) {
    started = true;
    hideOverlay();
    setStatus(isPractice ? 'Practice — good luck!' : 'Session running');
  }

  bird.vy = FLAP_VEL;
}

startBtn.addEventListener('click', () => {
  if (overlayMode === 'reload') { location.reload(); return; }
  if (dead && isPractice)       { resetGame(); showOverlay('Practice mode', 'Click Play to go again.', 'Play'); enableStart('Play'); return; }
  flap();
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); flap(); }
  if (e.code === 'KeyR' && dead && isPractice)    { resetGame(); showOverlay('Practice mode', 'Click Play to go again.', 'Play'); enableStart('Play'); }
});

stageEl.addEventListener('pointerdown', (e) => { e.preventDefault(); flap(); });
stageEl.addEventListener('touchstart',  (e) => { e.preventDefault(); flap(); }, { passive: false });

refreshBtn.addEventListener('click', () => fetchLeaderboard(true));

window.addEventListener('resize', () => { applyLayout(); resize(); resetGame(); });

// ── Physics ────────────────────────────────────────────────────────────────────
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

function endGame(reason) {
  if (dead) return;
  dead    = true;
  started = false;
  setStatus(`Game over: ${reason}`);

  const msg = isPractice
    ? 'Press R or click below to try again.'
    : 'Your score has been recorded.';

  showOverlay('Game over', `You scored ${score}. ${msg}`, isPractice ? 'Play again' : 'Done');
  startBtn.disabled = isPractice ? false : true;

  submitScore(reason);
  if (score > bestScore) {
    bestScore = score;
    localStorage.setItem(bestScoreKey, String(bestScore));
    bestScoreEl.textContent = String(bestScore);
  }
}

function update(dt) {
  if (!started || dead) return;

  elapsedMs += dt * 1000;
  bird.vy   += GRAVITY * dt;
  bird.y    += bird.vy  * dt;
  bgOffset   = (bgOffset + PIPE_SPEED * dt) % W;

  // Ceiling
  if (bird.y - bird.r <= 0) {
    bird.y  = bird.r;
    bird.vy = Math.max(0, bird.vy);
  }

  // Ground
  if (bird.y + bird.r >= H - GROUND_H) {
    bird.y = H - GROUND_H - bird.r;
    endGame('hit the ground');
    return;
  }

  // Pipes
  spawnTimer -= dt;
  if (spawnTimer <= 0) { addPipe(); spawnTimer = PIPE_INTERVAL; }

  const bb = birdBox();

  for (const p of pipes) {
    p.x -= PIPE_SPEED * dt;

    const top    = { x: p.x, y: 0,            w: PIPE_W, h: p.topH };
    const bottom = { x: p.x, y: p.topH + PIPE_GAP, w: PIPE_W, h: H - GROUND_H - (p.topH + PIPE_GAP) };

    if (rectsOverlap(bb, top) || rectsOverlap(bb, bottom)) {
      endGame('hit a pipe');
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

// ── Drawing helpers ────────────────────────────────────────────────────────────
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

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
}

// ── Draw calls ─────────────────────────────────────────────────────────────────
function drawSky() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0,   '#78cffd');
  g.addColorStop(0.6, '#beeefe');
  g.addColorStop(1,   '#ffe28a');
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
    if (started) {
      c.x -= c.speed * 0.008;
      if (c.x < -120) { c.x = W + 120; c.y = H * (0.12 + Math.random() * 0.18); }
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
    const capH   = 16;
    const botY   = p.topH + PIPE_GAP;
    const botH   = H - GROUND_H - botY;

    // Top pipe body
    ctx.fillStyle = '#1d7f52';
    roundRect(p.x, 0, PIPE_W, p.topH, 10);
    ctx.fill();

    // Top pipe cap
    ctx.fillStyle = '#2fd18d';
    roundRect(p.x - 4, Math.max(0, p.topH - capH), PIPE_W + 8, capH, 6);
    ctx.fill();

    // Bottom pipe body
    ctx.fillStyle = '#1d7f52';
    roundRect(p.x, botY, PIPE_W, botH, 10);
    ctx.fill();

    // Bottom pipe cap
    ctx.fillStyle = '#2fd18d';
    roundRect(p.x - 4, botY, PIPE_W + 8, capH, 6);
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

  // Always draw the base circle so something is always visible
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
  ctx.lineTo(20,  3);
  ctx.lineTo(11,  7);
  ctx.closePath();
  ctx.fill();

  // Custom sprite drawn on top of the base circle (clipped to circle)
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

function drawDimOverlay() {
  if (started || dead) return;
  ctx.fillStyle = 'rgba(7,16,24,.10)';
  ctx.fillRect(0, 0, W, H);
}

// ── Main loop ──────────────────────────────────────────────────────────────────
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
  drawDimOverlay();

  requestAnimationFrame(loop);
}

// ── Boot ───────────────────────────────────────────────────────────────────────
applyLayout();                 // set desktop/mobile class immediately
resize();                      // size the canvas (async tick inside)
requestAnimationFrame(loop);   // start render loop — bird is always a valid object
loadSession();                 // load session & show the right overlay
