import { DiscordSDK } from './vendor/discord-sdk/index.mjs';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const bestScoreEl = document.getElementById('bestScore');
const statusEl = document.getElementById('status');
const overlayEl = document.getElementById('overlay');
const overlayTitleEl = document.getElementById('overlayTitle');
const overlayTextEl = document.getElementById('overlayText');
const sessionNoteEl = document.getElementById('sessionNote');
const debugNoteEl = document.getElementById('debugNote');
const stageEl = document.getElementById('stage');
const overlaySummaryEl = document.getElementById('overlaySummary');
const primaryButton = document.getElementById('primaryButton');
const leaderboardListEl = document.getElementById('leaderboardList');
const leaderboardEmptyEl = document.getElementById('leaderboardEmpty');
const leaderboardStatusEl = document.getElementById('leaderboardStatus');
const leaderboardUpdatedEl = document.getElementById('leaderboardUpdated');
const recentRunsListEl = document.getElementById('recentRunsList');
const recentRunsEmptyEl = document.getElementById('recentRunsEmpty');
const recentRunsUpdatedEl = document.getElementById('recentRunsUpdated');
const canCountEl = document.getElementById('canCount');
const soundToggleEl = document.getElementById('soundToggle');
const wardrobeButtonEl = document.getElementById('wardrobeButton');
const wardrobeModalEl = document.getElementById('wardrobeModal');
const wardrobeBackdropEl = document.getElementById('wardrobeBackdrop');
const wardrobeCloseButtonEl = document.getElementById('wardrobeCloseButton');
const wardrobeGridEl = document.getElementById('wardrobeGrid');
const wardrobeWalletEl = document.getElementById('wardrobeWallet');
const wardrobeSelectedEl = document.getElementById('wardrobeSelected');
const wardrobeOwnedEl = document.getElementById('wardrobeOwned');
const wardrobeStatusEl = document.getElementById('wardrobeStatus');
const bootstrapEl = document.getElementById('mochi-bootstrap');

let bootstrapPayload = null;
if (bootstrapEl?.textContent) {
  try {
    bootstrapPayload = JSON.parse(bootstrapEl.textContent);
  } catch {
    bootstrapPayload = null;
  }
}

const discordClientId = typeof bootstrapPayload?.discordClientId === 'string'
  ? bootstrapPayload.discordClientId.trim()
  : '';

const params = new URLSearchParams(window.location.search);
const likelyDiscordFrame = params.has('frame_id') || params.has('instance_id') || params.has('platform');
const likelyDiscordReferrer = typeof document.referrer === 'string'
  && /discord(?:app)?\.com|ptb\.discord\.com|canary\.discord\.com/i.test(document.referrer);
let sessionId = params.get('sid');
let isPracticeMode = !sessionId;
let session = null;
const activityMode = Boolean(bootstrapPayload?.activityMode || likelyDiscordFrame || likelyDiscordReferrer);
let activityBootstrapState = sessionId ? 'ready' : (activityMode ? 'pending' : 'idle');
let bestScoreKey = 'discord-mochi-bird-best-practice';
let canWalletKey = 'discord-mochi-bird-can-wallet-practice';
let leaderboardCacheKey = 'discord-mochi-bird-leaderboard-cache';
let leaderboardEntries = [];
let leaderboardUpdatedAt = 0;
let recentRunsEntries = [];
let recentRunsUpdatedAt = 0;
let leaderboardRefreshTimer = 0;
let leaderboardLoading = false;
let leaderboardLastFetchAt = 0;
let audioEnabled = localStorage.getItem('discord-mochi-bird-audio') !== 'off';
let audioContext = null;
let musicTimer = 0;
let musicStep = 0;
let canWallet = Number(localStorage.getItem(canWalletKey) || 0);
let runCanCount = 0;
let lastHandledInputAt = 0;
let lastHandledPointerId = null;
let discordBootstrapPromise = null;

if (activityMode && !sessionId) {
  sessionNoteEl.textContent = 'Connecting to Discord...';
}

function updateDebugNote() {
  if (!debugNoteEl) {
    return;
  }

  const modeLabel = activityMode ? 'Activity' : 'Browser';
  const sessionLabel = sessionId
    ? `connected (${session?.userTag || 'pending'})`
    : activityMode
      ? `bootstrap ${activityBootstrapState}`
      : 'none';
  const saveLabel = sessionId ? 'shared' : 'local';
  debugNoteEl.textContent = `Mode: ${modeLabel} | Session: ${sessionLabel} | Save path: ${saveLabel}`;
}

updateDebugNote();

const birdSprite = new Image();
const assetVersion = 'outfits1';
const cosmeticManifestUrl = `./assets/cosmetics/manifest.json?v=${assetVersion}`;
const defaultCosmetic = {
  id: 'avatar-v3',
  label: 'Default Avatar',
  file: 'avatar-v3.png',
  src: `./assets/avatar-v3.png?v=${assetVersion}`,
  cost: 0,
  category: 'Base'
};
const cosmeticCategoryOrder = ['Base', 'Hair Styles', 'Can Outfits', 'Special'];
let cosmeticManifest = [];
let cosmeticCatalog = [defaultCosmetic];
let cosmeticSprites = new Map([[defaultCosmetic.id, birdSprite]]);
let cosmeticState = {
  selectedId: defaultCosmetic.id,
  ownedIds: new Set([defaultCosmetic.id])
};
let cosmeticStorageKey = 'discord-mochi-bird-cosmetics-practice';
let cosmeticManifestReady = false;
let wardrobeNotice = '';
let wardrobeNoticeTimer = 0;
let profileSyncTimer = 0;
let profileSyncInFlight = false;
let profileSyncQueued = false;
let profileSyncReady = false;

birdSprite.src = defaultCosmetic.src;
const canSprite = new Image();
canSprite.src = `./assets/dr-pepper-can-v3.png?v=${assetVersion}`;

let width = 360;
let height = 640;
let dpr = Math.max(1, window.devicePixelRatio || 1);
let raf = 0;
let lastTime = 0;
let started = false;
let gameOver = false;
let submitted = false;
let score = 0;
let bestScore = 0;
let elapsedMs = 0;
let bird = null;
let pipes = [];
let cans = [];
let clouds = [];
let spawnTimer = 0.7;
let canSpawnTimer = 1.1;
let bgOffset = 0;
let particles = [];
let shakeTime = 0;
let shakePower = 0;

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

