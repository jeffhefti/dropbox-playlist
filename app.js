// MVP orchestration: auth -> list folder -> play the first audio file.
// This intentionally does the least possible to prove the end-to-end path
// (PKCE auth, temp link, HTML5 audio, Media Session) before the real
// playlist UI gets built on top of it.

const els = {
  status: document.getElementById('status'),
  connectBtn: document.getElementById('connect-btn'),
  logoutBtn: document.getElementById('logout-btn'),
  player: document.getElementById('player'),
  trackTitle: document.getElementById('track-title'),
  audio: document.getElementById('audio'),
};

function setStatus(msg) {
  els.status.textContent = msg;
  console.log('[status]', msg);
}

async function loadFirstTrack() {
  setStatus('Loading token…');
  const accessToken = await getValidAccessToken();

  setStatus(`Listing "${CONFIG.FOLDER_PATH}"…`);
  const files = await listAudioFiles(accessToken);

  if (files.length === 0) {
    setStatus(`No audio files found in ${CONFIG.FOLDER_PATH}.`);
    return;
  }

  const track = files[0];
  setStatus(`Fetching link for "${track.name}"…`);
  const link = await getTemporaryLink(accessToken, track.path_lower);

  els.audio.src = link;
  els.trackTitle.textContent = stripExtension(track.name);
  setMediaSessionMetadata({ title: stripExtension(track.name) });
  setupMediaSession(els.audio);

  els.player.hidden = false;
  setStatus(`Ready (${files.length} audio file${files.length === 1 ? '' : 's'} found).`);
}

function showLoggedOutUI() {
  els.connectBtn.hidden = false;
  els.logoutBtn.hidden = true;
  els.player.hidden = true;
  setStatus('Not connected.');
}

function showLoggedInUI() {
  els.connectBtn.hidden = true;
  els.logoutBtn.hidden = false;
}

async function main() {
  els.connectBtn.addEventListener('click', () => {
    startDropboxAuth().catch((err) => setStatus(`Error: ${err.message}`));
  });

  els.logoutBtn.addEventListener('click', () => {
    logout();
    els.audio.pause();
    els.audio.removeAttribute('src');
    showLoggedOutUI();
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
    await loadFirstTrack();
  } catch (err) {
    setStatus(`Error: ${err.message}`);
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
