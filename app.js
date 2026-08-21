// Full playlist orchestration: auth -> list folder -> browsable, reorderable
// queue with next/prev + Media Session integration.

const els = {
  status: document.getElementById('status'),
  connectBtn: document.getElementById('connect-btn'),
  logoutBtn: document.getElementById('logout-btn'),
  folderPicker: document.getElementById('folder-picker'),
  folderInput: document.getElementById('folder-input'),
  folderSaveBtn: document.getElementById('folder-save-btn'),
  player: document.getElementById('player'),
  trackTitle: document.getElementById('track-title'),
  audio: document.getElementById('audio'),
  playlist: document.getElementById('playlist'),
  prevBtn: document.getElementById('prev-btn'),
  nextBtn: document.getElementById('next-btn'),
};

let queue = [];
let currentIndex = -1;

const FOLDER_STORAGE_KEY = 'dbxplaylist_folder_path';

function setStatus(msg) {
  els.status.textContent = msg;
  console.log('[status]', msg);
}

// There's no refresh token, so an expired session shows up as a thrown
// error from getValidAccessToken(). When that happens, drop back to the
// logged-out UI (Connect button) instead of leaving a stale "connected"
// view the user can't do anything with.
function backToLoginIfSessionExpired() {
  if (!isLoggedIn()) showLoggedOutUI();
}

// Each visitor points the app at their own Dropbox folder; only the first
// visit (or anyone who hasn't changed it) falls back to the folder baked
// into config.js.
function getFolderPath() {
  return localStorage.getItem(FOLDER_STORAGE_KEY) || CONFIG.FOLDER_PATH;
}

function setFolderPath(path) {
  localStorage.setItem(FOLDER_STORAGE_KEY, path);
}

// Dropbox's API wants "" for the root and "/Foo/Bar" (no trailing slash)
// for subfolders.
function normalizeFolderPath(raw) {
  let path = raw.trim();
  if (path === '' || path === '/') return '';
  if (!path.startsWith('/')) path = '/' + path;
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return path;
}

function orderStorageKey() {
  return `dbxplaylist_order::${getFolderPath()}`;
}

function loadSavedOrder() {
  try {
    return JSON.parse(localStorage.getItem(orderStorageKey())) || null;
  } catch {
    return null;
  }
}

function saveOrder() {
  localStorage.setItem(orderStorageKey(), JSON.stringify(queue.map((t) => t.path_lower)));
}

// Applies any previously-saved custom order to a freshly-listed file set,
// preserving user reordering across sessions while still picking up newly
// added files (appended at the end) and dropping ones that were removed.
function applySavedOrder(files) {
  const saved = loadSavedOrder();
  if (!saved) return files;

  const remaining = new Map(files.map((f) => [f.path_lower, f]));
  const ordered = [];
  for (const path of saved) {
    if (remaining.has(path)) {
      ordered.push(remaining.get(path));
      remaining.delete(path);
    }
  }
  for (const f of files) {
    if (remaining.has(f.path_lower)) ordered.push(f);
  }
  return ordered;
}

function renderPlaylist() {
  els.playlist.innerHTML = '';

  queue.forEach((track, i) => {
    const li = document.createElement('li');
    li.className = 'track' + (i === currentIndex ? ' active' : '');

    const idx = document.createElement('span');
    idx.className = 'track-index';
    idx.textContent = String(i + 1);

    const nameBtn = document.createElement('button');
    nameBtn.type = 'button';
    nameBtn.className = 'track-name';
    nameBtn.textContent = stripExtension(track.name);
    nameBtn.addEventListener('click', () => playTrackAt(i));

    const reorder = document.createElement('div');
    reorder.className = 'reorder';

    const upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.textContent = '↑';
    upBtn.disabled = i === 0;
    upBtn.addEventListener('click', () => moveTrack(i, -1));

    const downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.textContent = '↓';
    downBtn.disabled = i === queue.length - 1;
    downBtn.addEventListener('click', () => moveTrack(i, 1));

    reorder.append(upBtn, downBtn);
    li.append(idx, nameBtn, reorder);
    els.playlist.appendChild(li);
  });

  els.prevBtn.disabled = currentIndex <= 0;
  els.nextBtn.disabled = currentIndex === -1 || currentIndex >= queue.length - 1;
}