function resizeCanvas() {
  const rect = stageEl.getBoundingClientRect();
  width = Math.max(1, rect.width);
  height = Math.max(1, rect.height);
  dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function hydrateBestScore() {
  bestScore = Number(localStorage.getItem(bestScoreKey) || 0);
  bestScoreEl.textContent = String(bestScore);
}

function hydrateCanWallet() {
  canWallet = Number(localStorage.getItem(canWalletKey) || 0);
  canCountEl.textContent = String(canWallet);
  updateWardrobeHeader();
}

function persistCanWallet({ sync = true } = {}) {
  localStorage.setItem(canWalletKey, String(canWallet));
  canCountEl.textContent = String(canWallet);
  updateWardrobeHeader();
  if (wardrobeModalEl && !wardrobeModalEl.classList.contains('hidden')) {
    renderWardrobe();
  }
  if (sync) {
    scheduleProfileSync();
  }
}

function getCosmeticStorageKey() {
  return session?.userId
    ? `discord-mochi-bird-cosmetics-${session.userId}`
    : 'discord-mochi-bird-cosmetics-practice';
}

function normalizeCosmeticState(raw) {
  const ownedIds = new Set([defaultCosmetic.id]);

  if (Array.isArray(raw?.ownedIds)) {
    for (const id of raw.ownedIds) {
      if (typeof id === 'string' && id.trim()) {
        ownedIds.add(id);
      }
    }
  }

  let selectedId = typeof raw?.selectedId === 'string' ? raw.selectedId : defaultCosmetic.id;
  if (!ownedIds.has(selectedId)) {
    selectedId = defaultCosmetic.id;
  }

  return { selectedId, ownedIds };
}

function normalizeSharedProfile(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const cosmeticSource = source.cosmeticState && typeof source.cosmeticState === 'object' ? source.cosmeticState : null;
  const ownedIds = cosmeticSource?.ownedIds instanceof Set
    ? [...cosmeticSource.ownedIds]
    : Array.isArray(cosmeticSource?.ownedIds)
      ? cosmeticSource.ownedIds
      : [];
  return {
    canWallet: Math.max(0, Math.floor(Number(source.canWallet) || 0)),
    cosmeticState: normalizeCosmeticState({
      selectedId: cosmeticSource?.selectedId,
      ownedIds
    })
  };
}

function applySharedProfile(profile, { persist = true, sync = false } = {}) {
  const normalized = normalizeSharedProfile(profile);
  canWallet = normalized.canWallet;
  cosmeticState = normalized.cosmeticState;
  canCountEl.textContent = String(canWallet);
  updateWardrobeHeader();
  if (persist) {
    localStorage.setItem(canWalletKey, String(canWallet));
    persistCosmeticState({ sync });
  }
  if (wardrobeModalEl && !wardrobeModalEl.classList.contains('hidden')) {
    renderWardrobe();
  }
}

function buildSharedProfilePayload() {
  return {
    canWallet,
    cosmeticState: {
      selectedId: cosmeticState.selectedId,
      ownedIds: [...cosmeticState.ownedIds]
    }
  };
}

function scheduleProfileSync(delayMs = 400) {
  if (!profileSyncReady || isPracticeMode || !sessionId) {
    return;
  }

  if (profileSyncTimer) {
    window.clearTimeout(profileSyncTimer);
  }

  profileSyncTimer = window.setTimeout(() => {
    profileSyncTimer = 0;
    void syncSharedProfile();
  }, delayMs);
}

async function syncSharedProfile() {
  if (!profileSyncReady || isPracticeMode || !sessionId) {
    return;
  }

  if (profileSyncInFlight) {
    profileSyncQueued = true;
    return;
  }

  profileSyncInFlight = true;

  try {
    const response = await fetch(`/api/mochi/session/${sessionId}/profile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(buildSharedProfilePayload())
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || 'Failed to save profile');
    }

    if (payload?.profile) {
      applySharedProfile(payload.profile, { persist: true });
    }
  } catch {
    // Best effort: local cache still keeps progress if the network hiccups.
  } finally {
    profileSyncInFlight = false;
    if (profileSyncQueued) {
      profileSyncQueued = false;
      scheduleProfileSync(0);
    }
  }
}

function loadCosmeticStateFromStorage(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }
    return normalizeCosmeticState(JSON.parse(raw));
  } catch {
    return null;
  }
}

function snapshotCosmeticState() {
  return {
    selectedId: cosmeticState.selectedId,
    ownedIds: new Set(cosmeticState.ownedIds)
  };
}

function persistCosmeticState({ sync = true } = {}) {
  localStorage.setItem(
    cosmeticStorageKey,
    JSON.stringify({
      selectedId: cosmeticState.selectedId,
      ownedIds: [...cosmeticState.ownedIds]
    })
  );
  if (sync) {
    scheduleProfileSync();
  }
}

function switchCosmeticProfile(nextStorageKey, preserveCurrentState = true) {
  if (!nextStorageKey) {
    return;
  }

  const previousState = preserveCurrentState ? snapshotCosmeticState() : null;
  cosmeticStorageKey = nextStorageKey;

  const storedState = loadCosmeticStateFromStorage(nextStorageKey);
  cosmeticState = storedState || previousState || normalizeCosmeticState(null);
  persistCosmeticState();
  updateWardrobeHeader();
  renderWardrobe();
}

function formatCosmeticLabel(id) {
  if (id === defaultCosmetic.id) {
    return defaultCosmetic.label;
  }

  const paddedMatch = id.match(/-(\d+)$/);
  const suffix = paddedMatch ? ` ${String(Number(paddedMatch[1])).padStart(2, '0')}` : '';

  if (id.startsWith('dr-shelly-set-2-')) {
    return `Dr Shelly Set 2${suffix}`;
  }
  if (id.startsWith('dr-shelly-')) {
    return `Dr Shelly${suffix}`;
  }
  if (id.startsWith('shalani-energy-')) {
    return `Shalani Energy${suffix}`;
  }
  if (id.startsWith('sussballs-')) {
    return `SussBalls${suffix}`;
  }
  if (id.startsWith('hair-dark-')) {
    return `Dark Hair${suffix}`;
  }
  if (id.startsWith('hair-brown-')) {
    return `Brown Hair${suffix}`;
  }
  if (id.startsWith('watermelon-')) {
    return 'Watermelon';
  }

  return id
    .replaceAll('-', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getCosmeticCategory(id) {
  if (id === defaultCosmetic.id) {
    return 'Base';
  }
  if (id.startsWith('hair-dark-') || id.startsWith('hair-brown-')) {
    return 'Hair Styles';
  }
  if (id.startsWith('watermelon-')) {
    return 'Special';
  }
  if (id.startsWith('dr-shelly-') || id.startsWith('shalani-energy-') || id.startsWith('sussballs-')) {
    return 'Can Outfits';
  }

  return 'Special';
}

function getCosmeticCost(item) {
  if (!item || item.id === defaultCosmetic.id) {
    return 0;
  }

  if (item.category === 'Hair Styles') {
    return 12;
  }
  if (item.id.startsWith('watermelon-')) {
    return 45;
  }
  if (item.category === 'Special') {
    return 32;
  }

  return 18;
}

function decorateCosmetic(item, index, sourceGroup) {
  const label = item.label || formatCosmeticLabel(item.id);
  const category = item.category || getCosmeticCategory(item.id);
  const cost = Number.isFinite(item.cost) ? item.cost : getCosmeticCost({ ...item, category });
  return {
    id: item.id,
    label,
    category,
    cost,
    file: item.file,
    src: item.src,
    source: item.source,
    sourceGroup,
    index
  };
}

function getSelectedCosmeticDefinition() {
  return cosmeticCatalog.find((item) => item.id === cosmeticState.selectedId) || defaultCosmetic;
}

function getSelectedCosmeticSprite() {
  const cosmetic = getSelectedCosmeticDefinition();
  return cosmeticSprites.get(cosmetic.id) || birdSprite;
}

function updateWardrobeHeader() {
  if (wardrobeWalletEl) {
    wardrobeWalletEl.textContent = String(canWallet);
  }
  if (wardrobeSelectedEl) {
    wardrobeSelectedEl.textContent = getSelectedCosmeticDefinition().label;
  }
  if (wardrobeOwnedEl) {
    wardrobeOwnedEl.textContent = String(cosmeticState.ownedIds.size);
  }
  if (wardrobeStatusEl) {
    wardrobeStatusEl.textContent = wardrobeNotice
      || (cosmeticManifestReady
        ? 'Tap an outfit to equip or unlock it.'
        : 'Loading outfits...');
  }
}

function getModeStatusLabel() {
  if (sessionId) {
    return 'Session';
  }
  if (activityMode) {
    if (activityBootstrapState === 'pending' || activityBootstrapState === 'connecting') {
      return 'Connecting to Discord';
    }
    if (activityBootstrapState === 'ready') {
      return 'Session';
    }
    if (activityBootstrapState === 'error') {
      return 'Practice mode';
    }
    return 'Activity';
  }
  return 'Practice mode';
}

function getSessionNoteText() {
  if (sessionId && session) {
    return `Session linked to ${session.userTag}.`;
  }
  if (activityMode) {
    if (activityBootstrapState === 'ready' && session) {
      return `Session linked to ${session.userTag}.`;
    }
    if (activityBootstrapState === 'error') {
      return 'Discord session is unavailable. Practice mode is still available.';
    }
    return 'Connecting to Discord...';
  }
  return 'Practice mode is available when you open this page directly.';
}

function setWardrobeMessage(text) {
  wardrobeNotice = text;
  if (wardrobeStatusEl) {
    wardrobeStatusEl.textContent = text;
  }
  if (wardrobeNoticeTimer) {
    window.clearTimeout(wardrobeNoticeTimer);
  }
  wardrobeNoticeTimer = window.setTimeout(() => {
    wardrobeNotice = '';
    wardrobeNoticeTimer = 0;
    updateWardrobeHeader();
  }, 2200);
}

function setWardrobeOpen(open) {
  if (!wardrobeModalEl) {
    return;
  }

  wardrobeModalEl.classList.toggle('hidden', !open);
  wardrobeModalEl.setAttribute('aria-hidden', String(!open));
  document.body.classList.toggle('wardrobe-open', open);
  if (open) {
    renderWardrobe();
  }
}

async function bootstrapDiscordActivitySession() {
  if (!activityMode || sessionId || discordBootstrapPromise) {
    return discordBootstrapPromise ?? false;
  }

  if (!discordClientId) {
    activityBootstrapState = 'error';
    sessionNoteEl.textContent = getSessionNoteText();
    updateStatus('Discord client id missing');
    updateDebugNote();
    return false;
  }

  discordBootstrapPromise = (async () => {
    activityBootstrapState = 'connecting';
    sessionNoteEl.textContent = getSessionNoteText();
    updateStatus('Connecting to Discord...');
    updateDebugNote();

    const discordSdk = new DiscordSDK(discordClientId);
    await discordSdk.ready();

    const authPayload = await discordSdk.commands.authenticate({ access_token: null });
    const discordUser = authPayload?.user;
    if (!discordUser?.id) {
      throw new Error('Discord user unavailable');
    }

    const channelId = discordSdk.channelId || '';
    const guildId = discordSdk.guildId || '';
    if (!channelId) {
      throw new Error('Discord channel unavailable');
    }

    const userTag = discordUser.global_name?.trim()
      || (discordUser.discriminator && discordUser.discriminator !== '0'
        ? `${discordUser.username}#${discordUser.discriminator}`
        : discordUser.username);

    const response = await fetch('/api/mochi/activity/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: discordUser.id,
        userTag,
        channelId,
        guildId
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || 'Failed to create activity session');
    }

    session = payload.session;
    sessionId = session?.id || '';
    if (!sessionId) {
      throw new Error('Activity session was not created');
    }

    isPracticeMode = false;
    bestScoreKey = `discord-mochi-bird-best-${session.userId}`;
    canWalletKey = `discord-mochi-bird-can-wallet-${session.userId}`;
    cosmeticStorageKey = getCosmeticStorageKey();
    activityBootstrapState = 'ready';
    sessionNoteEl.textContent = getSessionNoteText();
    updateStatus(`Ready for ${session.userTag}`);
    updateDebugNote();
    profileSyncReady = true;
    return true;
  })();

  try {
    return await discordBootstrapPromise;
  } catch (error) {
    activityBootstrapState = 'error';
    sessionNoteEl.textContent = getSessionNoteText();
    updateStatus(`Discord bootstrap failed: ${error.message}`);
    updateDebugNote();
    return false;
  } finally {
    discordBootstrapPromise = null;
  }
}

