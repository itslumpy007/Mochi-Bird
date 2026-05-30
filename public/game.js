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
const pauseBtnEl      = document.getElementById('pauseBtn');
const shareBtn        = document.getElementById('shareBtn');
const challengesBtnEl = document.getElementById('challengesBtn');
const challengesModalEl = document.getElementById('challengesModal');
const challengesCloseBtnEl = document.getElementById('challengesCloseBtn');
const challengesListEl = document.getElementById('challengesList');
const settingsBtnEl   = document.getElementById('settingsBtn');
const settingsModalEl = document.getElementById('settingsModal');
const settingsCloseBtnEl = document.getElementById('settingsCloseBtn');
const statsBtnEl      = document.getElementById('statsBtn');
const statsModalEl    = document.getElementById('statsModal');
const statsCloseBtnEl = document.getElementById('statsCloseBtn');
const statsGridEl     = document.getElementById('statsGrid');
const lbTabAllEl      = document.getElementById('lbTabAll');
const lbTabTodayEl    = document.getElementById('lbTabToday');

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
let slowMult = 1;
let difficulty = localStorage.getItem('mochi-bird-difficulty') || 'normal';
function diffMult() { return difficulty === 'easy' ? 0.7 : difficulty === 'hard' ? 1.35 : 1.0; }
function curPipeSpeed() { return (PIPE_SPEED + Math.min(score * 2.5, 110)) * slowMult * diffMult(); }
function curPipeGap()   { return Math.max(118, (PIPE_GAP - score * 1.8) / diffMult()); }

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
    desc: 'The original Mochi Bird',
    skins: [ makeSkin('default', 'Default', 0, '/assets/cosmetics/hair-brown-01.png') ],
  },
  {
    label: 'Dr. Shelly',
    desc: "She's got the Dr. Shelly drip",
    skins: Array.from({ length: 10 }, (_, i) =>
      makeSkin(`dr-shelly-${pad(i+1)}`, `Pose ${i+1}`, i === 0 ? 60 : 25, `/assets/cosmetics/dr-shelly-${pad(i+1)}.png`)
    ),
  },
  {
    label: 'Shelly Zero',
    desc: 'Zero sugar, zero limits',
    skins: Array.from({ length: 12 }, (_, i) =>
      makeSkin(`dr-shelly-s2-${pad(i+1)}`, `Pose ${i+1}`, i === 0 ? 80 : 30, `/assets/cosmetics/dr-shelly-set-2-${pad(i+1)}.png`)
    ),
  },
  {
    label: 'Shalani Energy',
    desc: 'Powered by Shalani Energy',
    skins: Array.from({ length: 8 }, (_, i) =>
      makeSkin(`shalani-${pad(i+1)}`, `Pose ${i+1}`, i === 0 ? 70 : 25, `/assets/cosmetics/shalani-energy-${pad(i+1)}.png`)
    ),
  },
  {
    label: 'Sussballs',
    desc: 'Strawberry Rum Job vibes',
    skins: Array.from({ length: 7 }, (_, i) =>
      makeSkin(`sussballs-${pad(i+1)}`, `Pose ${i+1}`, i === 0 ? 90 : 35, `/assets/cosmetics/sussballs-${pad(i+1)}.png`)
    ),
  },
  {
    label: 'Watermelon',
    desc: "Watermelon head, don't ask",
    skins: [ makeSkin('watermelon-01', 'Watermelon', 150, '/assets/cosmetics/watermelon-01.png') ],
  },
  {
    label: 'Dark Hair',
    desc: "Dark hair, don't care",
    skins: Array.from({ length: 16 }, (_, i) =>
      makeSkin(`hair-dark-${pad(i+1)}`, `Style ${i+1}`, i === 0 ? 20 : 10, `/assets/cosmetics/hair-dark-${pad(i+1)}.png`)
    ),
  },
  {
    label: 'Brown Hair',
    desc: 'Brown hair, rare air',
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
// Explicit states: 'loading' | 'menu' | 'ready' | 'countdown' | 'playing' | 'dying' | 'dead' | 'error'
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

// ── Main menu ─────────────────────────────────────────────────────────────────
let menuBtns = []; // populated each frame during 'menu' state

// ── Screen shake ──────────────────────────────────────────────────────────────
let shakeAmt = 0;
function triggerShake(amt) { shakeAmt = amt; }

// ── Death animation ───────────────────────────────────────────────────────────
let dyingTimer = 0;
let dyingVy    = 0;

// ── Countdown ─────────────────────────────────────────────────────────────────
let countdownVal   = 3;
let countdownTimer = 0;

// ── Particles ─────────────────────────────────────────────────────────────────
let particles = [];
function spawnParticles(x, y, { count = 8, colors = ['#fff'], speed = 80, life = 0.6, size = 5, type = 'circle' } = {}) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spd   = speed * (0.5 + Math.random() * 0.8);
    particles.push({
      x, y,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd,
      life,
      maxLife: life,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: size * (0.6 + Math.random() * 0.8),
      type,
    });
  }
}

// ── New personal best ─────────────────────────────────────────────────────────
let newBestAchieved  = false;
let newBestAnimTimer = 0;

// ── Combo ─────────────────────────────────────────────────────────────────────
let combo    = 0;
let maxCombo = 0;
function getCanMult() {
  if (combo >= 10) return 3;
  if (combo >= 5)  return 2;
  return 1;
}

// ── Power-ups ─────────────────────────────────────────────────────────────────
let powerups = [];
let activePowerups = { magnet: 0, shield: false, slow: 0 };
let shieldFlash = 0; // timer for white flash effect

// ── Pause ─────────────────────────────────────────────────────────────────────
let paused = false;

// ── Tutorial ──────────────────────────────────────────────────────────────────
let tutorialActive = false;
let tutorialStep   = 0;

// ── Run history ───────────────────────────────────────────────────────────────
let runHistory = JSON.parse(localStorage.getItem('mochi-bird-runs') || '[]');

// ── Daily streak ──────────────────────────────────────────────────────────────
let streakCount = 0;
function checkStreak() {
  const todayStr = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  const lastDate  = localStorage.getItem('mochi-bird-streak-date');
  const lastCount = Number(localStorage.getItem('mochi-bird-streak-count') || 0);
  if (lastDate === todayStr) {
    streakCount = lastCount;
    return; // already done today
  }
  if (lastDate === yesterday) {
    streakCount = lastCount + 1;
  } else {
    streakCount = 1;
  }
  localStorage.setItem('mochi-bird-streak-date', todayStr);
  localStorage.setItem('mochi-bird-streak-count', String(streakCount));
  // Award bonus cans
  let bonus = 0;
  if (streakCount >= 30) bonus = 200;
  else if (streakCount >= 14) bonus = 100;
  else if (streakCount >= 7)  bonus = 50;
  else if (streakCount >= 3)  bonus = 25;
  else bonus = 10;
  lifetimeCans += bonus;
  localStorage.setItem('mochi-bird-cans', String(lifetimeCans));
  canCountEl.textContent = String(lifetimeCans);
  setTimeout(() => showToast(`🔥 Day ${streakCount} streak! +${bonus} cans`), 1000);
}

// ── Daily challenges ──────────────────────────────────────────────────────────
const CHALLENGE_POOL = [
  { id: 'score10',  desc: 'Score 10 points in one run',          type: 'score',  target: 10,  reward: 15 },
  { id: 'score25',  desc: 'Score 25 points in one run',          type: 'score',  target: 25,  reward: 30 },
  { id: 'score50',  desc: 'Score 50 points in one run',          type: 'score',  target: 50,  reward: 60 },
  { id: 'cans20',   desc: 'Collect 20 cans in one session',      type: 'cans',   target: 20,  reward: 20 },
  { id: 'cans50',   desc: 'Collect 50 cans in one session',      type: 'cans',   target: 50,  reward: 40 },
  { id: 'plays3',   desc: 'Play 3 games',                        type: 'plays',  target: 3,   reward: 10 },
  { id: 'plays5',   desc: 'Play 5 games',                        type: 'plays',  target: 5,   reward: 20 },
  { id: 'combo5',   desc: 'Reach a 5 pipe combo',                type: 'combo',  target: 5,   reward: 15 },
  { id: 'combo10',  desc: 'Reach a 10 pipe combo',               type: 'combo',  target: 10,  reward: 30 },
  { id: 'cans10',   desc: 'Collect 10 cans in one run',          type: 'cans',   target: 10,  reward: 10 },
  { id: 'score5',   desc: 'Score 5 points in one run',           type: 'score',  target: 5,   reward: 8  },
  { id: 'plays1',   desc: 'Play your first game today',          type: 'plays',  target: 1,   reward: 5  },
];

let todaysChallenges = [];
let challengeProgress = {};
let challengeSessionCans = 0;
let challengeSessionPlays = 0;

