const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const bestScoreEl = document.getElementById('bestScore');
const statusEl = document.getElementById('status');
const overlayEl = document.getElementById('overlay');
const overlayTitleEl = document.getElementById('overlayTitle');
const overlayTextEl = document.getElementById('overlayText');
const primaryButton = document.getElementById('primaryButton');
const sessionNoteEl = document.getElementById('sessionNote');
const leaderboardStatusEl = document.getElementById('leaderboardStatus');
const leaderboardListEl = document.getElementById('leaderboardList');
const refreshLeaderboardButton = document.getElementById('refreshLeaderboard');
const stageEl = document.querySelector('.stage');
primaryButton.disabled = true;

const params = new URLSearchParams(window.location.search);
let sessionId = params.get('sid');
let isPracticeMode = !sessionId;

let bestScoreKey = 'discord-mochi-bird-best-practice';
let activityMode = false;
let discordClientId = null;
let discordSdk = null;
let sessionReady = false;
let leaderboardEntries = [];
const mobileViewportQuery = window.matchMedia('(max-width: 720px)');

let session = null;
const birdSprite = new Image();
birdSprite.src = '/assets/avatar.png';

let width = 360;
let height = 640;
let devicePixelRatio = Math.max(1, window.devicePixelRatio || 1);
let animationFrame = 0;
let lastTime = 0;
let started = false;
let gameOver = false;
let submitted = false;
let score = 0;
let bestScore = 0;
let elapsedMs = 0;
let bird = null;
let pipes = [];
let spawnTimer = 0;
let backgroundOffset = 0;
let clouds = [];
let stars = [];
let primaryMode = 'start';

const GRAVITY = 1100;
const FLAP_VELOCITY = -340;
const PIPE_SPEED = 170;
const PIPE_WIDTH = 72;
const PIPE_GAP = 166;
const PIPE_INTERVAL = 1.35;
const GROUND_HEIGHT = 90;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatDiscordUser(user) {
  const username = user?.username || 'Player';
  const discriminator = user?.discriminator && user.discriminator !== '0' ? `#${user.discriminator}` : '';
  const globalName = user?.global_name ? ` (${user.global_name})` : '';
  return `${username}${discriminator}${globalName}`;
}

function hydrateBestScore() {
  bestScore = Number(localStorage.getItem(bestScoreKey) || 0);
  bestScoreEl.textContent = String(bestScore);
}

function setSessionReady(ready) {
  sessionReady = ready;
  if (primaryButton) {
    primaryButton.disabled = !ready;
  }
}

function updateViewportMode() {
  const isMobileViewport = mobileViewportQuery.matches || window.innerWidth <= 720;
  document.body.classList.toggle('mobile-mode', isMobileViewport);
  document.body.classList.toggle('desktop-mode', !isMobileViewport);
}