function openWardrobe() {
  setWardrobeOpen(true);
}

function closeWardrobe() {
  setWardrobeOpen(false);
}

function isCosmeticOwned(id) {
  return cosmeticState.ownedIds.has(id);
}

function equipCosmetic(id, { silent = false } = {}) {
  const cosmetic = cosmeticCatalog.find((item) => item.id === id);
  if (!cosmetic) {
    return;
  }

  const alreadyOwned = isCosmeticOwned(id);
  const cost = cosmetic.cost || 0;

  if (!alreadyOwned && cost > 0) {
    if (canWallet < cost) {
      setWardrobeMessage(`Need ${cost - canWallet} more cans to unlock ${cosmetic.label}.`);
      return;
    }

    canWallet -= cost;
    persistCanWallet();
    cosmeticState.ownedIds.add(id);
    setWardrobeMessage(`${cosmetic.label} unlocked.`);
  }

  cosmeticState.selectedId = id;
  cosmeticState.ownedIds.add(id);
  persistCosmeticState();
  updateWardrobeHeader();
  renderWardrobe();

  if (!silent) {
    updateStatus(`${cosmetic.label} equipped.`);
  }
}

function renderWardrobe() {
  if (!wardrobeGridEl) {
    return;
  }

  updateWardrobeHeader();
  wardrobeGridEl.replaceChildren();

  if (!cosmeticManifestReady) {
    const loading = document.createElement('div');
    loading.className = 'leaderboard-empty';
    loading.textContent = 'Loading outfit catalog...';
    wardrobeGridEl.appendChild(loading);
    return;
  }

  const groupedItems = new Map();
  for (const item of cosmeticCatalog) {
    const group = item.category || 'Special';
    if (!groupedItems.has(group)) {
      groupedItems.set(group, []);
    }
    groupedItems.get(group).push(item);
  }

  const orderedGroups = [...cosmeticCategoryOrder, ...groupedItems.keys()]
    .filter((group, index, list) => list.indexOf(group) === index && groupedItems.has(group));

  for (const groupName of orderedGroups) {
    const items = groupedItems.get(groupName) || [];
    const section = document.createElement('section');
    section.className = 'wardrobe-section';

    const head = document.createElement('div');
    head.className = 'wardrobe-section-head';

    const title = document.createElement('h3');
    title.textContent = groupName;

    const count = document.createElement('span');
    count.textContent = `${items.length} outfit${items.length === 1 ? '' : 's'}`;

    head.append(title, count);

    const shelf = document.createElement('div');
    shelf.className = 'wardrobe-shelf';

    for (const item of items) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'wardrobe-card';

      const owned = isCosmeticOwned(item.id);
      const equipped = cosmeticState.selectedId === item.id;
      if (equipped) {
        card.classList.add('wardrobe-card--equipped');
      }
      if (!owned && item.id !== defaultCosmetic.id) {
        card.classList.add('wardrobe-card--locked');
      }

      const sprite = cosmeticSprites.get(item.id) || birdSprite;
      const image = document.createElement('img');
      image.src = sprite.src || item.src;
      image.alt = item.label;
      image.loading = 'lazy';

      const name = document.createElement('strong');
      name.textContent = item.label;

      const description = document.createElement('p');
      if (item.id === defaultCosmetic.id) {
        description.textContent = 'Always free. Your base Mochi look.';
      } else if (owned) {
        description.textContent = equipped ? 'Currently equipped.' : 'Owned. Tap to equip.';
      } else {
        description.textContent = `Unlock for ${item.cost} cans.`;
      }

      const tags = document.createElement('div');
      tags.className = 'wardrobe-tag-row';

      const costTag = document.createElement('span');
      costTag.className = 'wardrobe-tag';
      costTag.textContent = item.id === defaultCosmetic.id ? 'Free' : `${item.cost} cans`;

      const statusTag = document.createElement('span');
      statusTag.className = 'wardrobe-tag';
      statusTag.textContent = equipped ? 'Equipped' : owned ? 'Owned' : canWallet >= item.cost ? 'Buyable' : 'Locked';

      tags.append(costTag, statusTag);

      card.append(image, name, description, tags);
      card.addEventListener('click', () => equipCosmetic(item.id));

      shelf.appendChild(card);
    }

    section.append(head, shelf);
    wardrobeGridEl.appendChild(section);
  }
}