function getTodaysChallenges() {
  const dateStr = new Date().toDateString();
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) hash = (hash * 31 + dateStr.charCodeAt(i)) >>> 0;
  const indices = [];
  let seed = hash;
  while (indices.length < 3) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const idx = seed % CHALLENGE_POOL.length;
    if (!indices.includes(idx)) indices.push(idx);
  }
  return indices.map(i => CHALLENGE_POOL[i]);
}

function initChallenges() {
  const todayStr = new Date().toDateString();
  todaysChallenges = getTodaysChallenges();
  const saved = JSON.parse(localStorage.getItem(`mochi-challenge-${todayStr}`) || '{}');
  challengeProgress = {};
  for (const c of todaysChallenges) {
    challengeProgress[c.id] = saved[c.id] || { value: 0, completed: false };
  }
  challengeSessionCans  = 0;
  challengeSessionPlays = 0;
}

function saveChallengeProgress() {
  const todayStr = new Date().toDateString();
  localStorage.setItem(`mochi-challenge-${todayStr}`, JSON.stringify(challengeProgress));
}

function updateChallengeProgress(type, value) {
  for (const c of todaysChallenges) {
    const prog = challengeProgress[c.id];
    if (!prog || prog.completed) continue;
    if (c.type !== type) continue;
    if (type === 'score' || type === 'combo') {
      if (value >= c.target) {
        prog.value = c.target;
        prog.completed = true;
        lifetimeCans += c.reward;
        localStorage.setItem('mochi-bird-cans', String(lifetimeCans));
        canCountEl.textContent = String(lifetimeCans);
        showToast(`🎯 Challenge done! +${c.reward} cans`);
      } else {
        prog.value = Math.max(prog.value, value);
      }
    } else {
      prog.value += value;
      if (prog.value >= c.target) {
        prog.value = c.target;
        prog.completed = true;
        lifetimeCans += c.reward;
        localStorage.setItem('mochi-bird-cans', String(lifetimeCans));
        canCountEl.textContent = String(lifetimeCans);
        showToast(`🎯 Challenge done! +${c.reward} cans`);
      }
    }
  }
  saveChallengeProgress();
}

function renderChallengesModal() {
  challengesListEl.innerHTML = '';
  for (const c of todaysChallenges) {
    const prog = challengeProgress[c.id] || { value: 0, completed: false };
    const pct  = Math.min(1, prog.value / c.target);
    const div  = document.createElement('div');
    div.className = 'challenge-item' + (prog.completed ? ' completed' : '');
    div.innerHTML = `
      <div class="challenge-desc">${c.desc}</div>
      <div class="challenge-bar-wrap"><div class="challenge-bar" style="width:${Math.round(pct*100)}%"></div></div>
      <div class="challenge-meta">
        <span class="challenge-progress">${prog.value}/${c.target}</span>
        <span class="challenge-reward">+${c.reward} 🥫</span>
        ${prog.completed ? '<span class="challenge-done">Done ✓</span>' : ''}
      </div>
    `;
    challengesListEl.appendChild(div);
  }
}

// ── Can sprite ─────────────────────────────────────────────────────────────────
const canSprite = new Image();
canSprite.src = '/assets/dr-pepper-can-v2.png';

// ── Per-run stats ──────────────────────────────────────────────────────────────
let runCans = 0;
let runPipesCleared = 0;
let runPowerupsUsed = 0;
let runBestCombo = 0;

// ── Particles toggle ───────────────────────────────────────────────────────────
let particlesEnabled = localStorage.getItem('mochi-bird-particles') !== 'false';

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
  powerup() { tone({ freq: 1200, end: 1600, vol: 0.14, dur: 0.15 }); tone({ freq: 1600, end: 2000, vol: 0.10, dur: 0.12, delay: 0.12 }); },
  countdown(n) { tone({ freq: n === 0 ? 1046 : 440 + n * 40, vol: 0.18, dur: 0.12, type: 'square' }); },
};

// ── Background music ───────────────────────────────────────────────────────────
let musicPlaying = false;
let musicTimeoutId = null;
const MUSIC_NOTES = [523, 659, 784, 659, 523, 784, 659, 523];
const MUSIC_NOTE_DUR = 0.15;
const MUSIC_NOTE_GAP = 0.02;
let musicNoteIdx = 0;

function scheduleNextNote() {
  if (!musicPlaying || muted) return;
  const ac = getAC();
  if (!ac) return;
  const freq = MUSIC_NOTES[musicNoteIdx % MUSIC_NOTES.length];
  const osc  = ac.createOscillator();
  const gain = ac.createGain();
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.type = 'sine';
  const t = ac.currentTime;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0.05, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + MUSIC_NOTE_DUR);
  osc.start(t);
  osc.stop(t + MUSIC_NOTE_DUR + 0.01);
  musicNoteIdx = (musicNoteIdx + 1) % MUSIC_NOTES.length;
  const delay = (MUSIC_NOTE_DUR + MUSIC_NOTE_GAP) * 1000;
  musicTimeoutId = setTimeout(scheduleNextNote, delay);
}

function startMusic() {
  if (muted || musicPlaying) return;
  musicPlaying = true;
  musicNoteIdx = 0;
  scheduleNextNote();
}

function stopMusic() {
  musicPlaying = false;
  if (musicTimeoutId !== null) {
    clearTimeout(musicTimeoutId);
    musicTimeoutId = null;
  }
}

