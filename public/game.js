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
const canCountEl  = document.getElementById('canCount');
const shopBtnEl   = document.getElementById('shopBtn');
const storeModalEl  = document.getElementById('storeModal');
const storeCloseBtnEl = document.getElementById('storeCloseBtn');
const storeBalanceEl  = document.getElementById('storeBalance');
const skinGridEl      = document.getElementById('skinGrid');

// ── Constants ──────────────────────────────────────────────────────────────────
const GRAVITY       = 950;
const FLAP_VEL      = -315;
const FLAP_COOLDOWN = 150; // ms — prevents double-tap launches
const PIPE_SPEED    = 170;
const PIPE_W        = 72;
const PIPE_GAP      = 166;
const PIPE_INTERVAL = 1.35;
const GROUND_H      = 90;
const CAN_R         = 9;

// ── Skins ──────────────────────────────────────────────────────────────────────
const SKINS = [
  { id: 'default', name: 'Classic', price: 0,   body: '#ffd84d', wing: '#ffb31f', beak: '#f27d2f', eye: '#1a2230' },
  { id: 'ocean',   name: 'Ocean',   price: 60,  body: '#4dc8ff', wing: '#1fa8f5', beak: '#ff8c42', eye: '#0d1a2e' },
  { id: 'cherry',  name: 'Cherry',  price: 120, body: '#ff4d6d', wing: '#e0193a', beak: '#ffd84d', eye: '#1a0d12' },
  { id: 'neon',    name: 'Neon',    price: 200, body: '#39ff8a', wing: '#20e070', beak: '#ff39d4', eye: '#001a0d' },
  { id: 'void',    name: 'Void',    price: 350, body: '#8b6fff', wing: '#6b4fff', beak: '#ff9f4d', eye: '#0d0a1a' },
  { id: 'solar',   name: 'Solar',   price: 500, body: '#ff8c42', wing: '#e06020', beak: '#ffd84d', eye: '#1a0d00' },
];

let ownedSkins    = new Set(JSON.parse(localStorage.getItem('mochi-bird-owned') || '["default"]'));
let equippedSkinId = localStorage.getItem('mochi-bird-skin') || 'default';
let currentSkin   = SKINS.find(s => s.id === equippedSkinId) || SKINS[0];

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
let cans = [], sessionCans = 0, lifetimeCans = 0;
let lastFlapTime = -Infinity;

const params = new URLSearchParams(location.search);
let sessionId = params.get('sid');
let sessionToken = params.get('token');

// For Discord Activities, sessionId may be in hash fragment (not stripped by proxy)
if (!sessionId && !sessionToken && location.hash) {
  sessionId = location.hash.slice(1); // Remove # prefix
}