async function loadCosmeticCatalog() {
  try {
    const response = await fetch(cosmeticManifestUrl, { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Cosmetics not found');
    }

    cosmeticManifest = Array.isArray(payload) ? payload : [];
  } catch {
    cosmeticManifest = [];
  }

  cosmeticCatalog = [defaultCosmetic];
  cosmeticSprites = new Map([[defaultCosmetic.id, birdSprite]]);

  for (const [index, item] of cosmeticManifest.entries()) {
    const decorated = decorateCosmetic({
      id: item.id,
      file: item.file,
      src: `./assets/cosmetics/${item.file}?v=${assetVersion}`,
      source: item.source
    }, index);

    cosmeticCatalog.push(decorated);
    const sprite = new Image();
    sprite.decoding = 'async';
    sprite.src = decorated.src;
    cosmeticSprites.set(decorated.id, sprite);
  }

  cosmeticManifestReady = true;
  updateWardrobeHeader();
  renderWardrobe();
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

function formatRelativeTime(timestamp) {
  if (!timestamp) {
    return 'Last updated just now';
  }

  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSeconds < 5) {
    return 'Last updated just now';
  }
  if (diffSeconds < 60) {
    return `Last updated ${diffSeconds}s ago`;
  }
  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) {
    return `Last updated ${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  return `Last updated ${hours}h ago`;
}

function renderLeaderboard(entries, updatedAt = Date.now()) {
  leaderboardEntries = Array.isArray(entries) ? entries.slice(0, 10) : [];
  leaderboardListEl.replaceChildren();

  if (!leaderboardEntries.length) {
    leaderboardEmptyEl.classList.remove('hidden');
    leaderboardStatusEl.textContent = 'No scores yet.';
    leaderboardUpdatedAt = updatedAt;
    leaderboardUpdatedEl.textContent = formatRelativeTime(leaderboardUpdatedAt);
    return;
  }

  leaderboardEmptyEl.classList.add('hidden');
  leaderboardStatusEl.textContent = `${leaderboardEntries.length} top scores saved from Discord runs.`;

  for (let index = 0; index < leaderboardEntries.length; index += 1) {
    const entry = leaderboardEntries[index];
    const item = document.createElement('li');
    item.className = 'leaderboard-entry';
    if (index === 0) {
      item.classList.add('leaderboard-entry--top');
    }

    const rank = document.createElement('span');
    rank.className = 'leaderboard-rank';
    rank.textContent = `#${index + 1}`;

    const meta = document.createElement('div');
    meta.className = 'leaderboard-meta-block';
    const user = document.createElement('strong');
    user.textContent = entry.userTag || entry.userName || `Player ${index + 1}`;
    const sub = document.createElement('span');
    const timeText = entry.updatedAt
      ? `Saved ${formatRelativeTime(entry.updatedAt).replace('Last updated ', '')}`
      : 'Recorded run';
    sub.textContent = `${timeText} · ${formatDuration(Number(entry.durationMs || 0))}`;
    meta.append(user, sub);

    const score = document.createElement('strong');
    score.className = 'leaderboard-score';
    score.textContent = String(entry.bestScore ?? entry.score ?? 0);

    item.append(rank, meta, score);
    leaderboardListEl.appendChild(item);
  }

  leaderboardUpdatedAt = updatedAt;
  leaderboardUpdatedEl.textContent = formatRelativeTime(leaderboardUpdatedAt);
  localStorage.setItem(
    leaderboardCacheKey,
    JSON.stringify({
      updatedAt: leaderboardUpdatedAt,
      entries: leaderboardEntries,
      recentUpdatedAt: recentRunsUpdatedAt,
      recentRuns: recentRunsEntries
    })
  );
}

function renderRecentRuns(entries, updatedAt = Date.now()) {
  recentRunsEntries = Array.isArray(entries) ? entries.slice(0, 8) : [];
  recentRunsListEl.replaceChildren();

  if (!recentRunsEntries.length) {
    recentRunsEmptyEl.classList.remove('hidden');
    recentRunsUpdatedAt = updatedAt;
    recentRunsUpdatedEl.textContent = formatRelativeTime(recentRunsUpdatedAt);
    return;
  }

  recentRunsEmptyEl.classList.add('hidden');

  for (let index = 0; index < recentRunsEntries.length; index += 1) {
    const entry = recentRunsEntries[index];
    const item = document.createElement('li');
    item.className = 'leaderboard-entry';

    const rank = document.createElement('span');
    rank.className = 'leaderboard-rank';
    rank.textContent = `#${index + 1}`;

    const meta = document.createElement('div');
    meta.className = 'leaderboard-meta-block';
    const user = document.createElement('strong');
    user.textContent = entry.userTag || entry.userName || `Player ${index + 1}`;
    const sub = document.createElement('span');
    const scoreText = Number(entry.score ?? entry.bestScore ?? 0);
    const canText = Number(entry.cans || 0);
    const timeText = entry.updatedAt
      ? `Saved ${formatRelativeTime(entry.updatedAt).replace('Last updated ', '')}`
      : 'Recorded run';
    sub.textContent = `${timeText} · Score ${scoreText}${canText ? ` · ${canText} cans` : ''}`;
    meta.append(user, sub);

    const score = document.createElement('strong');
    score.className = 'leaderboard-score';
    score.textContent = String(scoreText);

    item.append(rank, meta, score);
    recentRunsListEl.appendChild(item);
  }

  recentRunsUpdatedAt = updatedAt;
  recentRunsUpdatedEl.textContent = formatRelativeTime(recentRunsUpdatedAt);
  localStorage.setItem(
    leaderboardCacheKey,
    JSON.stringify({
      updatedAt: leaderboardUpdatedAt,
      entries: leaderboardEntries,
      recentUpdatedAt: recentRunsUpdatedAt,
      recentRuns: recentRunsEntries
    })
  );
}

