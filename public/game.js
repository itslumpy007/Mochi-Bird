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
function makeSkin(id, name, price, src) {
  const img = new Image();
  img.src = src;
  return { id, name, price, src, img };
}

function pad(n) { return String(n).padStart(2, '0'); }

const SKIN_GROUPS = [
  {
    label: 'Default',
    skins: [ makeSkin('default', 'Default', 0, '/assets/avatar-v2.png') ],
  },
  {
    label: 'Dr. Shelly',
    skins: Array.from({ length: 10 }, (_, i) =>
      makeSkin(`dr-shelly-${pad(i+1)}`, `Pose ${i+1}`, i === 0 ? 60 : 25, `/assets/cosmetics/dr-shelly-${pad(i+1)}.png`)
    ),
  },
  {
    label: 'Shelly Zero',
    skins: Array.from({ length: 12 }, (_, i) =>
      makeSkin(`dr-shelly-s2-${pad(i+1)}`, `Pose ${i+1}`, i === 0 ? 80 : 30, `/assets/cosmetics/dr-shelly-set-2-${pad(i+1)}.png`)
    ),
  },
  {
    label: 'Shalani Energy',
    skins: Array.from({ length: 8 }, (_, i) =>
      makeSkin(`shalani-${pad(i+1)}`, `Pose ${i+1}`, i === 0 ? 70 : 25, `/assets/cosmetics/shalani-energy-${pad(i+1)}.png`)
    ),
  },
  {
    label: 'Sussballs',
    skins: Array.from({ length: 7 }, (_, i) =>
      makeSkin(`sussballs-${pad(i+1)}`, `Pose ${i+1}`, i === 0 ? 90 : 35, `/assets/cosmetics/sussballs-${pad(i+1)}.png`)
    ),
  },
  {
    label: 'Watermelon',
    skins: [ makeSkin('watermelon-01', 'Watermelon', 150, '/assets/cosmetics/watermelon-01.png') ],
  },
  {
    label: 'Dark Hair',
    skins: Array.from({ length: 16 }, (_, i) =>
      makeSkin(`hair-dark-${pad(i+1)}`, `Style ${i+1}`, i === 0 ? 20 : 10, `/assets/cosmetics/hair-dark-${pad(i+1)}.png`)
    ),
  },
  {
    label: 'Brown Hair',
    skins: Array.from({ length: 16 }, (_, i) =>
      makeSkin(`hair-brown-${pad(i+1)}`, `Style ${i+1}`, i === 0 ? 20 : 10, `/assets/cosmetics/hair-brown-${pad(i+1)}.png`)
    ),
  },
];