function moveTrack(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= queue.length) return;

  [queue[i], queue[j]] = [queue[j], queue[i]];
  if (currentIndex === i) currentIndex = j;
  else if (currentIndex === j) currentIndex = i;

  saveOrder();
  renderPlaylist();
}

async function playTrackAt(index) {
  if (index < 0 || index >= queue.length) return;
  currentIndex = index;
  renderPlaylist();

  const track = queue[index];
  setStatus(`Fetching link for "${track.name}"…`);

  try {
    const accessToken = await getValidAccessToken();
    const link = await getTemporaryLink(accessToken, track.path_lower);

    els.audio.src = link;
    els.trackTitle.textContent = stripExtension(track.name);

    // iOS reads embedded ID3 artwork from the audio file itself and can
    // silently overwrite our Media Session artwork with it shortly after
    // playback starts. Re-applying our metadata on these later events makes
    // sure ours is the last write and actually sticks.
    const applyArtwork = () => setMediaSessionMetadata({ title: stripExtension(track.name) });
    applyArtwork();
    els.audio.addEventListener('loadedmetadata', applyArtwork, { once: true });
    els.audio.addEventListener('canplay', applyArtwork, { once: true });
    els.audio.addEventListener('playing', applyArtwork, { once: true });

    await els.audio.play();
    setStatus(`Playing ${index + 1} of ${queue.length}.`);
  } catch (err) {
    setStatus(`Couldn't play "${track.name}": ${err.message}`);
    backToLoginIfSessionExpired();
  }
}

function playNext() {
  if (currentIndex < queue.length - 1) playTrackAt(currentIndex + 1);
}

function playPrev() {
  if (currentIndex > 0) playTrackAt(currentIndex - 1);
}

async function loadPlaylist() {
  const folderPath = getFolderPath();
  els.player.hidden = true;
  els.audio.pause();
  queue = [];
  currentIndex = -1;

  setStatus('Loading token…');
  const accessToken = await getValidAccessToken();

  setStatus(`Listing "${folderPath || '/'}"…`);
  const files = await listAudioFiles(accessToken, folderPath);

  if (files.length === 0) {
    setStatus(`No audio files found in ${folderPath || '/'}.`);
    return;
  }

  queue = applySavedOrder(files);
  currentIndex = -1;

  els.player.hidden = false;
  renderPlaylist();
  setupMediaSession(els.audio, { onNext: playNext, onPrev: playPrev });

  setStatus(`${queue.length} track${queue.length === 1 ? '' : 's'} found. Tap one to play.`);
}

function showLoggedOutUI() {
  els.connectBtn.hidden = false;
  els.logoutBtn.hidden = true;
  els.folderPicker.hidden = true;
  els.player.hidden = true;
  setStatus('Not connected.');
}

function showLoggedInUI() {
  els.connectBtn.hidden = true;
  els.logoutBtn.hidden = false;
  els.folderPicker.hidden = false;
  els.folderInput.value = getFolderPath();
}

async function main() {
  els.connectBtn.addEventListener('click', () => {
    startDropboxAuth().catch((err) => setStatus(`Error: ${err.message}`));
  });

  els.logoutBtn.addEventListener('click', () => {
    logout();
    els.audio.pause();
    els.audio.removeAttribute('src');
    queue = [];
    currentIndex = -1;
    showLoggedOutUI();
  });

  els.prevBtn.addEventListener('click', playPrev);
  els.nextBtn.addEventListener('click', playNext);
  els.audio.addEventListener('ended', playNext);

  const applyFolderChange = () => {
    const path = normalizeFolderPath(els.folderInput.value);
    setFolderPath(path);
    els.folderInput.value = path;
    loadPlaylist().catch((err) => {
      setStatus(`Error: ${err.message}`);
      backToLoginIfSessionExpired();
    });
  };
  els.folderSaveBtn.addEventListener('click', applyFolderChange);
  els.folderInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') applyFolderChange();
  });

  try {
    const justLoggedIn = await handleAuthRedirect();
    if (justLoggedIn) setStatus('Connected to Dropbox.');
  } catch (err) {
    setStatus(`Auth error: ${err.message}`);
    return;
  }

  if (!isLoggedIn()) {
    showLoggedOutUI();
    return;
  }

  showLoggedInUI();
  try {
    await loadPlaylist();
  } catch (err) {
    setStatus(`Error: ${err.message}`);
    backToLoginIfSessionExpired();
  }
}

main();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}
