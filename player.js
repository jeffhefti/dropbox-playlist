// HTML5 audio wiring + Media Session API for lock-screen / control-center
// controls. Kept generic (handlers object) so the full playlist UI can
// plug in next/prev later without rewriting this.

function setupMediaSession(audioEl, { onNext, onPrev } = {}) {
  if (!('mediaSession' in navigator)) return;

  navigator.mediaSession.setActionHandler('play', () => audioEl.play());
  navigator.mediaSession.setActionHandler('pause', () => audioEl.pause());
  navigator.mediaSession.setActionHandler('seekbackward', (details) => {
    audioEl.currentTime = Math.max(audioEl.currentTime - (details.seekOffset || 10), 0);
  });
  navigator.mediaSession.setActionHandler('seekforward', (details) => {
    audioEl.currentTime = Math.min(audioEl.currentTime + (details.seekOffset || 10), audioEl.duration || Infinity);
  });
  navigator.mediaSession.setActionHandler('seekto', (details) => {
    if (details.seekTime != null) audioEl.currentTime = details.seekTime;
  });

  // Only expose next/prev controls when the caller supports them (i.e. a
  // real playlist, not the single-file MVP).
  navigator.mediaSession.setActionHandler('previoustrack', onPrev || null);
  navigator.mediaSession.setActionHandler('nexttrack', onNext || null);

  audioEl.addEventListener('play', () => {
    navigator.mediaSession.playbackState = 'playing';
  });
  audioEl.addEventListener('pause', () => {
    navigator.mediaSession.playbackState = 'paused';
  });
  audioEl.addEventListener('timeupdate', () => {
    if (!isFinite(audioEl.duration)) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: audioEl.duration,
        playbackRate: audioEl.playbackRate,
        position: audioEl.currentTime,
      });
    } catch {
      // Some browsers throw if called with stale values mid-seek; ignore.
    }
  });
}

// Shared cover art shown for every track (one image for the whole
// playlist, not per-track). Sized per the Media Session API's recommended
// artwork set so the OS can pick the best fit for lock screen / CarPlay /
// notification.
const PLAYLIST_ARTWORK = [96, 128, 192, 256, 384, 512].map((size) => ({
  src: `icons/artwork-${size}.jpg`,
  sizes: `${size}x${size}`,
  type: 'image/jpeg',
}));

function setMediaSessionMetadata({ title, artist = 'Dropbox Playlist', album = '' }) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title,
    artist,
    album,
    artwork: PLAYLIST_ARTWORK,
  });
}

function stripExtension(filename) {
  return filename.replace(/\.[^/.]+$/, '');
}