const SKINS = SKIN_GROUPS.flatMap(g => g.skins);

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
let buildings = [];
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

  stars = Array.from({ length: 22 }, (_, i) => ({
    x: (i * 113) % W,
    y: (i * 79) % (H * 0.55),
    r: 1.2 + (i % 3) * 0.7,
    twinkle: 0.4 + (i % 5) * 0.13,
  }));

  clouds = Array.from({ length: 5 }, (_, i) => ({
    x: W * (0.15 + i * 0.22),
    y: H * (0.08 + (i % 3) * 0.07),
    speed: 6 + i * 1.8,
    size: 0.7 + i * 0.14,
    face: i % 3, // 0=smile, 1=wink, 2=smile
  }));

  buildings = Array.from({ length: 9 }, (_, i) => ({
    x: (i * W / 7) % (W + 80) - 40,
    w: 38 + (i % 3) * 18,
    h: 60 + (i % 5) * 28,
    hue: i % 2 === 0 ? 'pink' : 'lavender',
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

function makeSkinCard(skin) {
  const owned     = ownedSkins.has(skin.id);
  const equipped  = skin.id === equippedSkinId;
  const canAfford = lifetimeCans >= skin.price;

  const card = document.createElement('div');
  card.className = 'skin-card' + (equipped ? ' equipped' : '');

  const previewImg = document.createElement('img');
  previewImg.className = 'skin-preview';
  previewImg.src = skin.src;
  previewImg.alt = skin.name;
  previewImg.loading = 'lazy';

  const nameEl = document.createElement('div');
  nameEl.className = 'skin-name';
  nameEl.textContent = skin.name;

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

  card.appendChild(previewImg);
  card.appendChild(nameEl);
  card.appendChild(btn);
  return card;
}

function renderStore() {
  storeBalanceEl.textContent = lifetimeCans;
  skinGridEl.innerHTML = '';

  for (const group of SKIN_GROUPS) {
    const heading = document.createElement('h3');
    heading.className = 'skin-group-label';
    heading.textContent = group.label;
    skinGridEl.appendChild(heading);

    const grid = document.createElement('div');
    grid.className = 'skin-group-grid';
    for (const skin of group.skins) grid.appendChild(makeSkinCard(skin));
    skinGridEl.appendChild(grid);
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

function drawSparkle(x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a  = (i / 4) * Math.PI * 2 - Math.PI / 4;
    const ia = a + Math.PI / 4;
    if (i === 0) ctx.moveTo(Math.cos(a) * size, Math.sin(a) * size);
    else         ctx.lineTo(Math.cos(a) * size, Math.sin(a) * size);
    ctx.lineTo(Math.cos(ia) * size * 0.22, Math.sin(ia) * size * 0.22);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawHeart(x, y, size, color) {
  ctx.save();
  ctx.fillStyle = color || 'rgba(255,200,220,0.7)';
  ctx.translate(x, y);
  ctx.scale(size, size);
  ctx.beginPath();
  ctx.moveTo(0, -0.4);
  ctx.bezierCurveTo( 0,  -1.1,  1.2, -1.1,  1.2,  0);
  ctx.bezierCurveTo( 1.2, 0.8,  0,    1.3,  0,    1.3);
  ctx.bezierCurveTo( 0,   1.3, -1.2,  0.8, -1.2,  0);
  ctx.bezierCurveTo(-1.2,-1.1,  0,   -1.1,  0,   -0.4);
  ctx.fill();
  ctx.restore();
}

function drawSky() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0,    '#89c4f0');
  g.addColorStop(0.45, '#e8b4d8');
  g.addColorStop(1,    '#f8cce0');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  for (const s of stars) {
    const alpha = 0.35 + Math.sin((elapsedMs / 1000) * s.twinkle + s.x) * 0.3;
    ctx.globalAlpha = clamp(alpha, 0.1, 0.65);
    ctx.fillStyle = '#fff';
    drawSparkle(s.x, s.y, s.r * 2.8);
  }
  ctx.globalAlpha = 1;
}

function drawBuildings() {
  const groundY = H - GROUND_H;
  for (const b of buildings) {
    const bx = b.x - (bgOffset * 0.18 % (W + 120));
    const by = groundY - b.h;
    ctx.fillStyle = b.hue === 'pink'
      ? 'rgba(255,180,210,0.38)'
      : 'rgba(200,170,230,0.38)';
    roundRect(bx, by, b.w, b.h + 2, 10);
    ctx.fill();
    // windows
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    for (let wy = by + 10; wy < groundY - 14; wy += 18) {
      for (let wx = bx + 6; wx < bx + b.w - 10; wx += 13) {
        roundRect(wx, wy, 8, 10, 3);
        ctx.fill();
      }
    }
  }
}

function drawClouds() {
  for (const c of clouds) {
    if (gameState === 'playing') {
      c.x -= c.speed * 0.008;
      if (c.x < -140) {
        c.x = W + 140;
        c.y = H * (0.06 + Math.random() * 0.22);
      }
    }
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.scale(c.size, c.size);

    // Body
    ctx.fillStyle = 'rgba(255,248,252,0.92)';
    ctx.beginPath();
    ctx.arc(0,   0,  20, 0, Math.PI * 2);
    ctx.arc(22, -9,  25, 0, Math.PI * 2);
    ctx.arc(45,  0,  17, 0, Math.PI * 2);
    ctx.arc(23,  9,  21, 0, Math.PI * 2);
    ctx.fill();

    // Pink blush cheeks
    ctx.fillStyle = 'rgba(255,170,200,0.45)';
    ctx.beginPath(); ctx.ellipse(11,  8, 5.5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(34,  8, 5.5, 3.5, 0, 0, Math.PI * 2); ctx.fill();

    // Eyes
    ctx.fillStyle = '#5a3a2a';
    if (c.face === 1) {
      // wink — left eye closed
      ctx.beginPath(); ctx.arc(17, 2, 2.8, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#5a3a2a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(28, 2, 2.8, Math.PI, 0); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(17, 2, 2.8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(28, 2, 2.8, 0, Math.PI * 2); ctx.fill();
    }

    // Smile
    ctx.strokeStyle = '#5a3a2a'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(22.5, 4, 5, 0.15, Math.PI - 0.15); ctx.stroke();

    ctx.restore();
  }
}

function drawPipe(x, y, w, h, isTop) {
  const collar = 18, collarX = x - 5, collarW = w + 10;

  if (isTop) {
    // Body
    ctx.fillStyle = '#ff6eb4';
    roundRect(x, y, w, h - collar, 8); ctx.fill();
    // Highlight
    ctx.fillStyle = 'rgba(255,200,230,0.5)';
    ctx.fillRect(x + 7, y, 9, h - collar);
    // Collar
    ctx.fillStyle = '#d44a90';
    roundRect(collarX, y + h - collar, collarW, collar, 7); ctx.fill();
    ctx.fillStyle = '#ff6eb4';
    roundRect(collarX + 3, y + h - collar + 3, collarW - 6, collar - 5, 5); ctx.fill();
    ctx.fillStyle = 'rgba(255,200,230,0.4)';
    ctx.fillRect(collarX + 8, y + h - collar + 3, 9, collar - 5);
    // Opening ellipse
    ctx.fillStyle = '#b83578';
    ctx.beginPath(); ctx.ellipse(x + w/2, y + h - collar + 5, w/2 - 3, 7, 0, 0, Math.PI * 2); ctx.fill();
    // Heart
    if (h > 50) drawHeart(x + w/2, y + (h - collar) * 0.5, 5, 'rgba(255,210,230,0.75)');

  } else {
    // Collar at top
    ctx.fillStyle = '#d44a90';
    roundRect(collarX, y, collarW, collar, 7); ctx.fill();
    ctx.fillStyle = '#ff6eb4';
    roundRect(collarX + 3, y + 3, collarW - 6, collar - 5, 5); ctx.fill();
    ctx.fillStyle = 'rgba(255,200,230,0.4)';
    ctx.fillRect(collarX + 8, y + 3, 9, collar - 5);
    // Opening ellipse
    ctx.fillStyle = '#b83578';
    ctx.beginPath(); ctx.ellipse(x + w/2, y + collar - 5, w/2 - 3, 7, 0, 0, Math.PI * 2); ctx.fill();
    // Body
    ctx.fillStyle = '#ff6eb4';
    roundRect(x, y + collar, w, h - collar, 8); ctx.fill();
    // Highlight
    ctx.fillStyle = 'rgba(255,200,230,0.5)';
    ctx.fillRect(x + 7, y + collar, 9, h - collar);
    // Heart
    if (h > 50) drawHeart(x + w/2, y + collar + (h - collar) * 0.5, 5, 'rgba(255,210,230,0.75)');
  }
}

function drawPipes() {
  for (const p of pipes) {
    const botY = p.topH + PIPE_GAP;
    const botH = H - GROUND_H - botY;
    drawPipe(p.x, 0,    PIPE_W, p.topH, true);
    drawPipe(p.x, botY, PIPE_W, botH,   false);
  }
}

function drawGround() {
  const y = H - GROUND_H;

  // Main ground fill
  const g = ctx.createLinearGradient(0, y, 0, H);
  g.addColorStop(0, '#ff8fb8');
  g.addColorStop(1, '#ff6ea0');
  ctx.fillStyle = g;
  ctx.fillRect(0, y, W, GROUND_H);

  // Scrolling scalloped border
  const scallop = 22;
  const offset  = bgOffset * 0.55 % scallop;
  ctx.fillStyle = '#ffb0d0';
  ctx.beginPath();
  ctx.moveTo(-scallop, y + 2);
  const count = Math.ceil(W / scallop) + 3;
  for (let i = 0; i < count; i++) {
    const cx = -scallop + i * scallop - offset;
    ctx.arc(cx, y + 2, scallop / 2, Math.PI, 0);
  }
  ctx.lineTo(W + scallop, y + scallop / 2 + 4);
  ctx.lineTo(W + scallop, y + 2);
  ctx.closePath();
  ctx.fill();

  // Tiny hearts along the scallop
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < count; i++) {
    const hx = -scallop + i * scallop - offset + scallop / 2;
    const hy = y + 3;
    drawHeart(hx, hy, 2.8, 'rgba(255,255,255,0.55)');
  }
}

function drawBird() {
  const tilt = clamp(bird.vy / 400, -0.6, 0.8);
  ctx.save();
  ctx.translate(bird.x, bird.y);
  ctx.rotate(tilt);

  const img = currentSkin.img;
  if (img && img.complete && img.naturalWidth > 0) {
    const displayH = bird.r * 5;
    const displayW = displayH * (img.naturalWidth / img.naturalHeight);
    ctx.drawImage(img, -displayW / 2, -displayH * 0.52, displayW, displayH);
  } else {
    // Geometric fallback while image loads
    ctx.fillStyle = '#ffd84d';
    ctx.beginPath();
    ctx.arc(0, 0, bird.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffb31f';
    ctx.beginPath();
    ctx.ellipse(-3, 4, 9, 6, -0.3, 0, Math.PI * 2);
    ctx.fill();
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
  drawBuildings();
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