function safeParseJson(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function formatLeaderboardName(entry) {
  return entry?.userTag || entry?.userId || 'Unknown player';
}

function renderLeaderboard(entries = []) {
  leaderboardEntries = Array.isArray(entries) ? entries : [];

  if (!leaderboardListEl || !leaderboardStatusEl) {
    return;
  }

  leaderboardListEl.innerHTML = '';

  if (!leaderboardEntries.length) {
    leaderboardStatusEl.textContent = 'No scores yet. Be the first to set one.';
    const emptyItem = document.createElement('li');
    emptyItem.className = 'leaderboard-item';
    emptyItem.innerHTML = `
      <span class="leaderboard-rank">-</span>
      <span class="leaderboard-name">Waiting for scores</span>
      <span class="leaderboard-score">0</span>
    `;
    leaderboardListEl.appendChild(emptyItem);
    return;
  }

  leaderboardStatusEl.textContent = `${leaderboardEntries.length} score${leaderboardEntries.length === 1 ? '' : 's'} loaded.`;

  for (const [index, entry] of leaderboardEntries.entries()) {
    const item = document.createElement('li');
    item.className = 'leaderboard-item';
    if (session?.userId && entry.userId === session.userId) {
      item.classList.add('is-player');
    }
    item.innerHTML = `
      <span class="leaderboard-rank">${index + 1}</span>
      <span class="leaderboard-name">${formatLeaderboardName(entry)}</span>
      <span class="leaderboard-score">${Number(entry.bestScore) || 0}</span>
    `;
    leaderboardListEl.appendChild(item);
  }
}

async function loadLeaderboard({ force = false } = {}) {
  if (!force && leaderboardEntries.length) {
    return leaderboardEntries;
  }

  if (leaderboardStatusEl) {
    leaderboardStatusEl.textContent = 'Loading leaderboard...';
  }

  try {
    const response = await fetch('/api/leaderboard', {
      headers: {
        Accept: 'application/json'
      }
    });
    const text = await response.text();
    const payload = safeParseJson(text);
    const entries = Array.isArray(payload?.leaderboard) ? payload.leaderboard : [];
    renderLeaderboard(entries);
    if (!response.ok && response.status !== 404) {
      throw new Error(payload?.error || text || 'Could not load leaderboard');
    }
    return entries;
  } catch (error) {
    leaderboardEntries = [];
    if (leaderboardStatusEl) {
      leaderboardStatusEl.textContent = `Could not load leaderboard: ${error.message}`;
    }
    if (leaderboardListEl) {
      leaderboardListEl.innerHTML = '';
    }
    return [];
  }
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  width = Math.max(1, rect.width);
  height = Math.max(1, rect.height);
  devicePixelRatio = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.floor(width * devicePixelRatio);
  canvas.height = Math.floor(height * devicePixelRatio);
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}

function resetGame() {
  if ((started || gameOver) && !isPracticeMode && sessionId && !submitted && score > 0) {
    void submitScore('reset');
  }

  started = false;
  gameOver = false;
  submitted = false;
  score = 0;
  elapsedMs = 0;
  bird = {
    x: width * 0.28,
    y: height * 0.42,
    radius: 14,
    velocity: 0
  };
  pipes = [];
  spawnTimer = 0.65;
  backgroundOffset = 0;
  clouds = Array.from({ length: 5 }, (_, index) => ({
    x: width * (0.2 + index * 0.22),
    y: height * (0.12 + (index % 2) * 0.08),
    speed: 8 + index * 2,
    size: 0.8 + index * 0.16
  }));
  stars = Array.from({ length: 28 }, (_, index) => ({
    x: (index * 97) % width,
    y: (index * 71) % (height * 0.45),
    r: 0.8 + (index % 3) * 0.5,
    twinkle: 0.3 + (index % 5) * 0.11
  })); 
  scoreEl.textContent = '0';
  hydrateBestScore();
  primaryMode = 'start';
  showOverlay(
    isPracticeMode ? 'Practice mode' : 'Ready to fly',
    isPracticeMode
      ? 'Click or tap to begin. This run stays local until you open a session from Discord.'
      : 'Press Space, click, or tap to start your recorded Discord run.',
    'Start'
  );
}

function showOverlay(title, text, buttonLabel = 'Start') {
  overlayTitleEl.textContent = title;
  overlayTextEl.textContent = text;
  primaryButton.textContent = buttonLabel;
  overlayEl.classList.remove('hidden');
}

function setPrimaryMode(mode) {
  primaryMode = mode;
}

function hideOverlay() {
  overlayEl.classList.add('hidden');
}

function updateStatus(text) {
  statusEl.textContent = text;
}

async function createActivitySession() {
  if (!discordSdk) {
    return null;
  }

  const participantResponse = await discordSdk.commands.getInstanceConnectedParticipants();
  const participants = Array.isArray(participantResponse)
    ? participantResponse
    : participantResponse?.participants || [];
  const participant = participants[0];
  const participantUser = participant?.user || participant;

  if (!participant) {
    throw new Error('No activity participants found');
  }

  const channelResponse = await discordSdk.commands.getChannel({
    channel_id: discordSdk.channelId
  });
  const channel = channelResponse?.channel || channelResponse;

  const response = await fetch('/api/activity/session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      userId: participantUser?.id || participant?.id,
      userTag: formatDiscordUser(participantUser),
      channelId: channel?.id || discordSdk.channelId,
      guildId: channel?.guild_id || channel?.guildId || ''
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Failed to create activity session');
  }

  return payload.session;
}

function addPipe() {
  const topHeight = 60 + Math.random() * (height - GROUND_HEIGHT - PIPE_GAP - 140);
  pipes.push({
    x: width + 30,
    topHeight,
    passed: false
  });
}

function flap() {
  if (gameOver) {
    return;
  }

  if (!sessionReady) {
    return;
  }

  if (!started) {
    started = true;
    hideOverlay();
    updateStatus(isPracticeMode ? 'Practice mode running' : 'Session running');
  }

  bird.velocity = FLAP_VELOCITY;
}

function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function birdBox() {
  return {
    x: bird.x - bird.radius,
    y: bird.y - bird.radius,
    width: bird.radius * 2,
    height: bird.radius * 2
  };
}

function pipeBoxes(pipe) {
  const gapTop = pipe.topHeight;
  const gapBottom = pipe.topHeight + PIPE_GAP;
  return [
    {
      x: pipe.x,
      y: 0,
      width: PIPE_WIDTH,
      height: gapTop
    },
    {
      x: pipe.x,
      y: gapBottom,
      width: PIPE_WIDTH,
      height: height - GROUND_HEIGHT - gapBottom
    }
  ];
}

function endGame(reason) {
  if (gameOver) {
    return;
  }

  gameOver = true;
  started = false;
  updateStatus(`Game over: ${reason}`);
  showOverlay(
    'Game over',
    `You scored ${score}. ${isPracticeMode ? 'Press the button to try again.' : 'This run has been recorded in Discord.'}`,
    isPracticeMode ? 'Play again' : 'Play practice'
  );
  setPrimaryMode(isPracticeMode ? 'practice-restart' : 'practice-open');
  submitScore(reason);
}

async function submitScore(reason) {
  if (isPracticeMode || submitted || !sessionId) {
    return;
  }

  submitted = true;

  try {
    const response = await fetch(`/api/session/${sessionId}/score`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        score,
        durationMs: Math.round(elapsedMs),
        reason
      })
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Failed to submit score');
    }

    const submittedBest = payload.personalBest?.bestScore ?? score;
    bestScore = Math.max(bestScore, submittedBest);
    localStorage.setItem(bestScoreKey, String(bestScore));
    bestScoreEl.textContent = String(bestScore);
    updateStatus(`Score submitted. Personal best: ${submittedBest}.`);
    void loadLeaderboard({ force: true });
  } catch (error) {
    updateStatus(`Could not submit score: ${error.message}`);
  }
}

