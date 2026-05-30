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
const muteBtnEl   = document.getElementById('muteBtn');
const storeModalEl    = document.getElementById('storeModal');
const storeCloseBtnEl = document.getElementById('storeCloseBtn');
const storeBalanceEl  = document.getElementById('storeBalance');
const skinGridEl      = document.getElementById('skinGrid');

// ── Constants ──────────────────────────────────────────────────────────────────
const GRAVITY       = 950;
const FLAP_VEL      = -315;
const FLAP_COOLDOWN = 150;
const PIPE_SPEED    = 170;   // base — increases with score
const PIPE_W        = 72;
const PIPE_GAP      = 166;   // base — shrinks with score
const PIPE_INTERVAL = 1.35;
const GROUND_H      = 90;
const CAN_R         = 9;
const HIT_R         = 10;    // collision radius (smaller than visual for fair play)

// Difficulty helpers
function curPipeSpeed() { return PIPE_SPEED + Math.min(score * 2.5, 110); }
function curPipeGap()   { return Math.max(118, PIPE_GAP - score * 1.8); }

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
let startupProgress = 0;
let startupReady    = false;
let pendingReady    = false;

// ── Audio ──────────────────────────────────────────────────────────────────────
let audioCtx = null;
let muted    = localStorage.getItem('mochi-bird-muted') === 'true';

function getAC() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx?.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function tone({ freq = 440, end, type = 'sine', vol = 0.15, dur = 0.12, delay = 0 } = {}) {
  if (muted) return;
  const ac = getAC(); if (!ac) return;
  const osc = ac.createOscillator(), gain = ac.createGain();
  osc.connect(gain); gain.connect(ac.destination);
  osc.type = type;
  const t = ac.currentTime + delay;
  osc.frequency.setValueAtTime(freq, t);
  if (end) osc.frequency.exponentialRampToValueAtTime(end, t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.start(t); osc.stop(t + dur + 0.01);
}
const sfx = {
  flap()    { tone({ freq: 520, end: 360, vol: 0.11, dur: 0.08 }); },
  score()   { tone({ freq: 880, vol: 0.14, dur: 0.07 }); tone({ freq: 1100, vol: 0.11, dur: 0.08, delay: 0.06 }); },
  collect() { tone({ freq: 1400, end: 1800, vol: 0.09, dur: 0.07 }); },
  death()   { tone({ freq: 340, end: 110, type: 'sawtooth', vol: 0.22, dur: 0.38 });
               tone({ freq: 260, end: 80,  type: 'square',  vol: 0.10, dur: 0.42, delay: 0.06 }); },
};
function toggleMute() {
  muted = !muted;
  localStorage.setItem('mochi-bird-muted', String(muted));
  muteBtnEl.textContent = muted ? '🔇' : '🔊';
}
muteBtnEl.textContent = muted ? '🔇' : '🔊';
muteBtnEl.addEventListener('click', toggleMute);

// ── Toast ──────────────────────────────────────────────────────────────────────
function showToast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.classList.add('show'); });
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 400);
  }, 2800);
}

// ── Flap animation ─────────────────────────────────────────────────────────────
let animFrame    = 0;
let animSkinList = []; // owned frames in equipped skin's group

function refreshAnimSkins() {
  const group = SKIN_GROUPS.find(g => g.skins.some(s => s.id === equippedSkinId));
  if (group && group.skins.length > 1) {
    animSkinList = group.skins.filter(s => ownedSkins.has(s.id));
  } else {
    animSkinList = [];
  }
  animFrame = 0;
}

// ── Preview (try-on) ───────────────────────────────────────────────────────────
let previewSkinId = null; // temporarily shown skin; reverts if unowned at game start
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
      hideOverlay();   // canvas draws the startup screen
      statusEl.textContent = 'Loading...';
      startBtn.disabled = true;
      shopBtnEl.disabled = true;
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

  // Revert try-on preview if skin is unowned
  if (previewSkinId && !ownedSkins.has(previewSkinId)) {
    previewSkinId  = null;
    currentSkin    = SKINS.find(s => s.id === equippedSkinId) || SKINS[0];
    refreshAnimSkins();
  }

  animFrame = 0;

  scoreEl.textContent = '0';
  bestScore = Number(localStorage.getItem(bestScoreKey) || 0);
  bestScoreEl.textContent = String(bestScore);
}