function toggleMute() {
  muted = !muted;
  localStorage.setItem('mochi-bird-muted', String(muted));
  muteBtnEl.textContent = muted ? '🔇' : '🔊';
  if (muted) {
    stopMusic();
  } else {
    // Resume music if in a playing/countdown state
    if (gameState === 'playing' || gameState === 'countdown') {
      startMusic();
    }
  }
  // Sync sound toggle in settings
  syncSettingsUI();
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
let cans = [], sessionCans = 0, lifetimeCans = Number(localStorage.getItem('mochi-bird-cans') || 0);
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
let lbMode = 'all';

// ── State machine ──────────────────────────────────────────────────────────────
function setGameState(state) {
  console.log(`[state] ${gameState} → ${state}`);
  gameState = state;
  // Music control
  if (state === 'playing' || state === 'countdown') {
    startMusic();
  } else if (state === 'dead' || state === 'dying' || state === 'paused' || state === 'loading') {
    stopMusic();
  }
  updateUI();
}

function updateUI() {
  // Pause button visibility
  if (pauseBtnEl) {
    if (gameState === 'playing' && !paused) {
      pauseBtnEl.classList.remove('hidden');
    } else if (gameState === 'playing' && paused) {
      pauseBtnEl.classList.remove('hidden');
    } else {
      pauseBtnEl.classList.add('hidden');
    }
  }

  // Share button visibility
  if (shareBtn) {
    if (gameState === 'dead' && sessionId) {
      shareBtn.classList.remove('hidden');
      shareBtn.disabled = false;
      shareBtn.textContent = 'Share 📢';
    } else {
      shareBtn.classList.add('hidden');
    }
  }

  switch (gameState) {
    case 'loading':
      hideOverlay();
      statusEl.textContent = 'Loading...';
      startBtn.disabled = true;
      shopBtnEl.disabled = true;
      break;

    case 'menu':
      hideOverlay(); // canvas draws the main menu
      startBtn.disabled = true;
      shopBtnEl.disabled = false;
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

    case 'countdown':
      hideOverlay();
      startBtn.disabled = true;
      shopBtnEl.disabled = true;
      break;

    case 'playing':
      hideOverlay();
      statusEl.textContent = isPractice ? 'Playing' : 'Session running';
      startBtn.disabled = true;
      shopBtnEl.disabled = true;
      break;

    case 'dying':
      hideOverlay();
      startBtn.disabled = true;
      shopBtnEl.disabled = true;
      break;

    case 'dead':
      showOverlay(
        `You scored ${score}`,
        `🥫 ${runCans}  •  🔥 ${runBestCombo}x  •  ⚡ ${runPowerupsUsed}`,
        'Play Again'
      );
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
    resetGame();
    setGameState('menu');
    return;
  }

  if (gameState === 'ready') {
    // Start countdown instead of going directly to playing
    setGameState('countdown');
    countdownVal   = 3;
    countdownTimer = 0;
    sfx.countdown(3);
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

  // "Need X more" note for players not on the board
  const existingNote = lbListEl.parentElement?.querySelector('.lb-rank-note');
  if (existingNote) existingNote.remove();
  const myEntry = lbEntries.find(e => e.userId === sessionData?.userId);
  if (!myEntry && sessionData?.userId && bestScore > 0 && lbEntries.length > 0) {
    const lowestScore = lbEntries[lbEntries.length - 1]?.bestScore || 0;
    const needed = lowestScore - bestScore + 1;
    if (needed > 0) {
      const note = document.createElement('p');
      note.className = 'lb-rank-note';
      note.textContent = `Score ${needed} more to enter the top ${lbEntries.length}`;
      lbListEl.after(note);
    }
  }
}

async function fetchLeaderboard() {
  try {
    const url = lbMode === 'today' ? '/api/leaderboard/today' : '/api/leaderboard';
    const res = await fetch(url);
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
    face: i % 3,
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

  // New feature resets
  shakeAmt         = 0;
  particles        = [];
  newBestAchieved  = false;
  newBestAnimTimer = 0;
  combo            = 0;
  maxCombo         = 0;
  powerups         = [];
  activePowerups   = { magnet: 0, shield: false, slow: 0 };
  slowMult         = 1;
  shieldFlash      = 0;
  paused           = false;
  dyingTimer       = 0;
  dyingVy          = 0;
  if (pauseBtnEl) { pauseBtnEl.textContent = '⏸'; }
  challengeSessionCans = 0;

  // Per-run stats
  runCans        = 0;
  runPipesCleared = 0;
  runPowerupsUsed = 0;
  runBestCombo   = 0;
}

function addPipe() {
  const gap  = curPipeGap();
  const topH = 60 + Math.random() * (H - GROUND_H - gap - 140);
  pipes.push({ x: W + 30, topH, gap, passed: false });
  spawnCans(topH, gap);
  // 15% chance to spawn a power-up in the gap
  if (Math.random() < 0.15) {
    const types = ['magnet', 'shield', 'slow'];
    const type  = types[Math.floor(Math.random() * types.length)];
    const gapCenter = topH + gap / 2;
    powerups.push({ x: W + 30 + PIPE_W / 2, y: gapCenter, type, collected: false });
  }
}

function spawnCans(topH, gap) {
  const gapCenter = topH + gap / 2;
  const spread    = gap * 0.28;
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

function killBird() {
  sfx.death();
  triggerShake(10);
  if (particlesEnabled) spawnParticles(bird.x, bird.y, { count: 10, colors: ['#ff6eb4', '#ffb0d0', '#fff'], speed: 80, life: 0.8 });
  gameState = 'dying';
  dyingTimer = 0;
  dyingVy    = bird.vy;
  updateUI();
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
    if (!res.ok) {
      if (res.status === 404 || (data.error && (data.error.includes('expired') || data.error.includes('not found')))) {
        if (score > bestScore) {
          bestScore = score;
          bestScoreEl.textContent = String(bestScore);
          localStorage.setItem(bestScoreKey, String(bestScore));
          showToast('Session expired — score saved locally');
        }
        return;
      }
      throw new Error(data.error);
    }

    const pb = data.personalBest?.bestScore ?? score;
    bestScore = Math.max(bestScore, pb);
    localStorage.setItem(bestScoreKey, String(bestScore));
    bestScoreEl.textContent = String(bestScore);
    fetchLeaderboard();
  } catch (err) {
    console.error('Score submit failed:', err);
    if (score > bestScore) {
      bestScore = score;
      bestScoreEl.textContent = String(bestScore);
      localStorage.setItem(bestScoreKey, String(bestScore));
      showToast('Session expired — score saved locally');
    }
  }
}

function onDeath() {
  // Save run history
  runHistory.push(score);
  if (runHistory.length > 10) runHistory = runHistory.slice(-10);
  localStorage.setItem('mochi-bird-runs', JSON.stringify(runHistory));

  // Challenge progress
  challengeSessionPlays++;
  updateChallengeProgress('plays', 1);
  updateChallengeProgress('score', score);
  updateChallengeProgress('combo', maxCombo);

  // Lifetime stats
  const totalGames = Number(localStorage.getItem('mochi-bird-total-games') || 0) + 1;
  localStorage.setItem('mochi-bird-total-games', String(totalGames));
  const totalCansEarned = Number(localStorage.getItem('mochi-bird-total-cans-earned') || 0) + sessionCans;
  localStorage.setItem('mochi-bird-total-cans-earned', String(totalCansEarned));
  const totalPipes = Number(localStorage.getItem('mochi-bird-total-pipes') || 0) + score;
  localStorage.setItem('mochi-bird-total-pipes', String(totalPipes));
  const bestComboEver = Math.max(Number(localStorage.getItem('mochi-bird-best-combo-ever') || 0), maxCombo);
  localStorage.setItem('mochi-bird-best-combo-ever', String(bestComboEver));
  const bestScoreEver = Math.max(Number(localStorage.getItem('mochi-bird-best-score-ever') || 0), score);
  localStorage.setItem('mochi-bird-best-score-ever', String(bestScoreEver));

  submitScore();
  if (score > bestScore) {
    bestScore = score;
    bestScoreEl.textContent = String(bestScore);
    localStorage.setItem(bestScoreKey, String(bestScore));
  }
  setGameState('dead');
}

function update(dt) {
  elapsedMs += dt * 1000;

  if (gameState === 'loading') {
    const target = startupReady ? 1 : 0.85;
    startupProgress += (target - startupProgress) * dt * (startupReady ? 4 : 1.2);
    startupProgress = Math.min(startupProgress, target);
    if (pendingReady && startupProgress >= 0.99) {
      pendingReady = false;
      setGameState('menu');
      return;
    }
    for (const c of clouds) {
      c.x -= c.speed * 0.004;
      if (c.x < -140) c.x = W + 140;
    }
    return;
  }

  // ── Countdown update ───────────────────────────────────────────────────────
  if (gameState === 'countdown') {
    countdownTimer += dt;
    if (countdownTimer >= 1) {
      countdownTimer -= 1;
      const prevVal = countdownVal;
      countdownVal--;
      if (countdownVal < 0) {
        sfx.countdown(0); // GO!
        setGameState('playing');
        return;
      }
      // Fire beep when decrement happens
      if (prevVal !== countdownVal) {
        sfx.countdown(countdownVal);
      }
    }
    return;
  }

  // ── Dying update ───────────────────────────────────────────────────────────
  if (gameState === 'dying') {
    dyingTimer += dt;
    bird.vy += GRAVITY * dt;
    bird.y  += bird.vy * dt;
    // Update particles while dying
    updateParticles(dt);
    if (dyingTimer >= 0.65) {
      onDeath();
    }
    return;
  }

  if (gameState !== 'playing') return;
  if (paused) return;

  // ── Active power-up timers ────────────────────────────────────────────────
  if (activePowerups.magnet > 0) {
    activePowerups.magnet -= dt;
    if (activePowerups.magnet < 0) activePowerups.magnet = 0;
  }
  if (activePowerups.slow > 0) {
    activePowerups.slow -= dt;
    if (activePowerups.slow <= 0) {
      activePowerups.slow = 0;
      slowMult = 1;
    } else {
      slowMult = 0.6;
    }
  } else {
    slowMult = 1;
  }
  if (shieldFlash > 0) shieldFlash -= dt;

  // ── New best banner timer ────────────────────────────────────────────────
  if (newBestAnimTimer > 0) newBestAnimTimer -= dt;

  // ── Particles ─────────────────────────────────────────────────────────────
  updateParticles(dt);

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
    if (activePowerups.shield) {
      activePowerups.shield = false;
      shieldFlash = 0.3;
      bird.y = H - GROUND_H - HIT_R - 1;
      bird.vy = FLAP_VEL * 0.5;
      triggerShake(5);
    } else {
      killBird();
      return;
    }
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
      if (activePowerups.shield) {
        activePowerups.shield = false;
        shieldFlash = 0.3;
        triggerShake(5);
        // Push bird out of pipe
        bird.x = p.x - HIT_R - 2;
      } else {
        killBird();
        return;
      }
    }

    if (!p.passed && p.x + PIPE_W < bird.x - HIT_R) {
      p.passed = true;
      score++;
      runPipesCleared++;
      combo++;
      if (combo > maxCombo) { maxCombo = combo; runBestCombo = maxCombo; }
      scoreEl.textContent = String(score);
      sfx.score();
      // New personal best mid-run
      if (score > bestScore && !newBestAchieved) {
        newBestAchieved  = true;
        newBestAnimTimer = 2.5;
        if (particlesEnabled) spawnParticles(bird.x, bird.y, { count: 16, colors: ['#ffc857','#fff','#ffdd77'], speed: 100, life: 1.0 });
      }
      if (score > bestScore) {
        bestScore = score;
        bestScoreEl.textContent = String(bestScore);
        localStorage.setItem(bestScoreKey, String(bestScore));
        fetchLeaderboard();
      }
    }
  }

  pipes = pipes.filter(p => p.x > -PIPE_W - 40);

  // Magnet effect
  if (activePowerups.magnet > 0) {
    for (const c of cans) {
      if (c.collected) continue;
      const dx = bird.x - c.x, dy = bird.y - c.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 90) {
        c.x += (dx / dist) * 180 * dt;
        c.y += (dy / dist) * 180 * dt;
      }
    }
  }

  // Cans
  for (const c of cans) {
    if (c.collected) continue;
    c.x -= PIPE_SPEED * dt;
    const dx = bird.x - c.x, dy = bird.y - c.y;
    if (dx * dx + dy * dy < (HIT_R + CAN_R) * (HIT_R + CAN_R)) {
      c.collected = true;
      const mult = getCanMult();
      const earned = mult;
      sessionCans     += earned;
      lifetimeCans    += earned;
      runCans         += earned;
      challengeSessionCans += 1;
      updateChallengeProgress('cans', 1);
      localStorage.setItem('mochi-bird-cans', String(lifetimeCans));
      canCountEl.textContent = String(lifetimeCans);
      sfx.collect();
      if (particlesEnabled) spawnParticles(c.x, c.y, { count: 6, colors: ['#ffc857','#fff','#ff6eb4'], speed: 60, life: 0.5 });
    }
  }
  cans = cans.filter(c => !c.collected && c.x > -CAN_R * 2);

  // Power-ups
  for (const p of powerups) {
    if (p.collected) continue;
    p.x -= speed * dt;
    const dx = bird.x - p.x, dy = bird.y - p.y;
    if (dx * dx + dy * dy < (HIT_R + 12) * (HIT_R + 12)) {
      p.collected = true;
      runPowerupsUsed++;
      sfx.powerup();
      if (p.type === 'magnet') {
        activePowerups.magnet = 6;
        showToast('🧲 Magnet activated! (6s)');
      } else if (p.type === 'shield') {
        activePowerups.shield = true;
        showToast('🛡️ Shield activated!');
      } else if (p.type === 'slow') {
        activePowerups.slow = 5;
        showToast('🐌 Slow-mo activated! (5s)');
      }
      if (particlesEnabled) spawnParticles(p.x, p.y, { count: 8, colors: ['#fff', '#ffc857'], speed: 70, life: 0.5 });
    }
  }
  powerups = powerups.filter(p => !p.collected && p.x > -30);
}