function hydrateLeaderboardCache() {
  try {
    const raw = localStorage.getItem(leaderboardCacheKey);
    if (!raw) {
      return;
    }

    const payload = JSON.parse(raw);
    if (Array.isArray(payload.entries)) {
      leaderboardUpdatedAt = Number(payload.updatedAt) || 0;
      leaderboardLastFetchAt = leaderboardUpdatedAt || Date.now();
      renderLeaderboard(payload.entries, leaderboardUpdatedAt || Date.now());
    }
    if (Array.isArray(payload.recentRuns)) {
      recentRunsUpdatedAt = Number(payload.recentUpdatedAt) || Number(payload.updatedAt) || 0;
      renderRecentRuns(payload.recentRuns, recentRunsUpdatedAt || Date.now());
    }
  } catch {
    // Cached leaderboard is optional.
  }
}

async function loadLeaderboard({ quiet = false } = {}) {
  if (leaderboardLoading) {
    return;
  }

  leaderboardLoading = true;
  try {
    if (!quiet) {
      leaderboardStatusEl.textContent = 'Refreshing top scores...';
    }

    const response = await fetch('/api/mochi/leaderboard', { cache: 'no-store' });
    const payloadText = await response.text();
    let payload = null;
    try {
      payload = JSON.parse(payloadText);
    } catch {
      payload = null;
    }

    const entries = Array.isArray(payload?.leaderboard) ? payload.leaderboard : [];
    const recentRuns = Array.isArray(payload?.recentRuns) ? payload.recentRuns : [];
    if (response.ok && entries.length) {
      renderLeaderboard(entries, Date.now());
    } else if (response.ok && !entries.length && bootstrapPayload?.leaderboard && Array.isArray(bootstrapPayload.leaderboard)) {
      renderLeaderboard(bootstrapPayload.leaderboard, Date.now());
    } else if (!leaderboardEntries.length && bootstrapPayload?.leaderboard && Array.isArray(bootstrapPayload.leaderboard)) {
      renderLeaderboard(bootstrapPayload.leaderboard, Date.now());
    } else if (leaderboardEntries.length) {
      leaderboardStatusEl.textContent = `${leaderboardEntries.length} top scores saved from Discord runs.`;
      leaderboardEmptyEl.classList.add('hidden');
    }
    if (response.ok && recentRuns.length) {
      renderRecentRuns(recentRuns, Date.now());
    } else if (!recentRunsEntries.length && bootstrapPayload?.recentRuns && Array.isArray(bootstrapPayload.recentRuns)) {
      renderRecentRuns(bootstrapPayload.recentRuns, Date.now());
    }
  } catch {
    if (leaderboardEntries.length) {
      leaderboardStatusEl.textContent = `${leaderboardEntries.length} top scores saved from Discord runs.`;
      leaderboardEmptyEl.classList.add('hidden');
    } else if (bootstrapPayload?.leaderboard && Array.isArray(bootstrapPayload.leaderboard)) {
      renderLeaderboard(bootstrapPayload.leaderboard, Date.now());
    }
    if (!recentRunsEntries.length && bootstrapPayload?.recentRuns && Array.isArray(bootstrapPayload.recentRuns)) {
      renderRecentRuns(bootstrapPayload.recentRuns, Date.now());
    }
  } finally {
    leaderboardLoading = false;
    leaderboardLastFetchAt = Date.now();
  }
}

function tickLeaderboardLabel() {
  leaderboardUpdatedEl.textContent = formatRelativeTime(leaderboardUpdatedAt);
  recentRunsUpdatedEl.textContent = formatRelativeTime(recentRunsUpdatedAt);
}

function scheduleLeaderboardRefresh() {
  if (leaderboardRefreshTimer) {
    return;
  }

  leaderboardRefreshTimer = window.setInterval(() => {
    tickLeaderboardLabel();
    if (!document.hidden && Date.now() - leaderboardLastFetchAt > 15000) {
      void loadLeaderboard({ quiet: true });
    }
  }, 1000);
}

function ensureAudioContext() {
  if (audioContext) {
    return audioContext;
  }

  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) {
    return null;
  }

  audioContext = new AudioCtor();
  return audioContext;
}

async function unlockAudio() {
  if (!audioEnabled) {
    return null;
  }

  const context = ensureAudioContext();
  if (!context) {
    return null;
  }

  if (context.state === 'suspended') {
    try {
      await context.resume();
    } catch {
      // Ignore audio resume failures; the game still works without sound.
    }
  }

  return context;
}

function playTone({ frequency, duration = 0.16, type = 'sine', gain = 0.04, slideTo = null }) {
  if (!audioEnabled) {
    return;
  }

  const context = ensureAudioContext();
  if (!context) {
    return;
  }

  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, context.currentTime);
  if (slideTo) {
    oscillator.frequency.exponentialRampToValueAtTime(slideTo, context.currentTime + duration);
  }
  envelope.gain.setValueAtTime(0.0001, context.currentTime);
  envelope.gain.exponentialRampToValueAtTime(gain, context.currentTime + 0.02);
  envelope.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
  oscillator.connect(envelope).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + duration + 0.02);
}

function playFlapSound() {
  playTone({ frequency: 520, slideTo: 760, duration: 0.08, gain: 0.03, type: 'triangle' });
}

function playScoreSound() {
  playTone({ frequency: 660, slideTo: 880, duration: 0.09, gain: 0.03, type: 'square' });
  window.setTimeout(() => playTone({ frequency: 990, slideTo: 1320, duration: 0.08, gain: 0.025, type: 'triangle' }), 70);
}

function playHitSound() {
  playTone({ frequency: 220, slideTo: 140, duration: 0.18, gain: 0.05, type: 'sawtooth' });
}

function playCanSound() {
  playTone({ frequency: 880, slideTo: 1120, duration: 0.08, gain: 0.028, type: 'triangle' });
  window.setTimeout(() => playTone({ frequency: 1320, slideTo: 1640, duration: 0.07, gain: 0.022, type: 'sine' }), 55);
}