function update(deltaSeconds) {
  if (!started || gameOver) {
    return;
  }

  elapsedMs += deltaSeconds * 1000;
  bird.velocity += GRAVITY * deltaSeconds;
  bird.y += bird.velocity * deltaSeconds;
  backgroundOffset = (backgroundOffset + PIPE_SPEED * deltaSeconds) % width;

  spawnTimer -= deltaSeconds;
  if (spawnTimer <= 0) {
    addPipe();
    spawnTimer = PIPE_INTERVAL;
  }

  for (const pipe of pipes) {
    pipe.x -= PIPE_SPEED * deltaSeconds;
  }

  pipes = pipes.filter((pipe) => pipe.x > -PIPE_WIDTH - 40);

  const birdBounds = birdBox();

  if (bird.y + bird.radius >= height - GROUND_HEIGHT) {
    bird.y = height - GROUND_HEIGHT - bird.radius;
    endGame('hit the ground');
    return;
  }

  if (bird.y - bird.radius <= 0) {
    bird.y = bird.radius;
    bird.velocity = Math.max(0, bird.velocity);
  }

  for (const pipe of pipes) {
    const [topPipe, bottomPipe] = pipeBoxes(pipe);
    if (rectsOverlap(birdBounds, topPipe) || rectsOverlap(birdBounds, bottomPipe)) {
      endGame('hit a pipe');
      return;
    }

    if (!pipe.passed && pipe.x + PIPE_WIDTH < bird.x - bird.radius) {
      pipe.passed = true;
      score += 1;
      scoreEl.textContent = String(score);
      if (score > bestScore) {
        bestScore = score;
        bestScoreEl.textContent = String(bestScore);
        localStorage.setItem(bestScoreKey, String(bestScore));
      }
    }
  }
}