let isPractice = !sessionId && !sessionToken;
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
      statusEl.textContent = 'Loading...';
      startBtn.disabled = true;
      break;

    case 'ready':
      if (isPractice) {
        showOverlay('Practice Mode', 'Scores are local only (not recorded)', 'Play');
        statusEl.textContent = '⚠️ Practice mode (no recording)';
      } else {
        showOverlay('Ready', `Playing as ${sessionData?.userTag || 'guest'} — Scores recorded!`, 'Play');
        statusEl.textContent = `✅ Session: ${sessionData?.userTag || 'guest'}`;
      }
      startBtn.disabled = false;
      shopBtnEl.disabled = false;
      break;

    case 'playing':
      hideOverlay();
      statusEl.textContent = isPractice ? 'Playing' : 'Session running';
      startBtn.disabled = true;
      shopBtnEl.disabled = true;
      break;

    case 'dead':
      const plural = score === 1 ? 'point' : 'points';
      showOverlay('Game Over', `You scored ${score} ${plural}`, 'Play Again');
      statusEl.textContent = `Game over — scored ${score}`;
      startBtn.disabled = false;
      shopBtnEl.disabled = false;
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

    const avatarHtml = e.avatarHash
      ? `<img class="lb-avatar" src="https://cdn.discordapp.com/avatars/${e.userId}/${e.avatarHash}.png?size=32" alt="" loading="lazy">`
      : `<span class="lb-avatar lb-avatar-fallback">${(e.userTag || '?')[0].toUpperCase()}</span>`;

    li.innerHTML = `
      <span class="lb-rank">${i + 1}</span>
      ${avatarHtml}
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

  cans = [];
  sessionCans = 0;
  lifetimeCans = Number(localStorage.getItem('mochi-bird-cans') || 0);
  canCountEl.textContent = String(lifetimeCans);

  scoreEl.textContent = '0';
  bestScore = Number(localStorage.getItem(bestScoreKey) || 0);
  bestScoreEl.textContent = String(bestScore);
}

function addPipe() {
  const topH = 60 + Math.random() * (H - GROUND_H - PIPE_GAP - 140);
  pipes.push({ x: W + 30, topH, passed: false });
  spawnCans(topH);
}

function spawnCans(topH) {
  const gapCenter = topH + PIPE_GAP / 2;
  const spread    = PIPE_GAP * 0.28;
  const count     = 2 + (Math.random() < 0.4 ? 1 : 0);
  const spacing   = 38;
  const startX    = W + 30 + PIPE_W + 30; // just past the pipe mouth
  for (let i = 0; i < count; i++) {
    cans.push({
      x: startX + i * spacing,
      y: gapCenter + (Math.random() - 0.5) * spread * 2,
      collected: false,
    });
  }
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
        // Refresh leaderboard immediately when personal best is beaten
        fetchLeaderboard();
      }
    }
  }

  pipes = pipes.filter(p => p.x > -PIPE_W - 40);

  // Cans
  for (const c of cans) {
    if (c.collected) continue;
    c.x -= PIPE_SPEED * dt;
    const dx = bird.x - c.x, dy = bird.y - c.y;
    if (dx * dx + dy * dy < (bird.r + CAN_R) * (bird.r + CAN_R)) {
      c.collected = true;
      sessionCans++;
      lifetimeCans++;
      localStorage.setItem('mochi-bird-cans', String(lifetimeCans));
      canCountEl.textContent = String(lifetimeCans);
    }
  }
  cans = cans.filter(c => !c.collected && c.x > -CAN_R * 2);
}

// ── Store ──────────────────────────────────────────────────────────────────────
function openStore() {
  renderStore();
  storeModalEl.classList.remove('hidden');
}
function closeStore() {
  storeModalEl.classList.add('hidden');
}

function drawSkinPreview(canvas, skin) {
  const c = canvas.getContext('2d');
  const r = canvas.width / 2;
  c.clearRect(0, 0, canvas.width, canvas.height);

  // Body
  c.fillStyle = skin.body;
  c.beginPath();
  c.arc(r, r, r - 2, 0, Math.PI * 2);
  c.fill();

  // Wing
  c.fillStyle = skin.wing;
  c.beginPath();
  c.ellipse(r - 4, r + 6, 13, 9, -0.3, 0, Math.PI * 2);
  c.fill();

  // Eye
  c.fillStyle = skin.eye;
  c.beginPath();
  c.arc(r + 8, r - 6, 3.5, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#fff';
  c.beginPath();
  c.arc(r + 9, r - 7, 1.2, 0, Math.PI * 2);
  c.fill();

  // Beak
  c.fillStyle = skin.beak;
  c.beginPath();
  c.moveTo(r + 16, r - 2);
  c.lineTo(r + 28, r + 4);
  c.lineTo(r + 16, r + 10);
  c.closePath();
  c.fill();
}

function renderStore() {
  storeBalanceEl.textContent = lifetimeCans;
  skinGridEl.innerHTML = '';

  for (const skin of SKINS) {
    const owned    = ownedSkins.has(skin.id);
    const equipped = skin.id === equippedSkinId;
    const canAfford = lifetimeCans >= skin.price;

    const card = document.createElement('div');
    card.className = 'skin-card' + (equipped ? ' equipped' : '');

    const previewCanvas = document.createElement('canvas');
    previewCanvas.width  = 72;
    previewCanvas.height = 72;
    previewCanvas.className = 'skin-preview';

    let btnClass = 'skin-action';
    let btnText, btnDisabled;
    if (equipped) {
      btnClass += ' active'; btnText = 'Equipped'; btnDisabled = true;
    } else if (owned) {
      btnClass += ' owned'; btnText = 'Equip'; btnDisabled = false;
    } else if (canAfford) {
      btnText = `Buy · ${skin.price} 🥫`; btnDisabled = false;
    } else {
      btnText = `${skin.price} 🥫`; btnDisabled = true;
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = btnClass;
    btn.textContent = btnText;
    btn.disabled = btnDisabled;
    btn.addEventListener('click', () => handleSkinAction(skin.id));

    const nameEl = document.createElement('div');
    nameEl.className = 'skin-name';
    nameEl.textContent = skin.name;

    card.appendChild(previewCanvas);
    card.appendChild(nameEl);
    card.appendChild(btn);
    skinGridEl.appendChild(card);

    drawSkinPreview(previewCanvas, skin);
  }
}

function handleSkinAction(skinId) {
  const skin = SKINS.find(s => s.id === skinId);
  if (!skin) return;

  if (!ownedSkins.has(skinId)) {
    if (lifetimeCans < skin.price) return;
    lifetimeCans -= skin.price;
    localStorage.setItem('mochi-bird-cans', String(lifetimeCans));
    canCountEl.textContent = String(lifetimeCans);
    ownedSkins.add(skinId);
    localStorage.setItem('mochi-bird-owned', JSON.stringify([...ownedSkins]));
  }

  equippedSkinId = skinId;
  currentSkin = skin;
  localStorage.setItem('mochi-bird-skin', skinId);
  renderStore();
}

shopBtnEl.addEventListener('click', openStore);
storeCloseBtnEl.addEventListener('click', closeStore);
storeModalEl.addEventListener('pointerdown', (e) => { if (e.target === storeModalEl) closeStore(); });

// ── Input ──────────────────────────────────────────────────────────────────────
function flap() {
  const now = performance.now();
  if (now - lastFlapTime < FLAP_COOLDOWN) return;
  lastFlapTime = now;
  bird.vy = FLAP_VEL;
}

window.addEventListener('keydown', (e) => {
  if ((e.code === 'Space' || e.code === 'ArrowUp') && gameState === 'playing') {
    e.preventDefault();
    flap();
  }
});

// pointerdown handles both mouse and touch — no need for a separate touchstart
stageEl.addEventListener('pointerdown', (e) => {
  if (gameState === 'playing') {
    e.preventDefault();
    flap();
  }
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
  ctx.fillStyle = currentSkin.body;
  ctx.beginPath();
  ctx.arc(0, 0, bird.r, 0, Math.PI * 2);
  ctx.fill();

  // Wing
  ctx.fillStyle = currentSkin.wing;
  ctx.beginPath();
  ctx.ellipse(-3, 4, 9, 6, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // Eye
  ctx.fillStyle = currentSkin.eye;
  ctx.beginPath();
  ctx.arc(5, -4, 2.1, 0, Math.PI * 2);
  ctx.fill();

  // Beak
  ctx.fillStyle = currentSkin.beak;
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

function drawCans() {
  for (const c of cans) {
    if (c.collected) continue;
    const x = c.x, y = c.y, r = CAN_R;
    const h = r * 2.2;

    // Body
    ctx.fillStyle = '#e8333a';
    roundRect(x - r, y - h / 2, r * 2, h, 3);
    ctx.fill();

    // Top silver band
    ctx.fillStyle = '#c0c8d0';
    ctx.fillRect(x - r, y - h / 2, r * 2, h * 0.18);

    // Bottom silver band
    ctx.fillStyle = '#c0c8d0';
    ctx.fillRect(x - r, y + h / 2 - h * 0.18, r * 2, h * 0.18);

    // White highlight stripe
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(x - r * 0.6, y - h / 2 + h * 0.18, r * 0.4, h * 0.64);

    // Rim top ellipse
    ctx.fillStyle = '#a8b2ba';
    ctx.beginPath();
    ctx.ellipse(x, y - h / 2, r, r * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
  }
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
  drawCans();
  drawBird();
  drawDim();

  requestAnimationFrame(loop);
}

// ── No Discord SDK needed - bot passes sessionId via URL parameter ──────────

async function loadSession() {
  resetGame();

  console.log('[boot] Starting session load...');

  try {
    // Try to get Discord user ID from various sources (Discord Activity context)
    let discordUserId = null;

    // Method 1: Try Discord native API (if available in Activity context)
    if (window.discord?.user?.id) {
      discordUserId = window.discord.user.id;
      console.log('[boot] Got Discord user ID from native API:', discordUserId);
    }

    if (!sessionId && !sessionToken) {
      // Try to auto-link to pending Activity session (Discord Activity mode)
      try {
        console.log('[boot] No session params, trying to auto-link to pending Activity session');
        const res = await fetch('/api/session/pending-activity');
        const data = await res.json();
        if (res.ok && data.session) {
          sessionData = data.session;
          sessionId = sessionData.id; // Set for score submission later
          console.log('[boot] Auto-linked to Activity session:', sessionData.userTag);
        } else {
          throw new Error('No pending session');
        }
      } catch (err) {
        console.log('[boot] Could not auto-link to Activity:', err.message);

        // If we have a Discord user ID, try fetching their latest session
        if (discordUserId) {
          try {
            console.log('[boot] Trying Discord user lookup:', discordUserId);
            const res = await fetch(`/api/session/current/${discordUserId}`);
            const data = await res.json();
            if (res.ok && data.session) {
              sessionData = data.session;
              sessionId = sessionData.id;
              console.log('[boot] Loaded session for Discord user');
            } else {
              throw new Error('No user session');
            }
          } catch (err2) {
            console.log('[boot] Could not load Discord user session:', err2.message);
            console.log('[boot] Using practice mode');
            bestScoreKey = 'mochi-bird-best-practice';
            setGameState('ready');
            fetchLeaderboard();
            return;
          }
        } else {
          // No user ID and no session params = practice mode
          console.log('[boot] No session found - using practice mode');
          bestScoreKey = 'mochi-bird-best-practice';
          setGameState('ready');
          fetchLeaderboard();
          return;
        }
      }
    } else {
      // Load existing session via ID or token
      let endpoint;
      if (sessionToken) {
        console.log('[boot] Loading session via token');
        endpoint = `/api/session-by-token/${sessionToken}`;
      } else {
        console.log('[boot] Loading session:', sessionId);
        endpoint = `/api/session/${sessionId}`;
      }

      const res = await fetch(endpoint);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      sessionData = data.session;
    }

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

    console.log('[boot] Session ready');
    setGameState('ready');
    fetchLeaderboard();
  } catch (err) {
    console.error('[boot] Session load error:', err);
    // Fallback to practice mode if anything fails
    bestScoreKey = 'mochi-bird-best-practice';
    setGameState('ready');
    fetchLeaderboard();
  }
}

// ── Boot ───────────────────────────────────────────────────────────────────────
try {
  console.log('[boot] Initializing game...');
  applyLayout();
  console.log('[boot] Layout applied');

  resize();
  console.log('[boot] Canvas resized to', W, 'x', H);

  // Start render loop immediately
  console.log('[boot] Starting render loop');
  requestAnimationFrame(loop);

  // Load session async
  console.log('[boot] Loading session');
  loadSession().catch(err => {
    console.error('[boot] Uncaught loadSession error:', err);
    statusEl.textContent = 'Error: ' + err.message;
    setGameState('error');
  });
} catch (err) {
  console.error('[boot] Critical boot error:', err);
  statusEl.textContent = 'Critical Error: ' + err.message;
  // Try to show error on canvas
  ctx.fillStyle = '#fff';
  ctx.font = '16px sans-serif';
  ctx.fillText('Error: ' + err.message, 20, 40);
}