function updateParticles(dt) {
  for (const p of particles) {
    p.x    += p.vx * dt;
    p.y    += p.vy * dt;
    p.vy   += 60 * dt; // slight gravity on particles
    p.life -= dt;
  }
  particles = particles.filter(p => p.life > 0);
}

// ── Store ──────────────────────────────────────────────────────────────────────
let storeFilter = 'all';

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

function groupMatchesFilter(group) {
  if (storeFilter === 'all') return true;
  if (storeFilter === 'owned') return group.skins.some(s => ownedSkins.has(s.id));
  const lbl = group.label.toLowerCase();
  if (storeFilter === 'default') return lbl === 'default';
  if (storeFilter === 'dr-shelly') return lbl.startsWith('dr. shelly');
  if (storeFilter === 'shelly-zero') return lbl.startsWith('shelly zero');
  if (storeFilter === 'shalani') return lbl.startsWith('shalani');
  if (storeFilter === 'sussballs') return lbl.startsWith('sussballs');
  if (storeFilter === 'watermelon') return lbl.startsWith('watermelon');
  if (storeFilter === 'hair') return lbl.includes('hair');
  return true;
}

function renderStore() {
  storeBalanceEl.textContent = lifetimeCans;
  skinGridEl.innerHTML = '';

  for (const group of SKIN_GROUPS) {
    if (!groupMatchesFilter(group)) continue;

    const heading = document.createElement('h3');
    heading.className = 'skin-group-label';
    heading.textContent = group.label;
    skinGridEl.appendChild(heading);

    if (group.desc) {
      const subdesc = document.createElement('p');
      subdesc.className = 'skin-group-desc';
      subdesc.textContent = group.desc;
      skinGridEl.appendChild(subdesc);
    }

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
    // Confirm expensive purchases
    if (skin.price >= 80) {
      if (!confirm(`Buy "${skin.name}" for ${skin.price} cans?`)) return;
    }
    lifetimeCans -= skin.price;
    localStorage.setItem('mochi-bird-cans', String(lifetimeCans));
    canCountEl.textContent = String(lifetimeCans);
    ownedSkins.add(skinId);
    localStorage.setItem('mochi-bird-owned', JSON.stringify([...ownedSkins]));
    // Track cans spent
    const cansSpent = Number(localStorage.getItem('mochi-bird-cans-spent') || 0) + skin.price;
    localStorage.setItem('mochi-bird-cans-spent', String(cansSpent));
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
    (data.ownedSkins || []).forEach(id => ownedSkins.add(id));
    localStorage.setItem('mochi-bird-owned', JSON.stringify([...ownedSkins]));
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

// Store filter buttons
document.getElementById('storeFilters').addEventListener('click', (e) => {
  const btn = e.target.closest('.store-filter-btn');
  if (!btn) return;
  storeFilter = btn.dataset.filter;
  document.querySelectorAll('.store-filter-btn').forEach(b => b.classList.toggle('active', b === btn));
  renderStore();
});

// Challenges modal
if (challengesBtnEl) {
  challengesBtnEl.addEventListener('click', () => {
    renderChallengesModal();
    challengesModalEl.classList.remove('hidden');
  });
}
if (challengesCloseBtnEl) {
  challengesCloseBtnEl.addEventListener('click', () => challengesModalEl.classList.add('hidden'));
}
if (challengesModalEl) {
  challengesModalEl.addEventListener('pointerdown', (e) => {
    if (e.target === challengesModalEl) challengesModalEl.classList.add('hidden');
  });
}

// Settings modal
function syncSettingsUI() {
  // Difficulty
  document.querySelectorAll('#difficultyBtns button').forEach(b => {
    b.classList.toggle('active-setting', b.dataset.val === difficulty);
  });
  // Sound
  document.querySelectorAll('#soundToggle button').forEach(b => {
    b.classList.toggle('active-setting', b.dataset.val === (muted ? 'off' : 'on'));
  });
  // Particles
  document.querySelectorAll('#particlesToggle button').forEach(b => {
    b.classList.toggle('active-setting', b.dataset.val === (particlesEnabled ? 'on' : 'off'));
  });
}

if (settingsBtnEl) {
  settingsBtnEl.addEventListener('click', () => {
    syncSettingsUI();
    settingsModalEl.classList.remove('hidden');
  });
}
if (settingsCloseBtnEl) {
  settingsCloseBtnEl.addEventListener('click', () => settingsModalEl.classList.add('hidden'));
}
if (settingsModalEl) {
  settingsModalEl.addEventListener('pointerdown', (e) => {
    if (e.target === settingsModalEl) settingsModalEl.classList.add('hidden');
  });
  document.getElementById('difficultyBtns').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-val]');
    if (!btn) return;
    difficulty = btn.dataset.val;
    localStorage.setItem('mochi-bird-difficulty', difficulty);
    syncSettingsUI();
  });
  document.getElementById('soundToggle').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-val]');
    if (!btn) return;
    const wantOn = btn.dataset.val === 'on';
    if (wantOn === !muted) return; // already in right state
    toggleMute();
  });
  document.getElementById('particlesToggle').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-val]');
    if (!btn) return;
    particlesEnabled = btn.dataset.val === 'on';
    localStorage.setItem('mochi-bird-particles', String(particlesEnabled));
    syncSettingsUI();
  });
}

// Stats modal
function renderStats() {
  if (!statsGridEl) return;
  statsGridEl.innerHTML = '';
  const items = [
    { label: 'Total Games Played',   value: localStorage.getItem('mochi-bird-total-games') || '0' },
    { label: 'Total 🥫 Cans Earned', value: localStorage.getItem('mochi-bird-total-cans-earned') || '0' },
    { label: 'Total Pipes Cleared',  value: localStorage.getItem('mochi-bird-total-pipes') || '0' },
    { label: 'Best Combo Ever 🔥',   value: localStorage.getItem('mochi-bird-best-combo-ever') || '0' },
    { label: 'Best Score Ever',      value: localStorage.getItem('mochi-bird-best-score-ever') || '0' },
    { label: 'Current Streak 🔥',    value: String(streakCount) },
    { label: 'Skins Owned',          value: String(ownedSkins.size) },
    { label: 'Cans Spent',           value: localStorage.getItem('mochi-bird-cans-spent') || '0' },
  ];
  for (const item of items) {
    const card = document.createElement('div');
    card.className = 'stat-card';
    card.innerHTML = `<div class="stat-value">${item.value}</div><div class="stat-label">${item.label}</div>`;
    statsGridEl.appendChild(card);
  }
}

