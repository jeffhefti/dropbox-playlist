// Thin wrapper around the bits of the Dropbox API v2 this app needs.

async function dbxFetch(endpoint, accessToken, body) {
  const res = await fetch(`https://api.dropboxapi.com/2/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Dropbox API error (${endpoint}): ${res.status} ${text}`);
  }

  return res.json();
}

function isAudioFile(name) {
  const ext = name.split('.').pop().toLowerCase();
  return CONFIG.AUDIO_EXTENSIONS.includes(ext);
}

// Lists audio files (non-recursive) in CONFIG.FOLDER_PATH, handling
// pagination. Returns entries sorted by name.
async function listAudioFiles(accessToken) {
  let entries = [];
  let data = await dbxFetch('files/list_folder', accessToken, {
    path: CONFIG.FOLDER_PATH,
    recursive: false,
  });
  entries = entries.concat(data.entries);

  while (data.has_more) {
    data = await dbxFetch('files/list_folder/continue', accessToken, {
      cursor: data.cursor,
    });
    entries = entries.concat(data.entries);
  }

  return entries
    .filter((e) => e['.tag'] === 'file' && isAudioFile(e.name))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Gets a temporary (~4hr) direct streaming link for a file, by path.
async function getTemporaryLink(accessToken, path) {
  const data = await dbxFetch('files/get_temporary_link', accessToken, { path });
  return data.link;
}