function addPipe() {
  const gap  = curPipeGap();
  const topH = 60 + Math.random() * (H - GROUND_H - gap - 140);
  pipes.push({ x: W + 30, topH, gap, passed: false });
  spawnCans(topH, gap);
}

function spawnCans(topH, gap) {
  const gapCenter = topH + gap / 2;
  const spread    = gap * 0.28;
  // More cans at higher scores — reward skilled play
  const bonusCount = Math.floor(score / 8);
  const count      = 2 + bonusCount + (Math.random() < 0.38 ? 1 : 0);
  const spacing    = 36;
  const startX     = W + 30 + PIPE_W + 28;
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
  return { x: bird.x - HIT_R, y: bird.y - HIT_R, w: HIT_R * 2, h: HIT_R * 2 };
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
  elapsedMs += dt * 1000; // always tick so sparkles animate on startup screen

  if (gameState === 'loading') {
    // Drive bar: fast until 85%, then wait for session; snap to 100% when done
    const target = startupReady ? 1 : 0.85;
    startupProgress += (target - startupProgress) * dt * (startupReady ? 4 : 1.2);
    startupProgress = Math.min(startupProgress, target);
    if (pendingReady && startupProgress >= 0.99) {
      pendingReady = false;
      setGameState('ready');
      return;
    }
    // Drift clouds slowly during startup
    for (const c of clouds) {
      c.x -= c.speed * 0.004;
      if (c.x < -140) c.x = W + 140;
    }
    return;
  }

  if (gameState !== 'playing') return;
  // (elapsedMs already incremented above)

  bird.vy += GRAVITY * dt;
  bird.y += bird.vy * dt;
  const speed = curPipeSpeed();
  bgOffset = (bgOffset + speed * dt) % W;

  // Ceiling
  if (bird.y - HIT_R <= 0) {
    bird.y = HIT_R;
    bird.vy = Math.max(0, bird.vy);
  }

  // Ground
  if (bird.y + HIT_R >= H - GROUND_H) {
    sfx.death();
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
    p.x -= speed * dt;

    const top    = { x: p.x, y: 0,           w: PIPE_W, h: p.topH };
    const bottom = { x: p.x, y: p.topH + p.gap, w: PIPE_W, h: H - GROUND_H - (p.topH + p.gap) };

    if (rectsOverlap(bb, top) || rectsOverlap(bb, bottom)) {
      sfx.death();
      setGameState('dead');
      submitScore();
      if (score > bestScore) {
        bestScore = score;
        bestScoreEl.textContent = String(bestScore);
        localStorage.setItem(bestScoreKey, String(bestScore));
      }
      return;
    }

    if (!p.passed && p.x + PIPE_W < bird.x - HIT_R) {
      p.passed = true;
      score++;
      scoreEl.textContent = String(score);
      sfx.score();
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
      sfx.collect();
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

  // Try button for unowned skins
  if (!owned && skin.price > 0) {
    const tryBtn = document.createElement('button');
    tryBtn.type      = 'button';
    tryBtn.className = 'skin-action skin-try';
    tryBtn.textContent = 'Try';
    tryBtn.addEventListener('click', () => handleSkinAction(skin.id, 'try'));
    card.appendChild(previewImg);
    card.appendChild(nameEl);
    card.appendChild(btn);
    card.appendChild(tryBtn);
  } else {
    card.appendChild(previewImg);
    card.appendChild(nameEl);
    card.appendChild(btn);
  }
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

function handleSkinAction(skinId, action = 'buy-or-equip') {
  const skin = SKINS.find(s => s.id === skinId);
  if (!skin) return;

  if (action === 'try') {
    previewSkinId = skinId;
    currentSkin   = skin;
    refreshAnimSkins();
    closeStore();
    showToast('Previewing — buy to keep it!');
    return;
  }

  if (!ownedSkins.has(skinId)) {
    if (lifetimeCans < skin.price) return;
    lifetimeCans -= skin.price;
    localStorage.setItem('mochi-bird-cans', String(lifetimeCans));
    canCountEl.textContent = String(lifetimeCans);
    ownedSkins.add(skinId);
    localStorage.setItem('mochi-bird-owned', JSON.stringify([...ownedSkins]));
    showToast(`✨ ${skin.name} unlocked!`);
  }

  previewSkinId  = null;
  equippedSkinId = skinId;
  currentSkin    = skin;
  localStorage.setItem('mochi-bird-skin', skinId);
  refreshAnimSkins();
  saveServerSkins();
  renderStore();
}

async function saveServerSkins() {
  if (!sessionId || isPractice) return;
  try {
    await fetch(`/api/session/${sessionId}/skins`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ownedSkins: [...ownedSkins], equippedSkin: equippedSkinId }),
    });
  } catch (err) { console.warn('[skins] save failed:', err.message); }
}

