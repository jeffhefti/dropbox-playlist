// App-wide configuration. Safe to expose publicly — this is a PKCE public
// client, so there is no secret here, only the Dropbox App key (client id).
const CONFIG = {
  DROPBOX_CLIENT_ID: 'e90uvaquqb0fofr',

  // Computed dynamically so the same code works on localhost during
  // development and on the final GitHub Pages URL, without editing this
  // file per-environment. Must exactly match a "Redirect URI" registered
  // in the Dropbox app console (including trailing slash/path).
  REDIRECT_URI: window.location.origin + window.location.pathname,

  // Folder in the user's Dropbox to pull audio files from. Edit this to
  // point at your music folder, e.g. '/Music/Playlist'.
  FOLDER_PATH: '/Sunday Jams (2)/Mixes/FZ Covers',

  AUDIO_EXTENSIONS: ['mp3', 'm4a', 'wav', 'flac', 'aac', 'ogg', 'opus'],
};