function startMusicLoop() {
  if (!audioEnabled || musicTimer) {
    return;
  }

  const pattern = [587.33, 523.25, 659.25, 493.88];
  musicStep = 0;
  playTone({ frequency: 174.61, duration: 0.24, gain: 0.015, type: 'triangle' });
  musicTimer = window.setInterval(() => {
    if (!started || gameOver || !audioEnabled) {
      return;
    }
    const note = pattern[musicStep % pattern.length];
    const octave = musicStep % 8 === 7 ? note / 2 : note;
    playTone({ frequency: octave, duration: 0.14, gain: 0.012, type: 'triangle' });
    musicStep += 1;
  }, 420);
}

function stopMusicLoop() {
  if (musicTimer) {
    window.clearInterval(musicTimer);
    musicTimer = 0;
  }
}

function setSoundButtonLabel() {
  soundToggleEl.textContent = audioEnabled ? 'Sound: On' : 'Sound: Off';
  soundToggleEl.setAttribute('aria-pressed', audioEnabled ? 'true' : 'false');
}

function toggleSound() {
  audioEnabled = !audioEnabled;
  localStorage.setItem('discord-mochi-bird-audio', audioEnabled ? 'on' : 'off');
  setSoundButtonLabel();
  if (!audioEnabled) {
    stopMusicLoop();
  } else if (started && !gameOver) {
    void unlockAudio().then(() => startMusicLoop());
  }
}

function emitParticles(x, y, color = 'rgba(255,255,255,0.8)', count = 8) {
  for (let index = 0; index < count; index += 1) {
    const angle = (Math.PI * 2 * index) / count + Math.random() * 0.2;
    const speed = 80 + Math.random() * 140;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 40,
      life: 0.55 + Math.random() * 0.2,
      age: 0,
      color,
      size: 2 + Math.random() * 2
    });
  }
}

function nudgeScreenShake(power = 5, duration = 0.14) {
  shakePower = Math.max(shakePower, power);
  shakeTime = Math.max(shakeTime, duration);
}

function updateParticles(deltaSeconds) {
  particles = particles.filter((particle) => {
    particle.age += deltaSeconds;
    particle.x += particle.vx * deltaSeconds;
    particle.y += particle.vy * deltaSeconds;
    particle.vy += 240 * deltaSeconds;
    return particle.age < particle.life;
  });

  if (shakeTime > 0) {
    shakeTime = Math.max(0, shakeTime - deltaSeconds);
  } else {
    shakePower = 0;
  }
}