if (statsBtnEl) {
  statsBtnEl.addEventListener('click', () => {
    renderStats();
    statsModalEl.classList.remove('hidden');
  });
}
if (statsCloseBtnEl) {
  statsCloseBtnEl.addEventListener('click', () => statsModalEl.classList.add('hidden'));
}
if (statsModalEl) {
  statsModalEl.addEventListener('pointerdown', (e) => {
    if (e.target === statsModalEl) statsModalEl.classList.add('hidden');
  });
}

// Leaderboard tabs
if (lbTabAllEl) {
  lbTabAllEl.addEventListener('click', () => {
    lbMode = 'all';
    lbTabAllEl.classList.add('active');
    lbTabTodayEl.classList.remove('active');
    fetchLeaderboard();
  });
}
if (lbTabTodayEl) {
  lbTabTodayEl.addEventListener('click', () => {
    lbMode = 'today';
    lbTabTodayEl.classList.add('active');
    lbTabAllEl.classList.remove('active');
    fetchLeaderboard();
  });
}

// Share button
if (shareBtn) {
  shareBtn.addEventListener('click', async () => {
    if (!sessionId) return;
    shareBtn.disabled = true;
    try {
      await fetch(`/api/session/${sessionId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score }),
      });
      showToast('Score shared to Discord! 🎉');
    } catch (err) {
      shareBtn.disabled = false;
    }
  });
}

// Pause button
if (pauseBtnEl) {
  pauseBtnEl.addEventListener('click', togglePause);
}

function togglePause() {
  if (gameState !== 'playing') return;
  paused = !paused;
  if (pauseBtnEl) pauseBtnEl.textContent = paused ? '▶' : '⏸';
  if (paused) {
    stopMusic();
  } else {
    startMusic();
  }
}

// ── Input ──────────────────────────────────────────────────────────────────────
function flap() {
  const now = performance.now();
  if (now - lastFlapTime < FLAP_COOLDOWN) return;
  lastFlapTime = now;
  bird.vy = FLAP_VEL;
  sfx.flap();
  if (navigator.vibrate) navigator.vibrate(12);
  if (animSkinList.length > 1) {
    animFrame = (animFrame + 1) % animSkinList.length;
  }
}

window.addEventListener('keydown', (e) => {
  if ((e.code === 'Space' || e.code === 'ArrowUp') && gameState === 'playing') {
    e.preventDefault();
    if (paused) { togglePause(); return; }
    flap();
    return;
  }
  if (e.code === 'Space' && gameState === 'playing' && paused) {
    e.preventDefault();
    togglePause();
  }
});

stageEl.addEventListener('pointerdown', (e) => {
  // Tutorial advance (but not if tutorial is blocking — let menu clicks through after tutorial)
  if (tutorialActive && (gameState === 'menu' || gameState === 'ready' || gameState === 'loading')) {
    tutorialStep++;
    if (tutorialStep >= 2) {
      tutorialActive = false;
      tutorialStep   = 0;
      localStorage.setItem('mochi-bird-tutorial', 'done');
    }
    return;
  }

  // Main menu hit-testing
  if (gameState === 'menu') {
    const rect = canvas.getBoundingClientRect();
    const px   = (e.clientX - rect.left) * (W / rect.width);
    const py   = (e.clientY - rect.top)  * (H / rect.height);
    handleMenuClick(px, py);
    return;
  }

  if (gameState === 'countdown') {
    e.preventDefault();
    return;
  }
  if (gameState === 'playing') {
    e.preventDefault();
    if (paused) { togglePause(); return; }
    flap();
  }
}, { passive: false });

refreshBtn.addEventListener('click', () => fetchLeaderboard());

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

    ctx.fillStyle = 'rgba(255,248,252,0.92)';
    ctx.beginPath();
    ctx.arc(0,   0,  20, 0, Math.PI * 2);
    ctx.arc(22, -9,  25, 0, Math.PI * 2);
    ctx.arc(45,  0,  17, 0, Math.PI * 2);
    ctx.arc(23,  9,  21, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,170,200,0.45)';
    ctx.beginPath(); ctx.ellipse(11,  8, 5.5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(34,  8, 5.5, 3.5, 0, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#5a3a2a';
    if (c.face === 1) {
      ctx.beginPath(); ctx.arc(17, 2, 2.8, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#5a3a2a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(28, 2, 2.8, Math.PI, 0); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(17, 2, 2.8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(28, 2, 2.8, 0, Math.PI * 2); ctx.fill();
    }

    ctx.strokeStyle = '#5a3a2a'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(22.5, 4, 5, 0.15, Math.PI - 0.15); ctx.stroke();

    ctx.restore();
  }
}

function drawPipe(x, y, w, h, isTop) {
  const collar = 18, collarX = x - 5, collarW = w + 10;

  if (isTop) {
    ctx.fillStyle = '#ff6eb4';
    roundRect(x, y, w, h - collar, 8); ctx.fill();
    ctx.fillStyle = 'rgba(255,200,230,0.5)';
    ctx.fillRect(x + 7, y, 9, h - collar);
    ctx.fillStyle = '#d44a90';
    roundRect(collarX, y + h - collar, collarW, collar, 7); ctx.fill();
    ctx.fillStyle = '#ff6eb4';
    roundRect(collarX + 3, y + h - collar + 3, collarW - 6, collar - 5, 5); ctx.fill();
    ctx.fillStyle = 'rgba(255,200,230,0.4)';
    ctx.fillRect(collarX + 8, y + h - collar + 3, 9, collar - 5);
    ctx.fillStyle = '#b83578';
    ctx.beginPath(); ctx.ellipse(x + w/2, y + h - collar + 5, w/2 - 3, 7, 0, 0, Math.PI * 2); ctx.fill();
    if (h > 50) drawHeart(x + w/2, y + (h - collar) * 0.5, 5, 'rgba(255,210,230,0.75)');

  } else {
    ctx.fillStyle = '#d44a90';
    roundRect(collarX, y, collarW, collar, 7); ctx.fill();
    ctx.fillStyle = '#ff6eb4';
    roundRect(collarX + 3, y + 3, collarW - 6, collar - 5, 5); ctx.fill();
    ctx.fillStyle = 'rgba(255,200,230,0.4)';
    ctx.fillRect(collarX + 8, y + 3, 9, collar - 5);
    ctx.fillStyle = '#b83578';
    ctx.beginPath(); ctx.ellipse(x + w/2, y + collar - 5, w/2 - 3, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff6eb4';
    roundRect(x, y + collar, w, h - collar, 8); ctx.fill();
    ctx.fillStyle = 'rgba(255,200,230,0.5)';
    ctx.fillRect(x + 7, y + collar, 9, h - collar);
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

  const g = ctx.createLinearGradient(0, y, 0, H);
  g.addColorStop(0, '#ff8fb8');
  g.addColorStop(1, '#ff6ea0');
  ctx.fillStyle = g;
  ctx.fillRect(0, y, W, GROUND_H);

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

  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < count; i++) {
    const hx = -scallop + i * scallop - offset + scallop / 2;
    const hy = y + 3;
    drawHeart(hx, hy, 2.8, 'rgba(255,255,255,0.55)');
  }
}

function drawBird(overrideY, overrideTilt) {
  const isStationary = (gameState === 'menu' || gameState === 'ready' || gameState === 'dead' || gameState === 'countdown');
  const displayY = overrideY !== undefined ? overrideY
    : isStationary ? bird.y + Math.sin(elapsedMs * 0.003) * 8
    : bird.y;

  let tilt;
  if (overrideTilt !== undefined) {
    tilt = overrideTilt;
  } else if (gameState === 'dying') {
    tilt = clamp(bird.vy / 300, -0.6, 0.8);
  } else {
    tilt = clamp(bird.vy / 400, -0.6, 0.8);
  }

  // Magnet range indicator
  if (activePowerups.magnet > 0) {
    const alpha = 0.15 + Math.sin(elapsedMs * 0.006) * 0.12;
    ctx.save();
    ctx.strokeStyle = `rgba(255,200,87,${alpha})`;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(bird.x, displayY, 90, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  ctx.save();
  ctx.translate(bird.x, displayY);
  ctx.rotate(tilt);

  // Shield flash effect
  if (shieldFlash > 0) {
    ctx.globalAlpha = shieldFlash / 0.3;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0, 0, bird.r * 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  const displaySkin = (animSkinList.length > 1) ? animSkinList[animFrame] : currentSkin;
  const img = displaySkin?.img || currentSkin.img;
  if (img && img.complete && img.naturalWidth > 0) {
    const displayH = bird.r * 5.2;
    const displayW = displayH * (img.naturalWidth / img.naturalHeight);
    // Circle-clip so any white/opaque background in the sprite is hidden
    const clipR = bird.r * 2.3;
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, clipR, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, -displayW / 2, -displayH * 0.48, displayW, displayH);
    ctx.restore();
  } else {
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

    if (canSprite.complete && canSprite.naturalWidth > 0) {
      const dw = r * 4.0, dh = r * 5.8;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r * 2.0, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(canSprite, x - dw / 2, y - dh * 0.50, dw, dh);
      ctx.restore();
    } else {
      // Fallback geometric can
      const h = r * 2.2;
      ctx.fillStyle = '#e8333a';
      roundRect(x - r, y - h / 2, r * 2, h, 3);
      ctx.fill();
      ctx.fillStyle = '#c0c8d0';
      ctx.fillRect(x - r, y - h / 2, r * 2, h * 0.18);
      ctx.fillStyle = '#c0c8d0';
      ctx.fillRect(x - r, y + h / 2 - h * 0.18, r * 2, h * 0.18);
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(x - r * 0.6, y - h / 2 + h * 0.18, r * 0.4, h * 0.64);
      ctx.fillStyle = '#a8b2ba';
      ctx.beginPath();
      ctx.ellipse(x, y - h / 2, r, r * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawParticles() {
  for (const p of particles) {
    const alpha = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle   = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawPowerups() {
  for (const p of powerups) {
    if (p.collected) continue;
    ctx.save();
    ctx.translate(p.x, p.y);

    // Glow
    const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 16);
    let col;
    if (p.type === 'magnet')      col = '#ff6eb4';
    else if (p.type === 'shield') col = '#4af0f0';
    else                           col = '#c47aff';

    glow.addColorStop(0, col + 'cc');
    glow.addColorStop(1, col + '00');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fill();

    // Circle
    ctx.strokeStyle = col;
    ctx.lineWidth   = 2;
    ctx.fillStyle   = col + '44';
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Label
    ctx.fillStyle   = '#fff';
    ctx.font        = '11px sans-serif';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    const label = p.type === 'magnet' ? '🧲' : p.type === 'shield' ? '🛡' : '🐌';
    ctx.fillText(label, 0, 0);

    ctx.restore();
  }
}

function drawActivePowerupHUD() {
  const items = [];
  if (activePowerups.magnet > 0) items.push({ label: '🧲', timer: activePowerups.magnet, max: 6, col: '#ff6eb4' });
  if (activePowerups.shield)     items.push({ label: '🛡', timer: 1, max: 1, col: '#4af0f0' });
  if (activePowerups.slow > 0)   items.push({ label: '🐌', timer: activePowerups.slow, max: 5, col: '#c47aff' });

  let ox = W / 2 - (items.length * 44) / 2;
  for (const item of items) {
    ctx.save();
    ctx.translate(ox + 22, 50);
    ctx.fillStyle   = 'rgba(0,0,0,0.45)';
    roundRect(-20, -16, 40, 32, 8); ctx.fill();
    ctx.fillStyle   = '#fff';
    ctx.font        = '14px sans-serif';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.label, 0, -2);
    // Timer bar
    const pct = item.timer / item.max;
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    roundRect(-16, 10, 32, 4, 2); ctx.fill();
    ctx.fillStyle = item.col;
    roundRect(-16, 10, 32 * pct, 4, 2); ctx.fill();
    ctx.restore();
    ox += 44;
  }
}

function drawComboHUD() {
  if (combo < 5) return;
  ctx.save();
  ctx.textAlign   = 'right';
  ctx.textBaseline = 'top';
  const pulse = 1 + Math.sin(elapsedMs * 0.008) * 0.06;
  ctx.scale(1, 1);
  ctx.font        = `bold ${Math.round(18 * pulse)}px "Trebuchet MS", sans-serif`;
  ctx.fillStyle   = '#ffc857';
  ctx.strokeStyle = '#a06000';
  ctx.lineWidth   = 3;
  ctx.strokeText(`🔥 ${combo}x`, W - 10, 54);
  ctx.fillText(`🔥 ${combo}x`, W - 10, 54);
  ctx.restore();
}

function drawNewBestBanner() {
  if (!newBestAchieved || newBestAnimTimer <= 0) return;
  const alpha = Math.min(1, newBestAnimTimer / 0.5);
  const pulse = 1 + Math.sin(elapsedMs * 0.01) * 0.07;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign   = 'center';
  ctx.textBaseline = 'middle';
  const fs = Math.round(28 * pulse);
  ctx.font = `900 ${fs}px "Trebuchet MS", sans-serif`;
  ctx.strokeStyle = '#b03070';
  ctx.lineWidth   = 5;
  ctx.strokeText('✨ NEW BEST!', W / 2, H * 0.22);
  ctx.fillStyle   = '#ffc857';
  ctx.fillText('✨ NEW BEST!', W / 2, H * 0.22);
  ctx.restore();
}

function drawCountdown() {
  if (gameState !== 'countdown') return;
  ctx.save();
  ctx.textAlign   = 'center';
  ctx.textBaseline = 'middle';

  const pulse = 1 + Math.sin(countdownTimer * Math.PI * 2) * 0.15;
  const label = countdownVal <= 0 ? 'GO!' : String(countdownVal);
  const fs    = Math.round(80 * pulse);

  ctx.font        = `900 ${fs}px "Trebuchet MS", sans-serif`;
  ctx.strokeStyle = '#ff69b4';
  ctx.lineWidth   = 8;
  ctx.lineJoin    = 'round';
  ctx.strokeText(label, W / 2, H / 2);
  ctx.fillStyle   = '#fff';
  ctx.fillText(label, W / 2, H / 2);
  ctx.restore();
}

function drawTutorial() {
  if (!tutorialActive) return;
  // semi-transparent overlay
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign   = 'center';
  ctx.textBaseline = 'middle';

  if (tutorialStep === 0) {
    ctx.font      = `bold 28px "Trebuchet MS", sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.fillText('👆 Tap to flap!', W / 2, H / 2 - 20);

    // Animated arrow
    const ay = H / 2 + 30 + Math.sin(elapsedMs * 0.005) * 10;
    ctx.font      = '36px sans-serif';
    ctx.fillText('⬇', W / 2, ay);

    ctx.font      = '14px "Trebuchet MS", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('Tap anywhere to continue', W / 2, H / 2 + 90);
  } else {
    ctx.font      = `bold 22px "Trebuchet MS", sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.fillText('🥫 Collect cans to unlock', W / 2, H / 2 - 30);
    ctx.fillText('skins in the Shop!', W / 2, H / 2 + 10);

    ctx.font      = '14px "Trebuchet MS", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('Tap to start', W / 2, H / 2 + 70);
  }
}

function drawRunSparkline() {
  if (runHistory.length < 2) return;
  const sparkW = 120, sparkH = 50;
  const sx = W / 2 - sparkW / 2;
  const sy = H * 0.82;

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  roundRect(sx - 6, sy - 22, sparkW + 12, sparkH + 30, 8);
  ctx.fill();

  ctx.font      = '11px "Trebuchet MS", sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`Last ${runHistory.length} runs`, W / 2, sy - 4);

  const minV = Math.min(...runHistory);
  const maxV = Math.max(...runHistory);
  const range = Math.max(1, maxV - minV);
  const step  = sparkW / (runHistory.length - 1);

  ctx.strokeStyle = '#ffc857';
  ctx.lineWidth   = 2;
  ctx.beginPath();
  runHistory.forEach((v, i) => {
    const px = sx + i * step;
    const py = sy + sparkH - ((v - minV) / range) * sparkH;
    if (i === 0) ctx.moveTo(px, py);
    else         ctx.lineTo(px, py);
  });
  ctx.stroke();

  // Dots
  ctx.fillStyle = '#fff';
  runHistory.forEach((v, i) => {
    const px = sx + i * step;
    const py = sy + sparkH - ((v - minV) / range) * sparkH;
    ctx.beginPath();
    ctx.arc(px, py, 2.5, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}

function drawPauseOverlay() {
  if (!paused) return;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign   = 'center';
  ctx.textBaseline = 'middle';
  ctx.font        = `900 48px "Trebuchet MS", sans-serif`;
  ctx.strokeStyle = '#b03070';
  ctx.lineWidth   = 6;
  ctx.strokeText('PAUSED', W / 2, H / 2 - 20);
  ctx.fillStyle   = '#fff';
  ctx.fillText('PAUSED', W / 2, H / 2 - 20);

  ctx.font      = '16px "Trebuchet MS", sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.fillText('tap or press Space to resume', W / 2, H / 2 + 24);
}

function drawDim() {
  if (gameState === 'playing' || gameState === 'dying' || gameState === 'countdown') return;
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

// ── Main menu ──────────────────────────────────────────────────────────────────
function drawMenuBtn(label, x, y, w, h, bg, shadow) {
  const r = h / 2;
  // Drop shadow
  ctx.fillStyle = shadow || 'rgba(0,0,0,0.22)';
  roundRect(x + 2, y + 5, w, h, r);
  // Body
  ctx.fillStyle = bg;
  roundRect(x, y, w, h, r);
  // Top highlight
  ctx.fillStyle = 'rgba(255,255,255,0.30)';
  roundRect(x + 4, y + 4, w - 8, h * 0.42, r * 0.6);
  // Label
  const fs = clamp(h * 0.40, 14, 20);
  ctx.font        = `800 ${fs}px "Trebuchet MS", Verdana, sans-serif`;
  ctx.fillStyle   = '#fff';
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth   = 3;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeText(label, x + w / 2, y + h / 2 + 1);
  ctx.fillText  (label, x + w / 2, y + h / 2);
}

function drawIconBtn(icon, cx, cy, r, bg) {
  ctx.fillStyle = 'rgba(0,0,0,0.20)';
  ctx.beginPath(); ctx.arc(cx + 1, cy + 3, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.30)';
  ctx.beginPath(); ctx.arc(cx - r * 0.22, cy - r * 0.25, r * 0.58, 0, Math.PI * 2); ctx.fill();
  ctx.font = `${r * 0.92}px sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText(icon, cx, cy + r * 0.06);
}

function drawMainMenu() {
  menuBtns = [];

  // ── Background ────────────────────────────────────────────────
  drawSky();
  drawBuildings();
  drawClouds();

  // Slim decorative pipes — only top-hanging, kept narrow
  const pw = PIPE_W * 0.70;
  drawPipe(W * 0.02,            0, pw, H * 0.22, true);
  drawPipe(W - pw - W * 0.02,   0, pw, H * 0.17, true);

  drawGround();

  // ── Title area (top 32% of canvas) ────────────────────────────
  const titleCX = W / 2;
  const titleCY = H * 0.16;

  // Cloud backdrop
  ctx.save();
  ctx.translate(titleCX, titleCY);
  ctx.fillStyle = 'rgba(255,238,250,0.84)';
  ctx.beginPath();
  ctx.arc(0,   0,  48, 0, Math.PI * 2);
  ctx.arc( 42,-10,  34, 0, Math.PI * 2);
  ctx.arc(-42,-10,  34, 0, Math.PI * 2);
  ctx.arc( 62,  6,  22, 0, Math.PI * 2);
  ctx.arc(-62,  6,  22, 0, Math.PI * 2);
  ctx.arc( 16,-32,  28, 0, Math.PI * 2);
  ctx.arc(-16,-32,  28, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin  = 'round';

  // "MOCHI"
  const fs1 = clamp(W * 0.105, 22, 46);
  ctx.font = `900 ${fs1}px "Trebuchet MS", Verdana, sans-serif`;
  ctx.strokeStyle = '#c0387a'; ctx.lineWidth = 7;
  ctx.strokeText('MOCHI', titleCX, titleCY - fs1 * 0.60);
  ctx.fillStyle = '#fff';
  ctx.fillText('MOCHI', titleCX, titleCY - fs1 * 0.60);

  // "BIRD"
  const fs2 = clamp(W * 0.135, 28, 58);
  ctx.font = `900 ${fs2}px "Trebuchet MS", Verdana, sans-serif`;
  ctx.strokeStyle = '#8a4000'; ctx.lineWidth = 8;
  ctx.strokeText('BIRD', titleCX, titleCY + fs2 * 0.55);
  ctx.fillStyle = '#ffd84d';
  ctx.fillText('BIRD', titleCX, titleCY + fs2 * 0.55);

  drawHeart(titleCX - fs2 * 1.05, titleCY + fs2 * 0.55, 5, '#ff6eb4');
  drawHeart(titleCX + fs2 * 1.05, titleCY + fs2 * 0.55, 5, '#ff6eb4');

  // ── Bird portrait (between title and buttons) ─────────────────
  const birdImg = (animSkinList.length > 1 ? animSkinList[animFrame] : currentSkin)?.img
                  || currentSkin.img;
  const birdCR  = clamp(W * 0.085, 26, 38); // portrait circle radius
  const birdCX  = W / 2;
  const birdCY  = H * 0.355 + Math.sin(elapsedMs * 0.003) * 5;

  // Circle border/glow
  ctx.save();
  ctx.shadowColor  = 'rgba(255,110,180,0.55)';
  ctx.shadowBlur   = 12;
  ctx.fillStyle    = 'rgba(255,220,240,0.30)';
  ctx.beginPath();
  ctx.arc(birdCX, birdCY, birdCR + 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Draw sprite clipped to circle
  if (birdImg && birdImg.complete && birdImg.naturalWidth > 0) {
    const dh = birdCR * 4.2;
    const dw = dh * (birdImg.naturalWidth / birdImg.naturalHeight);
    ctx.save();
    ctx.beginPath();
    ctx.arc(birdCX, birdCY, birdCR, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(birdImg, birdCX - dw / 2, birdCY - dh * 0.48, dw, dh);
    ctx.restore();
  }

  // Circle ring
  ctx.strokeStyle = '#ff6eb4';
  ctx.lineWidth   = 2.5;
  ctx.beginPath();
  ctx.arc(birdCX, birdCY, birdCR, 0, Math.PI * 2);
  ctx.stroke();

  // Ambient floating hearts
  const t = elapsedMs / 1000;
  [[0.14, 0.42], [0.84, 0.36], [0.88, 0.56]].forEach(([rx, ry], i) => {
    drawHeart(W * rx, H * ry - Math.sin(t * 0.9 + i * 1.6) * 6, 3.5, 'rgba(255,120,180,0.50)');
  });

  // ── Buttons (start at 43%, evenly spaced to leave room for icons) ─
  const usableH  = (H - GROUND_H) * 0.98;  // canvas playable height
  const btnZoneT = usableH * 0.43;          // buttons start here
  const iconZoneH= clamp(W * 0.14, 48, 68); // space reserved for icon row
  const btnZoneB = usableH - iconZoneH - 8;  // buttons end here
  const totalBtnH= btnZoneB - btnZoneT;

  const btnCount = 4;                        // PLAY, SHOP, BIRDIES, SETTINGS
  const btnH     = clamp(totalBtnH / (btnCount + 0.8), 38, 54);
  const gap      = (totalBtnH - btnH * btnCount) / (btnCount - 1);
  const btnW     = clamp(W * 0.60, 170, 270);
  const btnX     = W / 2 - btnW / 2;
  const playW    = btnW * 1.05;
  let   by       = btnZoneT;

  // PLAY
  drawMenuBtn('♥  PLAY', W / 2 - playW / 2, by, playW, btnH * 1.12, '#ff6eb4', '#a02060');
  menuBtns.push({ id: 'play',     x: W/2 - playW/2, y: by, w: playW, h: btnH * 1.12 });
  by += btnH * 1.12 + gap;

  // SHOP
  drawMenuBtn('🛒  SHOP', btnX, by, btnW, btnH, '#c084fc', '#6030a0');
  menuBtns.push({ id: 'shop',     x: btnX, y: by, w: btnW, h: btnH });
  by += btnH + gap;

  // BIRDIES
  drawMenuBtn('🐦  BIRDIES', btnX, by, btnW, btnH, '#4dc8ff', '#1880b0');
  menuBtns.push({ id: 'birdies',  x: btnX, y: by, w: btnW, h: btnH });
  by += btnH + gap;

  // SETTINGS
  drawMenuBtn('⚙️  SETTINGS', btnX, by, btnW, btnH, '#ffb347', '#b06010');
  menuBtns.push({ id: 'settings', x: btnX, y: by, w: btnW, h: btnH });

  // ── Icon circles (sit between bottom of buttons and ground) ───
  const iconR = clamp(W * 0.060, 20, 28);
  const iconY = H - GROUND_H - iconR - 8;

  drawIconBtn('🏆', W * 0.14,  iconY, iconR, '#ffc857');
  menuBtns.push({ id: 'leaderboard', x: W*0.14 - iconR, y: iconY - iconR, w: iconR*2, h: iconR*2 });

  drawIconBtn('📊', W * 0.28,  iconY, iconR, '#c084fc');
  menuBtns.push({ id: 'stats',       x: W*0.28 - iconR, y: iconY - iconR, w: iconR*2, h: iconR*2 });

  drawIconBtn('🎯', W * 0.72,  iconY, iconR, '#ff6eb4');
  menuBtns.push({ id: 'challenges',  x: W*0.72 - iconR, y: iconY - iconR, w: iconR*2, h: iconR*2 });

  drawIconBtn('🎁', W * 0.86,  iconY, iconR, '#4dc8ff');
  menuBtns.push({ id: 'daily',       x: W*0.86 - iconR, y: iconY - iconR, w: iconR*2, h: iconR*2 });
}

function handleMenuClick(px, py) {
  for (const btn of menuBtns) {
    if (px >= btn.x && px <= btn.x + btn.w && py >= btn.y && py <= btn.y + btn.h) {
      switch (btn.id) {
        case 'play':
          countdownVal = 3; countdownTimer = 0;
          setGameState('countdown');
          startMusic();
          break;
        case 'shop':
        case 'birdies':
          openStore();
          break;
        case 'settings':
          syncSettingsUI();
          settingsModalEl.classList.remove('hidden');
          break;
        case 'stats':
          renderStats();
          statsModalEl.classList.remove('hidden');
          break;
        case 'challenges':
          renderChallengesModal();
          challengesModalEl.classList.remove('hidden');
          break;
        case 'leaderboard':
          // Scroll into view on desktop, or just show a toast with info
          lbTabAllEl?.click();
          showToast('Check the leaderboard on the right →');
          break;
        case 'daily':
          showToast(`🔥 Streak: Day ${streakCount}  •  🥫 ${lifetimeCans} cans`);
          break;
      }
      return;
    }
  }
}

// ── Startup screen ─────────────────────────────────────────────────────────────
function drawStartupScreen() {
  drawSky();
  drawBuildings();

  drawPipe(W * 0.04,        0, PIPE_W, H * 0.30, true);
  drawPipe(W - PIPE_W - W * 0.04, 0, PIPE_W, H * 0.22, true);
  drawPipe(W * 0.07,        H * 0.60, PIPE_W, H - GROUND_H - H * 0.60, false);
  drawPipe(W - PIPE_W - W * 0.07, H * 0.58, PIPE_W, H - GROUND_H - H * 0.58, false);

  drawClouds();

  ctx.save();
  ctx.strokeStyle = 'rgba(220,180,255,0.30)';
  ctx.lineWidth   = 28;
  ctx.beginPath();
  ctx.arc(W / 2, H * 0.72, W * 0.38, Math.PI, 0);
  ctx.stroke();
  ctx.restore();

  drawGround();

  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  const fs1 = clamp(W * 0.13, 28, 58);
  const titleY = H * 0.24;

  ctx.font        = `900 ${fs1}px "Trebuchet MS", Verdana, sans-serif`;
  ctx.strokeStyle = '#b03070';
  ctx.lineWidth   = 8;
  ctx.lineJoin    = 'round';
  ctx.strokeText('MOCHI', W / 2, titleY - fs1 * 0.6);
  ctx.fillStyle   = '#fff';
  ctx.fillText   ('MOCHI', W / 2, titleY - fs1 * 0.6);

  const fs2 = clamp(W * 0.165, 34, 72);
  ctx.font        = `900 ${fs2}px "Trebuchet MS", Verdana, sans-serif`;
  ctx.strokeStyle = '#b03070';
  ctx.lineWidth   = 10;
  ctx.strokeText('BIRD', W / 2, titleY + fs2 * 0.55);
  ctx.fillStyle   = '#fff';
  ctx.fillText   ('BIRD', W / 2, titleY + fs2 * 0.55);

  ctx.fillStyle = 'rgba(255,160,200,0.22)';
  ctx.font = `900 ${fs1}px "Trebuchet MS", Verdana, sans-serif`;
  ctx.fillText('MOCHI', W / 2, titleY - fs1 * 0.6);
  ctx.font = `900 ${fs2}px "Trebuchet MS", Verdana, sans-serif`;
  ctx.fillText('BIRD',  W / 2, titleY + fs2 * 0.55);

  drawHeart(W / 2 - fs2 * 1.05, titleY + fs2 * 0.55, 6, '#ff6eb4');
  drawHeart(W / 2 + fs2 * 1.05, titleY + fs2 * 0.55, 6, '#ff6eb4');

  const t = elapsedMs / 1000;
  [[0.2, 0.38], [0.78, 0.30], [0.88, 0.52], [0.14, 0.55]].forEach(([rx, ry], i) => {
    const fy = H * ry - Math.sin(t * 0.9 + i * 1.4) * 7;
    drawHeart(W * rx, fy, 4 + (i % 2) * 2, 'rgba(255,120,180,0.65)');
  });

  const barW = W * 0.62, barH = 20;
  const barX = W / 2 - barW / 2;
  const barY = H * 0.74;

  ctx.font        = `800 ${clamp(W * 0.048, 12, 18)}px "Trebuchet MS", Verdana, sans-serif`;
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth   = 4;
  ctx.strokeText('LOADING...', W / 2, barY - 16);
  ctx.fillStyle   = '#c04080';
  ctx.fillText   ('LOADING...', W / 2, barY - 16);

  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  roundRect(barX, barY, barW, barH, barH / 2);
  ctx.strokeStyle = '#ff6eb4';
  ctx.lineWidth   = 2;
  ctx.stroke();

  const fillW = Math.max(barH, (barW - 4) * startupProgress);
  const fg = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
  fg.addColorStop(0, '#ffaad0');
  fg.addColorStop(1, '#ff5da0');
  ctx.fillStyle = fg;
  ctx.save();
  ctx.beginPath();
  const r2 = (barH - 4) / 2;
  ctx.roundRect
    ? ctx.roundRect(barX + 2, barY + 2, fillW, barH - 4, r2)
    : (roundRect(barX + 2, barY + 2, fillW, barH - 4, r2), ctx.restore(), ctx.save());
  ctx.fill();
  ctx.restore();

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

  // Apply screen shake
  const doShake = shakeAmt > 0;
  if (doShake) {
    ctx.save();
    const sx = (Math.random() - 0.5) * 2 * shakeAmt;
    const sy = (Math.random() - 0.5) * 2 * shakeAmt;
    ctx.translate(sx, sy);
    shakeAmt = Math.max(0, shakeAmt - 1.2);
  }

  if (gameState === 'loading') {
    drawStartupScreen();
  } else if (gameState === 'menu') {
    drawMainMenu();
    if (tutorialActive) drawTutorial();
  } else {
    drawSky();
    drawBuildings();
    drawClouds();
    drawPipes();
    drawGround();
    drawPowerups();
    drawParticles();
    drawCans();
    drawBird();
    drawDim();

    // HUD overlays
    if (gameState === 'playing' || gameState === 'dying') {
      drawActivePowerupHUD();
      drawComboHUD();
      drawNewBestBanner();
    }

    // Countdown overlay
    if (gameState === 'countdown') {
      drawCountdown();
    }

    // Pause overlay
    if (gameState === 'playing') {
      drawPauseOverlay();
    }

    // Dead state sparkline
    if (gameState === 'dead') {
      drawRunSparkline();
    }

    // Tutorial
    if (tutorialActive && (gameState === 'menu' || gameState === 'ready')) {
      drawTutorial();
    }
  }

  if (doShake) ctx.restore();

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
  // update() transitions to 'menu' (not 'ready') once bar reaches 1
}

async function loadSession() {
  resetGame();

  console.log('[boot] Starting session load...');

  try {
    let discordUserId = null;

    if (window.discord?.user?.id) {
      discordUserId = window.discord.user.id;
      console.log('[boot] Got Discord user ID from native API:', discordUserId);
    }

    if (!sessionId && !sessionToken) {
      try {
        console.log('[boot] No session params, trying to auto-link to pending Activity session');
        const res = await fetch('/api/session/pending-activity');
        const data = await res.json();
        if (res.ok && data.session) {
          sessionData = data.session;
          sessionId = sessionData.id;
          console.log('[boot] Auto-linked to Activity session:', sessionData.userTag);
        } else {
          throw new Error('No pending session');
        }
      } catch (err) {
        console.log('[boot] Could not auto-link to Activity:', err.message);

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
            isPractice = true;
            signalReady(); fetchLeaderboard(); return;
          }
        } else {
          console.log('[boot] No session found - using practice mode');
          bestScoreKey = 'mochi-bird-best-practice';
          isPractice = true;
          signalReady(); fetchLeaderboard(); return;
        }
      }
    } else {
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
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

try {
  console.log('[boot] Initializing game...');
  applyLayout();
  refreshAnimSkins();
  checkDailyBonus();
  checkStreak();
  initChallenges();
  console.log('[boot] Layout applied');

  resize();
  console.log('[boot] Canvas resized to', W, 'x', H);

  // Check tutorial
  if (!localStorage.getItem('mochi-bird-tutorial')) {
    tutorialActive = true;
    tutorialStep   = 0;
  }

  console.log('[boot] Starting render loop');
  requestAnimationFrame(loop);

  console.log('[boot] Loading session');
  loadSession().catch(err => {
    console.error('[boot] Uncaught loadSession error:', err);
    statusEl.textContent = 'Error: ' + err.message;
    setGameState('error');
  });
} catch (err) {
  console.error('[boot] Critical boot error:', err);
  statusEl.textContent = 'Critical Error: ' + err.message;
  ctx.fillStyle = '#fff';
  ctx.font = '16px sans-serif';
  ctx.fillText('Error: ' + err.message, 20, 40);
}