async function loadServerSkins() {
  if (!sessionId || isPractice) return;
  try {
    const res  = await fetch(`/api/session/${sessionId}/skins`);
    const data = await res.json();
    if (!res.ok) return;
    // Union server + local owned
    (data.ownedSkins || []).forEach(id => ownedSkins.add(id));
    localStorage.setItem('mochi-bird-owned', JSON.stringify([...ownedSkins]));
    // Use server's equipped skin if we own it
    if (data.equippedSkin && ownedSkins.has(data.equippedSkin)) {
      equippedSkinId = data.equippedSkin;
      currentSkin    = SKINS.find(s => s.id === equippedSkinId) || SKINS[0];
      localStorage.setItem('mochi-bird-skin', equippedSkinId);
    }
    refreshAnimSkins();
  } catch (err) { console.warn('[skins] load failed:', err.message); }
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
  sfx.flap();
  if (navigator.vibrate) navigator.vibrate(12);
  // Cycle animation frame through owned poses in this skin's group
  if (animSkinList.length > 1) {
    animFrame = (animFrame + 1) % animSkinList.length;
  }
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

  const displaySkin = (animSkinList.length > 1) ? animSkinList[animFrame] : currentSkin;
  const img = displaySkin?.img || currentSkin.img;
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

// ── Startup screen ─────────────────────────────────────────────────────────────
function drawStartupScreen() {
  // Sky + sparkles
  drawSky();
  drawBuildings();

  // Decorative pipes (static, flanking the scene)
  drawPipe(W * 0.04,        0, PIPE_W, H * 0.30, true);
  drawPipe(W - PIPE_W - W * 0.04, 0, PIPE_W, H * 0.22, true);
  drawPipe(W * 0.07,        H * 0.60, PIPE_W, H - GROUND_H - H * 0.60, false);
  drawPipe(W - PIPE_W - W * 0.07, H * 0.58, PIPE_W, H - GROUND_H - H * 0.58, false);

  // Clouds (already drifting)
  drawClouds();

  // Subtle rainbow arc
  ctx.save();
  ctx.strokeStyle = 'rgba(220,180,255,0.30)';
  ctx.lineWidth   = 28;
  ctx.beginPath();
  ctx.arc(W / 2, H * 0.72, W * 0.38, Math.PI, 0);
  ctx.stroke();
  ctx.restore();

  // Ground
  drawGround();

  // ── Title ──────────────────────────────────────────────────────────────────
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  const fs1 = clamp(W * 0.13, 28, 58);
  const titleY = H * 0.24;

  // "MOCHI" line
  ctx.font        = `900 ${fs1}px "Trebuchet MS", Verdana, sans-serif`;
  ctx.strokeStyle = '#b03070';
  ctx.lineWidth   = 8;
  ctx.lineJoin    = 'round';
  ctx.strokeText('MOCHI', W / 2, titleY - fs1 * 0.6);
  ctx.fillStyle   = '#fff';
  ctx.fillText   ('MOCHI', W / 2, titleY - fs1 * 0.6);

  // "BIRD" line
  const fs2 = clamp(W * 0.165, 34, 72);
  ctx.font        = `900 ${fs2}px "Trebuchet MS", Verdana, sans-serif`;
  ctx.strokeStyle = '#b03070';
  ctx.lineWidth   = 10;
  ctx.strokeText('BIRD', W / 2, titleY + fs2 * 0.55);
  ctx.fillStyle   = '#fff';
  ctx.fillText   ('BIRD', W / 2, titleY + fs2 * 0.55);

  // Pink tint pass
  ctx.fillStyle = 'rgba(255,160,200,0.22)';
  ctx.font = `900 ${fs1}px "Trebuchet MS", Verdana, sans-serif`;
  ctx.fillText('MOCHI', W / 2, titleY - fs1 * 0.6);
  ctx.font = `900 ${fs2}px "Trebuchet MS", Verdana, sans-serif`;
  ctx.fillText('BIRD',  W / 2, titleY + fs2 * 0.55);

  // Hearts flanking title
  drawHeart(W / 2 - fs2 * 1.05, titleY + fs2 * 0.55, 6, '#ff6eb4');
  drawHeart(W / 2 + fs2 * 1.05, titleY + fs2 * 0.55, 6, '#ff6eb4');

  // Floating hearts scattered
  const t = elapsedMs / 1000;
  [[0.2, 0.38], [0.78, 0.30], [0.88, 0.52], [0.14, 0.55]].forEach(([rx, ry], i) => {
    const fy = H * ry - Math.sin(t * 0.9 + i * 1.4) * 7;
    drawHeart(W * rx, fy, 4 + (i % 2) * 2, 'rgba(255,120,180,0.65)');
  });

  // ── Loading bar ────────────────────────────────────────────────────────────
  const barW = W * 0.62, barH = 20;
  const barX = W / 2 - barW / 2;
  const barY = H * 0.74;

  // "LOADING..." label
  ctx.font        = `800 ${clamp(W * 0.048, 12, 18)}px "Trebuchet MS", Verdana, sans-serif`;
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth   = 4;
  ctx.strokeText('LOADING...', W / 2, barY - 16);
  ctx.fillStyle   = '#c04080';
  ctx.fillText   ('LOADING...', W / 2, barY - 16);

  // Track
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  roundRect(barX, barY, barW, barH, barH / 2); // fills
  ctx.strokeStyle = '#ff6eb4';
  ctx.lineWidth   = 2;
  ctx.stroke();

  // Fill
  const fillW = Math.max(barH, (barW - 4) * startupProgress);
  const fg = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
  fg.addColorStop(0, '#ffaad0');
  fg.addColorStop(1, '#ff5da0');
  ctx.fillStyle = fg;
  // Clip fill inside track
  ctx.save();
  ctx.beginPath();
  const r2 = (barH - 4) / 2;
  ctx.roundRect
    ? ctx.roundRect(barX + 2, barY + 2, fillW, barH - 4, r2)
    : (roundRect(barX + 2, barY + 2, fillW, barH - 4, r2), ctx.restore(), ctx.save());
  ctx.fill();
  ctx.restore();

  // Heart at fill tip
  if (startupProgress > 0.05) {
    drawHeart(barX + 2 + fillW - 4, barY + barH / 2, 5, '#fff');
  }
}

// ── Render loop ────────────────────────────────────────────────────────────────
let lastTs = 0;
function loop(ts) {
  const dt = Math.min(0.033, lastTs ? (ts - lastTs) / 1000 : 0);
  lastTs = ts;

  update(dt);

  ctx.clearRect(0, 0, W, H);

  if (gameState === 'loading') {
    drawStartupScreen();
  } else {
    drawSky();
    drawBuildings();
    drawClouds();
    drawPipes();
    drawGround();
    drawCans();
    drawBird();
    drawDim();
  }

  requestAnimationFrame(loop);
}

// ── No Discord SDK needed - bot passes sessionId via URL parameter ──────────

function checkDailyBonus() {
  const today = new Date().toDateString();
  const last  = localStorage.getItem('mochi-bird-daily-bonus');
  if (last === today) return;
  localStorage.setItem('mochi-bird-daily-bonus', today);
  const bonus = 10;
  lifetimeCans += bonus;
  localStorage.setItem('mochi-bird-cans', String(lifetimeCans));
  canCountEl.textContent = String(lifetimeCans);
  setTimeout(() => showToast(`🥫 Daily bonus: +${bonus} cans!`), 600);
}

function signalReady() {
  startupReady  = true;
  pendingReady  = true;
}

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
            signalReady(); fetchLeaderboard(); return;
          }
        } else {
          // No user ID and no session params = practice mode
          console.log('[boot] No session found - using practice mode');
          bestScoreKey = 'mochi-bird-best-practice';
          signalReady(); fetchLeaderboard(); return;
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
      if (pbRes.ok && pbData.rank) {
        statusEl.textContent = `✅ ${sessionData.userTag} · Rank #${pbData.rank}`;
      }
    } catch {}

    await loadServerSkins();
    checkDailyBonus();
    refreshAnimSkins();
    console.log('[boot] Session ready');
    signalReady(); fetchLeaderboard();
  } catch (err) {
    console.error('[boot] Session load error:', err);
    bestScoreKey = 'mochi-bird-best-practice';
    signalReady(); fetchLeaderboard();
  }
}

// ── Boot ───────────────────────────────────────────────────────────────────────
try {
  console.log('[boot] Initializing game...');
  applyLayout();
  refreshAnimSkins();
  checkDailyBonus();
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