function drawParticles() {
  if (!particles.length) {
    return;
  }

  ctx.save();
  for (const particle of particles) {
    const alpha = 1 - particle.age / particle.life;
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function resetBoard() {
  bird = {
    x: width * 0.28,
    y: height * 0.42,
    radius: Math.max(15, Math.min(18, Math.round(width * 0.045))),
    velocity: 0
  };
  pipes = [];
  cans = [];
  spawnTimer = 0.65;
  canSpawnTimer = 0.95;
  bgOffset = 0;
  clouds = Array.from({ length: 5 }, (_, index) => ({
    x: width * (0.2 + index * 0.22),
    y: height * (0.12 + (index % 2) * 0.08),
    speed: 8 + index * 2,
    size: 0.8 + index * 0.16
  }));
  score = 0;
  elapsedMs = 0;
  runCanCount = 0;
  started = false;
  gameOver = false;
  submitted = false;
  scoreEl.textContent = '0';
}

function showOverlay(title, text) {
  overlayTitleEl.textContent = title;
  overlayTextEl.textContent = text;
  overlayEl.classList.remove('hidden');
}

function hideOverlay() {
  overlayEl.classList.add('hidden');
}

function updateStatus(text) {
  statusEl.textContent = text;
}

function addPipe() {
  const topHeight = 60 + Math.random() * (height - GROUND_HEIGHT - PIPE_GAP - 140);
  pipes.push({
    x: width + 30,
    topHeight,
    passed: false
  });
}

function addCan() {
  const canSize = clamp(Math.round(width * 0.102), 32, 50);
  const minY = Math.max(72, canSize * 1.5);
  const maxY = Math.max(minY + 60, height - GROUND_HEIGHT - canSize * 1.5 - 20);
  cans.push({
    x: width + canSize + 12,
    y: minY + Math.random() * (maxY - minY),
    size: canSize,
    bob: Math.random() * Math.PI * 2,
    collected: false
  });
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

function canBox(can) {
  const size = can.size * 0.96;
  return {
    x: can.x - size / 2,
    y: can.y - size / 2,
    width: size,
    height: size
  };
}

function pipeBoxes(pipe) {
  const gapBottom = pipe.topHeight + PIPE_GAP;
  return [
    {
      x: pipe.x,
      y: 0,
      width: PIPE_WIDTH,
      height: pipe.topHeight
    },
    {
      x: pipe.x,
      y: gapBottom,
      width: PIPE_WIDTH,
      height: height - GROUND_HEIGHT - gapBottom
    }
  ];
}

function drawSky() {
  const skyGradient = ctx.createLinearGradient(0, 0, 0, height);
  skyGradient.addColorStop(0, '#5bbef5');
  skyGradient.addColorStop(0.45, '#89d8fb');
  skyGradient.addColorStop(0.75, '#c2edff');
  skyGradient.addColorStop(0.9, '#f5dea0');
  skyGradient.addColorStop(1, '#f0c96a');
  ctx.fillStyle = skyGradient;
  ctx.fillRect(0, 0, width, height);
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
    const topHeight = pipe.topHeight;
    const bottomY = pipe.topHeight + PIPE_GAP;
    const bottomHeight = height - GROUND_HEIGHT - bottomY;

    ctx.fillStyle = '#1d7f52';
    ctx.strokeStyle = '#145337';
    ctx.lineWidth = 4;

    ctx.beginPath();
    roundRect(ctx, pipe.x, 0, PIPE_WIDTH, topHeight, 12, true, false);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    roundRect(ctx, pipe.x - 4, Math.max(0, topHeight - 16), PIPE_WIDTH + 8, 16, 8, true, false);
    ctx.fillStyle = '#2fd18d';
    ctx.fill();

    ctx.beginPath();
    roundRect(ctx, pipe.x, bottomY, PIPE_WIDTH, bottomHeight, 12, true, false);
    ctx.fillStyle = '#1d7f52';
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    roundRect(ctx, pipe.x - 4, bottomY, PIPE_WIDTH + 8, 16, 8, true, false);
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
    const x = (i * 36 - bgOffset * 0.6) % (width + 36);
    ctx.fillRect(x, groundY + 8, 22, 4);
  }
}

function drawContainedSprite(image, boxSize) {
  const naturalWidth = image?.naturalWidth || image?.width || 0;
  const naturalHeight = image?.naturalHeight || image?.height || 0;
  if (!naturalWidth || !naturalHeight) {
    return false;
  }

  const scale = Math.min(boxSize / naturalWidth, boxSize / naturalHeight);
  const drawWidth = naturalWidth * scale;
  const drawHeight = naturalHeight * scale;
  ctx.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  return true;
}

function drawBird() {
  if (!bird) {
    return;
  }

  const tilt = clamp(bird.velocity / 400, -0.6, 0.8);
  ctx.save();
  ctx.translate(bird.x, bird.y);
  ctx.rotate(tilt);

  const selectedSprite = getSelectedCosmeticSprite();
  if (selectedSprite.complete && selectedSprite.naturalWidth > 0) {
    const size = bird.radius * 2.7;
    drawContainedSprite(selectedSprite, size);
  } else if (birdSprite.complete && birdSprite.naturalWidth > 0) {
    const size = bird.radius * 2.7;
    drawContainedSprite(birdSprite, size);
  } else {
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
  }

  ctx.restore();
}

function drawCans() {
  if (!cans.length) {
    return;
  }

  for (const can of cans) {
    const wobble = Math.sin(can.bob) * 3;
    can.bob += 0.08;

    ctx.save();
    ctx.translate(can.x, can.y + wobble);
    ctx.rotate(Math.sin(can.bob * 0.8) * 0.12);

    if (canSprite.complete && canSprite.naturalWidth > 0) {
      ctx.drawImage(canSprite, -can.size / 2, -can.size / 2, can.size, can.size);
    } else {
      const fallbackWidth = can.size * 0.82;
      const fallbackHeight = can.size * 1.1;
      ctx.fillStyle = '#b51030';
      roundRect(ctx, -fallbackWidth / 2, -fallbackHeight / 2, fallbackWidth, fallbackHeight, 5);
      ctx.fill();
    }

    ctx.restore();
  }
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

function resetRun() {
  stopMusicLoop();
  shakeTime = 0;
  shakePower = 0;
  resetBoard();
  overlaySummaryEl.replaceChildren();
  showOverlay(
    'Ready to play',
    activityMode && !sessionId
      ? 'Connecting to Discord...'
      : 'Tap anywhere, click, or press Space to start.'
  );
  primaryButton.textContent = 'Play';
  updateStatus(getModeStatusLabel() === 'Practice mode'
    ? 'Practice mode ready'
    : activityMode && !sessionId
      ? 'Connecting to Discord...'
      : 'Ready to play');
}

function startRun() {
  if (gameOver) {
    resetBoard();
  }

  started = true;
  gameOver = false;
  hideOverlay();
  overlaySummaryEl.replaceChildren();
  updateStatus(getModeStatusLabel() === 'Practice mode' ? 'Practice mode running' : 'Session running');
  bird.velocity = FLAP_VELOCITY;
  emitParticles(bird.x, bird.y, 'rgba(255,255,255,0.45)', 5);
  playFlapSound();
  void unlockAudio().then(() => startMusicLoop());
}

function flap() {
  if (!started) {
    startRun();
    return;
  }

  if (gameOver) {
    resetRun();
    startRun();
    return;
  }

  bird.velocity = FLAP_VELOCITY;
  emitParticles(bird.x - 2, bird.y + 4, 'rgba(255, 210, 90, 0.85)', 4);
  playFlapSound();
}

function endGame(reason) {
  if (gameOver) {
    return;
  }

  gameOver = true;
  started = false;
  stopMusicLoop();
  updateStatus(`Game over: ${reason}`);
  const isNewBest = score > bestScore;
  const summary = [
    { label: 'Score', value: String(score) },
    { label: 'Best', value: String(Math.max(bestScore, score)) },
    { label: 'Cans', value: String(runCanCount) },
    { label: 'Time', value: formatDuration(elapsedMs) }
  ];

  overlaySummaryEl.replaceChildren();
  for (const item of summary) {
    const pill = document.createElement('div');
    pill.className = 'overlay-pill';
    pill.innerHTML = `<span>${item.label}</span><strong>${item.value}</strong>`;
    overlaySummaryEl.appendChild(pill);
  }

  showOverlay(
    'Game over',
    `${isNewBest ? 'New best score! ' : ''}You scored ${score}. Tap play again to run it back.`
  );
  primaryButton.textContent = 'Play again';
  void submitScore(reason);
  playHitSound();
  emitParticles(bird.x, Math.max(0, bird.y), 'rgba(255, 105, 105, 0.9)', 14);
  nudgeScreenShake(8, 0.2);
}

async function submitScore(reason) {
  if (isPracticeMode || submitted || !sessionId) {
    return;
  }

  submitted = true;

  try {
    const response = await fetch(`/api/mochi/session/${sessionId}/score`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        score,
        durationMs: Math.round(elapsedMs),
        cans: runCanCount,
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
    void loadLeaderboard({ quiet: true });
  } catch (error) {
    submitted = false;
    updateStatus(`Could not submit score: ${error.message}`);
  }
}

function update(deltaSeconds) {
  updateParticles(deltaSeconds);

  if (!started || gameOver) {
    return;
  }

  elapsedMs += deltaSeconds * 1000;
  bird.velocity += GRAVITY * deltaSeconds;
  bird.y += bird.velocity * deltaSeconds;
  bgOffset = (bgOffset + PIPE_SPEED * deltaSeconds) % width;

  spawnTimer -= deltaSeconds;
  canSpawnTimer -= deltaSeconds;
  if (spawnTimer <= 0) {
    addPipe();
    spawnTimer = PIPE_INTERVAL;
  }
  if (canSpawnTimer <= 0) {
    addCan();
    canSpawnTimer = 1.25 + Math.random() * 0.95;
  }

  for (const pipe of pipes) {
    pipe.x -= PIPE_SPEED * deltaSeconds;
  }

  pipes = pipes.filter((pipe) => pipe.x > -PIPE_WIDTH - 40);
  for (const can of cans) {
    can.x -= PIPE_SPEED * deltaSeconds * 0.92;
  }
  cans = cans.filter((can) => can.x > -80 && !can.collected);

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
      playScoreSound();
      emitParticles(pipe.x + PIPE_WIDTH * 0.5, pipe.topHeight + PIPE_GAP * 0.5, 'rgba(37, 208, 171, 0.95)', 10);
      if (score > bestScore) {
        bestScore = score;
        bestScoreEl.textContent = String(bestScore);
        localStorage.setItem(bestScoreKey, String(bestScore));
      }
    }
  }

  for (const can of cans) {
    if (can.collected) {
      continue;
    }

    if (rectsOverlap(birdBounds, canBox(can))) {
      can.collected = true;
      runCanCount += 1;
      canWallet += 1;
      persistCanWallet();
      playCanSound();
      emitParticles(can.x, can.y, 'rgba(255, 200, 87, 0.95)', 12);
    }
  }
}

function render() {
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  if (shakeTime > 0 && shakePower > 0) {
    const jitterX = (Math.random() - 0.5) * shakePower;
    const jitterY = (Math.random() - 0.5) * shakePower;
    ctx.translate(jitterX, jitterY);
  }

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
  drawCans();
  drawGround();
  drawParticles();
  drawBird();
  drawHudOverlay();
  ctx.restore();
}

function loop(timestamp) {
  if (!lastTime) {
    lastTime = timestamp;
  }

  const deltaSeconds = Math.min(0.033, (timestamp - lastTime) / 1000);
  lastTime = timestamp;

  update(deltaSeconds);
  render();
  raf = requestAnimationFrame(loop);
}

async function loadSession() {
  if (!sessionId) {
    if (activityMode && await bootstrapDiscordActivitySession()) {
      return loadSession();
    }

    isPracticeMode = true;
    sessionNoteEl.textContent = activityMode
      ? 'Discord session is unavailable. Practice mode is still available.'
      : 'Practice mode: this run is local only.';
    hydrateBestScore();
    switchCosmeticProfile(getCosmeticStorageKey(), false);
    updateDebugNote();
    return;
  }

  try {
    const response = await fetch(`/api/mochi/session/${sessionId}`, { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Session not found');
    }

    session = payload.session;
    bestScoreKey = `discord-mochi-bird-best-${session.userId}`;
    canWalletKey = `discord-mochi-bird-can-wallet-${session.userId}`;
    cosmeticStorageKey = getCosmeticStorageKey();
    sessionNoteEl.textContent = getSessionNoteText();
    updateStatus(`Ready for ${session.userTag}`);

    const serverProfile = normalizeSharedProfile(payload.profile || null);
    const userLocalProfile = {
      canWallet: Number(localStorage.getItem(canWalletKey) || 0),
      cosmeticState: loadCosmeticStateFromStorage(cosmeticStorageKey) || normalizeCosmeticState(null)
    };
    const practiceLocalProfile = {
      canWallet: Number(localStorage.getItem('discord-mochi-bird-can-wallet-practice') || 0),
      cosmeticState: loadCosmeticStateFromStorage('discord-mochi-bird-cosmetics-practice') || normalizeCosmeticState(null)
    };
    const localProfile = [userLocalProfile, practiceLocalProfile].sort((a, b) => {
      const aScore = a.canWallet + a.cosmeticState.ownedIds.size * 100;
      const bScore = b.canWallet + b.cosmeticState.ownedIds.size * 100;
      return bScore - aScore;
    })[0];
    const hasServerProgress = serverProfile.canWallet > 0
      || (serverProfile.cosmeticState?.ownedIds || []).length > 1
      || serverProfile.cosmeticState?.selectedId !== defaultCosmetic.id;
    const hasLocalProgress = localProfile.canWallet > 0
      || localProfile.cosmeticState.ownedIds.size > 1
      || localProfile.cosmeticState.selectedId !== defaultCosmetic.id;

    profileSyncReady = true;
    updateDebugNote();

    if (hasServerProgress) {
      applySharedProfile(serverProfile);
    } else if (hasLocalProgress) {
      applySharedProfile(localProfile);
      scheduleProfileSync(0);
    } else {
      applySharedProfile(serverProfile);
    }

    try {
      const bestResponse = await fetch(`/api/mochi/leaderboard/${session.userId}`, { cache: 'no-store' });
      if (bestResponse.ok) {
        const bestPayload = await bestResponse.json();
        if (bestPayload?.entry?.bestScore !== undefined) {
          bestScore = Number(bestPayload.entry.bestScore) || 0;
          localStorage.setItem(bestScoreKey, String(bestScore));
          bestScoreEl.textContent = String(bestScore);
        }
      }
    } catch {
      // Best score lookup is optional.
    }
  } catch (error) {
    sessionNoteEl.textContent = activityMode
      ? 'Discord session is missing or expired. Practice mode is still available.'
      : 'Discord session is missing or expired. Practice mode is still available.';
    updateStatus(`Session warning: ${error.message}`);
    isPracticeMode = true;
    profileSyncReady = false;
    switchCosmeticProfile(getCosmeticStorageKey(), false);
    updateDebugNote();
  }

  void loadLeaderboard({ quiet: true });
}

async function onPrimaryInput(event) {
  const now = Date.now();
  const pointerId = event && Number.isFinite(Number(event.pointerId)) ? Number(event.pointerId) : null;

  if (pointerId !== null && pointerId === lastHandledPointerId && now - lastHandledInputAt < 160) {
    return;
  }
  if (now - lastHandledInputAt < 60) {
    return;
  }
  lastHandledInputAt = now;
  lastHandledPointerId = pointerId;

  if (event) {
    const interactiveTarget = event.target && typeof event.target.closest === 'function'
      ? event.target.closest('button, a, input, textarea, select, [role="button"]')
      : null;
    if (interactiveTarget && interactiveTarget !== primaryButton && interactiveTarget !== soundToggleEl) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }
  void unlockAudio();

  if (activityMode && !sessionId) {
    updateStatus('Connecting to Discord...');
    const ready = await bootstrapDiscordActivitySession();
    if (!ready || !sessionId) {
      return;
    }
  }

  flap();
}

resizeCanvas();
hydrateBestScore();
hydrateCanWallet();
cosmeticStorageKey = getCosmeticStorageKey();
cosmeticState = loadCosmeticStateFromStorage(cosmeticStorageKey) || normalizeCosmeticState(null);
hydrateLeaderboardCache();
setSoundButtonLabel();
updateWardrobeHeader();
if (bootstrapPayload?.leaderboard && Array.isArray(bootstrapPayload.leaderboard)) {
  renderLeaderboard(bootstrapPayload.leaderboard, Date.now());
}
if (bootstrapPayload?.recentRuns && Array.isArray(bootstrapPayload.recentRuns)) {
  renderRecentRuns(bootstrapPayload.recentRuns, Date.now());
}
resetRun();
void loadCosmeticCatalog();
void loadSession();
scheduleLeaderboardRefresh();
void loadLeaderboard({ quiet: true });

window.addEventListener('resize', () => {
  resizeCanvas();
  resetRun();
});

window.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    void loadLeaderboard({ quiet: true });
    tickLeaderboardLabel();
  }
});

window.addEventListener('keydown', (event) => {
  if (!wardrobeModalEl.classList.contains('hidden') && event.code !== 'Escape') {
    return;
  }
  if (event.code === 'Space' || event.code === 'ArrowUp') {
    event.preventDefault();
    onPrimaryInput(event);
  }
  if (event.code === 'KeyR' && gameOver) {
    event.preventDefault();
    resetRun();
  }
  if (event.code === 'Escape' && !wardrobeModalEl.classList.contains('hidden')) {
    event.preventDefault();
    closeWardrobe();
  }
});

stageEl.addEventListener('pointerdown', onPrimaryInput);
overlayEl.addEventListener('pointerdown', onPrimaryInput);
overlayEl.addEventListener('click', onPrimaryInput);
primaryButton.addEventListener('pointerdown', onPrimaryInput);
primaryButton.addEventListener('click', onPrimaryInput);
soundToggleEl.addEventListener('click', toggleSound);
wardrobeButtonEl?.addEventListener('click', openWardrobe);
wardrobeCloseButtonEl?.addEventListener('click', closeWardrobe);
wardrobeBackdropEl?.addEventListener('click', closeWardrobe);

raf = requestAnimationFrame(loop);