function drawSky() {
  const skyGradient = ctx.createLinearGradient(0, 0, 0, height);
  skyGradient.addColorStop(0, '#78cffd');
  skyGradient.addColorStop(0.6, '#beeefe');
  skyGradient.addColorStop(1, '#ffe28a');
  ctx.fillStyle = skyGradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = 'rgba(255,255,255,0.32)';
  for (const star of stars) {
    const alpha = 0.3 + Math.sin((elapsedMs / 1000) * star.twinkle + star.x) * 0.2;
    ctx.globalAlpha = clamp(alpha, 0.12, 0.45);
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawCloud(x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  ctx.fillStyle = 'rgba(255,255,255,0.68)';
  ctx.beginPath();
  ctx.arc(0, 0, 18, 0, Math.PI * 2);
  ctx.arc(18, -8, 22, 0, Math.PI * 2);
  ctx.arc(38, 0, 16, 0, Math.PI * 2);
  ctx.arc(20, 8, 19, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPipes() {
  for (const pipe of pipes) {
    const radius = 12;
    const capHeight = 16;

    ctx.fillStyle = '#1d7f52';
    ctx.strokeStyle = '#145337';
    ctx.lineWidth = 4;

    const topHeight = pipe.topHeight;
    const bottomY = pipe.topHeight + PIPE_GAP;
    const bottomHeight = height - GROUND_HEIGHT - bottomY;

    ctx.beginPath();
    roundRect(ctx, pipe.x, 0, PIPE_WIDTH, topHeight, radius, true, false);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    roundRect(ctx, pipe.x - 4, Math.max(0, topHeight - capHeight), PIPE_WIDTH + 8, capHeight, 8, true, false);
    ctx.fillStyle = '#2fd18d';
    ctx.fill();

    ctx.beginPath();
    roundRect(ctx, pipe.x, bottomY, PIPE_WIDTH, bottomHeight, radius, true, false);
    ctx.fillStyle = '#1d7f52';
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    roundRect(ctx, pipe.x - 4, bottomY, PIPE_WIDTH + 8, capHeight, 8, true, false);
    ctx.fillStyle = '#2fd18d';
    ctx.fill();
  }
}

function drawGround() {
  const groundY = height - GROUND_HEIGHT;
  const groundGradient = ctx.createLinearGradient(0, groundY, 0, height);
  groundGradient.addColorStop(0, '#e6c265');
  groundGradient.addColorStop(1, '#c69a3a');
  ctx.fillStyle = groundGradient;
  ctx.fillRect(0, groundY, width, GROUND_HEIGHT);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
  for (let i = -1; i < width / 36 + 2; i += 1) {
    const x = (i * 36 - backgroundOffset * 0.6) % (width + 36);
    ctx.fillRect(x, groundY + 8, 22, 4);
  }
}

function drawBird() {
  if (!bird) return;
  const tilt = clamp(bird.velocity / 400, -0.6, 0.8);
  ctx.save();
  ctx.translate(bird.x, bird.y);
  ctx.rotate(tilt);

  ctx.fillStyle = '#ffd84d';
  ctx.beginPath();
  ctx.arc(0, 0, bird.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffb31f';
  ctx.beginPath();
  ctx.ellipse(-3, 4, 9, 6, -0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#1a2230';
  ctx.beginPath();
  ctx.arc(5, -4, 2.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#f27d2f';
  ctx.beginPath();
  ctx.moveTo(11, -1);
  ctx.lineTo(20, 3);
  ctx.lineTo(11, 7);
  ctx.closePath();
  ctx.fill();

  if (birdSprite.complete && birdSprite.naturalWidth > 0) {
    const size = bird.radius * 2.35;
    ctx.drawImage(birdSprite, -size / 2, -size / 2, size, size);
  }

  ctx.restore();
}

function drawHudOverlay() {
  if (started || gameOver) {
    return;
  }
  ctx.save();
  ctx.fillStyle = 'rgba(7, 16, 24, 0.12)';
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function roundRect(context, x, y, w, h, r, fill = true, stroke = false) {
  if (typeof r === 'number') {
    r = { tl: r, tr: r, br: r, bl: r };
  } else {
    r = { tl: 0, tr: 0, br: 0, bl: 0, ...r };
  }
  context.beginPath();
  context.moveTo(x + r.tl, y);
  context.lineTo(x + w - r.tr, y);
  context.quadraticCurveTo(x + w, y, x + w, y + r.tr);
  context.lineTo(x + w, y + h - r.br);
  context.quadraticCurveTo(x + w, y + h, x + w - r.br, y + h);
  context.lineTo(x + r.bl, y + h);
  context.quadraticCurveTo(x, y + h, x, y + h - r.bl);
  context.lineTo(x, y + r.tl);
  context.quadraticCurveTo(x, y, x + r.tl, y);
  context.closePath();
  if (fill) {
    context.fill();
  }
  if (stroke) {
    context.stroke();
  }
}

function render() {
  ctx.clearRect(0, 0, width, height);
  drawSky();

  for (const cloud of clouds) {
    cloud.x -= cloud.speed * 0.008;
    if (cloud.x < -120) {
      cloud.x = width + 120;
      cloud.y = height * (0.12 + Math.random() * 0.18);
    }
    drawCloud(cloud.x, cloud.y, cloud.size);
  }

  drawPipes();
  drawGround();
  drawBird();
  drawHudOverlay();
}

function loop(timestamp) {
  if (!lastTime) {
    lastTime = timestamp;
  }

  const deltaSeconds = Math.min(0.033, (timestamp - lastTime) / 1000);
  lastTime = timestamp;

  update(deltaSeconds);
  render();
  animationFrame = requestAnimationFrame(loop);
}

async function loadSession() {
  setSessionReady(false);
  try {
    const configResponse = await fetch('/api/config');
    const configPayload = await configResponse.json();
    if (configResponse.ok) {
      activityMode = Boolean(configPayload.activityMode);
      discordClientId = configPayload.discordClientId;
    }
  } catch {
    // Config lookup is optional.
  }

  if (activityMode && discordClientId) {
    try {
      const sdkModule = await import('https://cdn.jsdelivr.net/npm/@discord/embedded-app-sdk/+esm');
      discordSdk = new sdkModule.DiscordSDK(discordClientId);
      await discordSdk.ready();
      updateStatus('Discord Activity ready');
      sessionNoteEl.textContent = 'Running inside Discord as an Activity.';
      if (!sessionId) {
        const activitySession = await createActivitySession();
        sessionId = activitySession.id;
        isPracticeMode = false;
        session = activitySession;
        bestScoreKey = `discord-mochi-bird-best-${session.userId}`;
        const bestResponse = await fetch(`/api/leaderboard/${session.userId}`);
        if (bestResponse.ok) {
          const bestPayload = await bestResponse.json();
          if (bestPayload?.entry?.bestScore !== undefined) {
            bestScore = Number(bestPayload.entry.bestScore) || 0;
            localStorage.setItem(bestScoreKey, String(bestScore));
          }
        }
        sessionNoteEl.textContent = `Activity session created for ${session.userTag}.`;
        updateStatus(`Ready for ${session.userTag}`);
      }
      void loadLeaderboard({ force: true });
    } catch (error) {
      updateStatus(`Discord Activity handshake failed: ${error.message}`);
    }
  }

  if (!sessionId && isPracticeMode) {
    updateStatus(activityMode ? 'Activity practice ready' : 'Practice mode ready');
    if (!activityMode) {
      sessionNoteEl.textContent = 'Practice mode: this run is local only.';
    }
    resetGame();
    setSessionReady(true);
    void loadLeaderboard();
    return;
  }

  try {
    const response = await fetch(`/api/session/${sessionId}`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Session not found');
    }

    session = payload.session;
    bestScoreKey = `discord-mochi-bird-best-${session.userId}`;
    sessionNoteEl.textContent = `Session linked to ${session.userTag}.`;
    updateStatus(`Ready for ${session.userTag}`);
    try {
      const bestResponse = await fetch(`/api/leaderboard/${session.userId}`);
      if (bestResponse.ok) {
        const bestPayload = await bestResponse.json();
        if (bestPayload?.entry?.bestScore !== undefined) {
          bestScore = Number(bestPayload.entry.bestScore) || 0;
          localStorage.setItem(bestScoreKey, String(bestScore));
        }
      }
    } catch {
      // Best score lookup is optional.
    }
    resetGame();
    setSessionReady(true);
    void loadLeaderboard({ force: true });
  } catch (error) {
    updateStatus(`Session error: ${error.message}`);
    resetGame();
    setPrimaryMode('reload');
    showOverlay(
      'Session unavailable',
      'The Discord session is missing or expired. Open a fresh run from the bot.',
      'Reload'
    );
    setSessionReady(true);
  }
}

function onPrimaryAction() {
  if (primaryMode === 'reload') {
    window.location.reload();
    return;
  }

  if (primaryMode === 'practice-open') {
    window.location.href = '/play';
    return;
  }

  if (gameOver && isPracticeMode) {
    resetGame();
    hideOverlay();
    return;
  }

  if (!started) {
    flap();
  }
}

window.addEventListener('resize', () => {
  resizeCanvas();
  resetGame();
  updateViewportMode();
});

window.addEventListener('keydown', (event) => {
  if (event.code === 'Space' || event.code === 'ArrowUp') {
    event.preventDefault();
    flap();
  }
  if (event.code === 'KeyR' && isPracticeMode && gameOver) {
    resetGame();
    hideOverlay();
  }
});

function handleInput(event) {
  if (event.cancelable) {
    event.preventDefault();
  }
  flap();
}

stageEl?.addEventListener('pointerdown', handleInput);
stageEl?.addEventListener('touchstart', handleInput, { passive: false });

refreshLeaderboardButton?.addEventListener('click', () => {
  void loadLeaderboard({ force: true });
});

primaryButton.addEventListener('click', onPrimaryAction);

resizeCanvas();
updateViewportMode();
void loadSession();
animationFrame = requestAnimationFrame(loop);
