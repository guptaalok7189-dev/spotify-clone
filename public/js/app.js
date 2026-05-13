/* ─── STATE ──────────────────────────────────────────────────── */
const state = {
  songs: [],
  playlists: [],
  likedIds: new Set(),
  currentQueue: [],
  currentIndex: -1,
  currentPlaylistId: null,
  isPlaying: false,
  isShuffle: false,
  repeatMode: 0, // 0=off 1=all 2=one
  isDraggingProgress: false,
  addToPlaylistSongId: null,
};

const audio = document.getElementById('audioPlayer');

/* ─── HELPERS ────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const fmt = s => {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2500);
}

function coverHTML(url, cls = 'row-cover') {
  if (url) return `<div class="${cls}"><img src="${url}" alt="cover" loading="lazy"></div>`;
  return `<div class="${cls}"><i class="fas fa-music"></i></div>`;
}

/* ─── API ────────────────────────────────────────────────────── */
const api = {
  async get(url) { const r = await fetch(url); return r.json(); },
  async post(url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return r.json();
  },
  async delete(url) { const r = await fetch(url, { method: 'DELETE' }); return r.json(); },
  async put(url, body) {
    const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return r.json();
  },
};

/* ─── VIEWS ──────────────────────────────────────────────────── */
function switchView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const view = document.getElementById(`view-${name}`);
  if (view) view.classList.add('active');
  const nav = document.querySelector(`[data-view="${name}"]`);
  if (nav) nav.classList.add('active');

  if (name === 'home') loadHome();
  if (name === 'search') { $('searchInput').focus(); }
  if (name === 'library') loadLibrary();
  if (name === 'liked') loadLiked();
}

document.querySelectorAll('[data-view]').forEach(el => {
  el.addEventListener('click', e => { e.preventDefault(); switchView(el.dataset.view); });
});

/* ─── LOAD DATA ──────────────────────────────────────────────── */
async function loadAll() {
  const [songs, playlists, liked] = await Promise.all([
    api.get('/api/songs'),
    api.get('/api/playlists'),
    api.get('/api/liked'),
  ]);
  state.songs = songs;
  state.playlists = playlists;
  state.likedIds = new Set(liked.map(s => s.id));
  renderSidebarPlaylists();
  loadHome();
}

/* ─── HOME ───────────────────────────────────────────────────── */
function loadHome() {
  const recent = [...state.songs].reverse().slice(0, 8);
  renderSongGrid($('recentSongs'), recent);
  renderSongList($('allSongsList'), state.songs, 'all');
  updateGreeting();
}

function updateGreeting() {
  const h = new Date().getHours();
  const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const el = document.querySelector('#view-home .view-header h1');
  if (el) el.textContent = greet;
}

/* ─── LIBRARY ────────────────────────────────────────────────── */
function loadLibrary() {
  renderPlaylistGrid($('libraryPlaylists'), state.playlists);
}

/* ─── LIKED ──────────────────────────────────────────────────── */
async function loadLiked() {
  const liked = await api.get('/api/liked');
  $('likedCount').textContent = `${liked.length} song${liked.length !== 1 ? 's' : ''}`;
  renderSongList($('likedSongsList'), liked, 'liked');
}

/* ─── RENDER SONG GRID ───────────────────────────────────────── */
function renderSongGrid(container, songs) {
  if (!songs.length) {
    container.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-music"></i><h3>No songs yet</h3><p>Upload some music to get started</p></div>`;
    return;
  }
  container.innerHTML = songs.map((s, i) => `
    <div class="song-card" data-id="${s.id}">
      ${coverHTML(s.cover, 'card-cover')}
      <button class="card-play-btn" data-id="${s.id}"><i class="fas fa-play"></i></button>
      <div class="card-title">${escHtml(s.title)}</div>
      <div class="card-artist">${escHtml(s.artist)}</div>
    </div>
  `).join('');

  container.querySelectorAll('.card-play-btn').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); playSong(btn.dataset.id, songs); });
  });
  container.querySelectorAll('.song-card').forEach(card => {
    card.addEventListener('click', () => playSong(card.dataset.id, songs));
  });
}

/* ─── RENDER SONG LIST ───────────────────────────────────────── */
function renderSongList(container, songs, context = 'all', playlistId = null) {
  if (!songs.length) {
    container.innerHTML = `<div class="empty-state"><i class="fas fa-music"></i><h3>No songs here</h3><p>${context === 'liked' ? 'Like some songs to see them here' : 'This playlist is empty'}</p></div>`;
    return;
  }
  container.innerHTML = songs.map((s, i) => `
    <div class="song-row ${state.currentQueue[state.currentIndex]?.id === s.id && state.isPlaying ? 'playing' : ''}" data-id="${s.id}">
      <span class="row-num">${i + 1}</span>
      <span class="row-play" style="display:none"><i class="fas fa-play"></i></span>
      ${coverHTML(s.cover)}
      <div class="row-info">
        <div class="row-title">${escHtml(s.title)}</div>
        <div class="row-artist">${escHtml(s.artist)}${s.album && s.album !== 'Unknown Album' ? ` · ${escHtml(s.album)}` : ''}</div>
      </div>
      <div class="row-duration">${fmt(s.duration)}</div>
      <div class="row-actions">
        <button class="row-action-btn like-song-btn ${state.likedIds.has(s.id) ? 'liked' : ''}" data-id="${s.id}" title="${state.likedIds.has(s.id) ? 'Unlike' : 'Like'}">
          <i class="${state.likedIds.has(s.id) ? 'fas' : 'far'} fa-heart"></i>
        </button>
        <button class="row-action-btn add-to-playlist-btn" data-id="${s.id}" title="Add to playlist"><i class="fas fa-plus"></i></button>
        ${playlistId ? `<button class="row-action-btn remove-from-playlist-btn" data-id="${s.id}" data-playlist="${playlistId}" title="Remove from playlist"><i class="fas fa-minus"></i></button>` : ''}
        <button class="row-action-btn delete-song-btn" data-id="${s.id}" title="Delete song"><i class="fas fa-trash"></i></button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.song-row').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      playSong(row.dataset.id, songs);
    });
  });

  container.querySelectorAll('.like-song-btn').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); toggleLike(btn.dataset.id); });
  });
  container.querySelectorAll('.add-to-playlist-btn').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); openAddToPlaylist(btn.dataset.id); });
  });
  container.querySelectorAll('.remove-from-playlist-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      removeFromPlaylist(btn.dataset.playlist, btn.dataset.id);
    });
  });
  container.querySelectorAll('.delete-song-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (confirm('Delete this song?')) deleteSong(btn.dataset.id);
    });
  });
}

/* ─── RENDER PLAYLIST GRID ───────────────────────────────────── */
function renderPlaylistGrid(container, playlists) {
  if (!playlists.length) {
    container.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-list"></i><h3>No playlists yet</h3><p>Create a playlist to organize your music</p></div>`;
    return;
  }
  container.innerHTML = playlists.map(p => `
    <div class="playlist-card" data-id="${p.id}">
      <div class="playlist-card-cover"><i class="fas fa-music"></i></div>
      <div class="playlist-card-title">${escHtml(p.name)}</div>
      <div class="playlist-card-desc">${p.songCount} song${p.songCount !== 1 ? 's' : ''}</div>
    </div>
  `).join('');
  container.querySelectorAll('.playlist-card').forEach(card => {
    card.addEventListener('click', () => openPlaylist(card.dataset.id));
  });
}

function renderSidebarPlaylists() {
  const container = $('sidebarPlaylists');
  container.innerHTML = state.playlists.map(p => `
    <a href="#" class="nav-item" data-playlist-id="${p.id}">${escHtml(p.name)}</a>
  `).join('');
  container.querySelectorAll('[data-playlist-id]').forEach(el => {
    el.addEventListener('click', e => { e.preventDefault(); openPlaylist(el.dataset.playlistId); });
  });
}

/* ─── PLAYLIST VIEW ──────────────────────────────────────────── */
async function openPlaylist(id) {
  const playlist = await api.get(`/api/playlists/${id}`);
  state.currentPlaylistId = id;

  $('playlistViewName').textContent = playlist.name;
  $('playlistViewDesc').textContent = playlist.description || '';
  $('playlistViewCount').textContent = `${playlist.songs.length} song${playlist.songs.length !== 1 ? 's' : ''}`;

  renderSongList($('playlistSongsList'), playlist.songs, 'playlist', id);

  $('playPlaylistBtn').onclick = () => {
    if (playlist.songs.length) playSong(playlist.songs[0].id, playlist.songs);
  };

  $('deletePlaylistBtn').onclick = () => {
    if (confirm(`Delete "${playlist.name}"?`)) {
      api.delete(`/api/playlists/${id}`).then(() => {
        state.playlists = state.playlists.filter(p => p.id !== id);
        renderSidebarPlaylists();
        toast('Playlist deleted');
        switchView('library');
      });
    }
  };

  // Switch to playlist view
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  $('view-playlist').classList.add('active');
}

async function removeFromPlaylist(playlistId, songId) {
  await api.delete(`/api/playlists/${playlistId}/songs/${songId}`);
  toast('Removed from playlist');
  openPlaylist(playlistId);
}

/* ─── PLAYBACK ───────────────────────────────────────────────── */
function playSong(id, queue = state.songs) {
  const idx = queue.findIndex(s => s.id === id);
  if (idx === -1) return;
  state.currentQueue = queue;
  state.currentIndex = idx;
  loadTrack(queue[idx]);
  audio.play();
  state.isPlaying = true;
  updatePlayBtn();
}

function loadTrack(song) {
  if (!song) return;
  audio.src = song.url;
  $('playerTitle').textContent = song.title;
  $('playerArtist').textContent = song.artist;

  const cover = $('playerCover');
  cover.innerHTML = song.cover
    ? `<img src="${song.cover}" alt="cover">`
    : `<i class="fas fa-music"></i>`;

  const lb = $('playerLikeBtn');
  lb.className = `like-btn ${state.likedIds.has(song.id) ? 'liked' : ''}`;
  lb.innerHTML = `<i class="${state.likedIds.has(song.id) ? 'fas' : 'far'} fa-heart"></i>`;
  lb.onclick = () => toggleLike(song.id);

  document.title = `${song.title} — ${song.artist}`;
  $('progressPlayed').style.width = '0';
  $('progressThumb').style.left = '0';
  $('currentTime').textContent = '0:00';
}

function updatePlayBtn() {
  $('playPauseBtn').innerHTML = state.isPlaying
    ? '<i class="fas fa-pause"></i>'
    : '<i class="fas fa-play"></i>';
}

$('playPauseBtn').addEventListener('click', () => {
  if (!audio.src) return;
  if (state.isPlaying) { audio.pause(); state.isPlaying = false; }
  else { audio.play(); state.isPlaying = true; }
  updatePlayBtn();
});

$('nextBtn').addEventListener('click', playNext);
$('prevBtn').addEventListener('click', () => {
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  playPrev();
});

$('shuffleBtn').addEventListener('click', () => {
  state.isShuffle = !state.isShuffle;
  $('shuffleBtn').classList.toggle('active', state.isShuffle);
  toast(state.isShuffle ? 'Shuffle on' : 'Shuffle off');
});

$('repeatBtn').addEventListener('click', () => {
  state.repeatMode = (state.repeatMode + 1) % 3;
  const btn = $('repeatBtn');
  btn.classList.remove('active');
  if (state.repeatMode === 0) { btn.innerHTML = '<i class="fas fa-redo"></i>'; toast('Repeat off'); }
  if (state.repeatMode === 1) { btn.innerHTML = '<i class="fas fa-redo"></i>'; btn.classList.add('active'); toast('Repeat all'); }
  if (state.repeatMode === 2) { btn.innerHTML = '<i class="fas fa-redo-alt"></i>'; btn.classList.add('active'); toast('Repeat one'); }
});

function playNext() {
  if (!state.currentQueue.length) return;
  if (state.repeatMode === 2) { audio.currentTime = 0; audio.play(); return; }
  let idx;
  if (state.isShuffle) {
    idx = Math.floor(Math.random() * state.currentQueue.length);
  } else {
    idx = state.currentIndex + 1;
    if (idx >= state.currentQueue.length) {
      if (state.repeatMode === 1) idx = 0;
      else return;
    }
  }
  state.currentIndex = idx;
  loadTrack(state.currentQueue[idx]);
  audio.play();
  state.isPlaying = true;
  updatePlayBtn();
}

function playPrev() {
  if (!state.currentQueue.length) return;
  let idx = state.currentIndex - 1;
  if (idx < 0) idx = state.repeatMode === 1 ? state.currentQueue.length - 1 : 0;
  state.currentIndex = idx;
  loadTrack(state.currentQueue[idx]);
  audio.play();
  state.isPlaying = true;
  updatePlayBtn();
}

audio.addEventListener('ended', playNext);
audio.addEventListener('timeupdate', () => {
  if (state.isDraggingProgress) return;
  const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
  $('progressPlayed').style.width = pct + '%';
  $('progressThumb').style.left = pct + '%';
  $('currentTime').textContent = fmt(audio.currentTime);
  $('totalTime').textContent = fmt(audio.duration);
});

audio.addEventListener('play', () => { state.isPlaying = true; updatePlayBtn(); });
audio.addEventListener('pause', () => { state.isPlaying = false; updatePlayBtn(); });

/* ─── PROGRESS SCRUBBING ─────────────────────────────────────── */
function scrub(e, track) {
  const rect = track.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  if (audio.duration) {
    audio.currentTime = pct * audio.duration;
    $('progressPlayed').style.width = (pct * 100) + '%';
    $('progressThumb').style.left = (pct * 100) + '%';
  }
}

const progressTrack = $('progressTrack');
progressTrack.addEventListener('mousedown', e => {
  state.isDraggingProgress = true;
  scrub(e, progressTrack);
  const up = () => { state.isDraggingProgress = false; window.removeEventListener('mouseup', up); window.removeEventListener('mousemove', move); };
  const move = e => scrub(e, progressTrack);
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
});

/* ─── VOLUME ─────────────────────────────────────────────────── */
const volumeTrack = $('volumeTrack');
function setVolume(e) {
  const rect = volumeTrack.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  audio.volume = pct;
  $('volumeFill').style.width = (pct * 100) + '%';
  $('volumeThumb').style.left = (pct * 100) + '%';
}
volumeTrack.addEventListener('mousedown', e => {
  setVolume(e);
  const up = () => { window.removeEventListener('mouseup', up); window.removeEventListener('mousemove', move); };
  const move = e => setVolume(e);
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
});
audio.volume = 0.7;

/* ─── LIKE ───────────────────────────────────────────────────── */
async function toggleLike(songId) {
  if (state.likedIds.has(songId)) {
    await api.delete(`/api/liked/${songId}`);
    state.likedIds.delete(songId);
    toast('Removed from Liked Songs');
  } else {
    await api.post(`/api/liked/${songId}`, {});
    state.likedIds.add(songId);
    toast('Added to Liked Songs');
  }
  // Update player like button if current song
  const cur = state.currentQueue[state.currentIndex];
  if (cur && cur.id === songId) {
    const lb = $('playerLikeBtn');
    lb.className = `like-btn ${state.likedIds.has(songId) ? 'liked' : ''}`;
    lb.innerHTML = `<i class="${state.likedIds.has(songId) ? 'fas' : 'far'} fa-heart"></i>`;
  }
  // Re-render current view if needed
  const likedView = $('view-liked');
  if (likedView.classList.contains('active')) loadLiked();
}

/* ─── SEARCH ─────────────────────────────────────────────────── */
let searchTimeout;
$('searchInput').addEventListener('input', e => {
  clearTimeout(searchTimeout);
  const q = e.target.value.trim();
  if (!q) {
    $('searchResultTitle').textContent = 'Search for something';
    $('searchResults').innerHTML = '';
    return;
  }
  searchTimeout = setTimeout(async () => {
    const songs = await api.get(`/api/songs?search=${encodeURIComponent(q)}`);
    $('searchResultTitle').textContent = songs.length ? `Results for "${q}"` : `No results for "${q}"`;
    renderSongList($('searchResults'), songs, 'search');
  }, 300);
});

/* ─── UPLOAD SONG ────────────────────────────────────────────── */
$('openUploadBtn').addEventListener('click', () => openModal('uploadModal'));
$('closeUploadModal').addEventListener('click', () => closeModal('uploadModal'));

const dropZone = $('dropZone');
const audioFileInput = $('audioFileInput');

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleFileSelect(file);
});
dropZone.addEventListener('click', () => audioFileInput.click());
audioFileInput.addEventListener('change', e => { if (e.target.files[0]) handleFileSelect(e.target.files[0]); });

function handleFileSelect(file) {
  $('selectedFileName').textContent = file.name;
  audioFileInput._file = file;
  // Auto-fill title from filename
  const name = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
  if (!$('uploadTitle').value) $('uploadTitle').value = name;
}

$('uploadSongBtn').addEventListener('click', async () => {
  const file = audioFileInput._file || audioFileInput.files[0];
  const title = $('uploadTitle').value.trim();
  const artist = $('uploadArtist').value.trim();
  const album = $('uploadAlbum').value.trim();

  if (!file) { toast('Please select an audio file'); return; }
  if (!title || !artist) { toast('Title and artist are required'); return; }

  // Get duration
  const duration = await getAudioDuration(file);

  const formData = new FormData();
  formData.append('audio', file);
  formData.append('title', title);
  formData.append('artist', artist);
  formData.append('album', album);
  formData.append('duration', duration);

  $('uploadProgress').style.display = 'flex';
  $('progressFill').style.width = '0%';
  $('progressText').textContent = 'Uploading...';

  try {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = e => {
      if (e.lengthComputable) {
        const pct = (e.loaded / e.total * 100).toFixed(0);
        $('progressFill').style.width = pct + '%';
        $('progressText').textContent = `Uploading... ${pct}%`;
      }
    };
    xhr.onload = async () => {
      if (xhr.status === 201) {
        const song = JSON.parse(xhr.responseText);
        state.songs.push(song);
        toast('Song uploaded!');
        closeModal('uploadModal');
        resetUploadForm();
        loadHome();
      } else {
        toast('Upload failed');
      }
      $('uploadProgress').style.display = 'none';
    };
    xhr.onerror = () => { toast('Upload failed'); $('uploadProgress').style.display = 'none'; };
    xhr.open('POST', '/api/songs');
    xhr.send(formData);
  } catch (err) {
    toast('Upload failed: ' + err.message);
    $('uploadProgress').style.display = 'none';
  }
});

function getAudioDuration(file) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const a = new Audio(url);
    a.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(a.duration || 0); };
    a.onerror = () => resolve(0);
  });
}

function resetUploadForm() {
  $('uploadTitle').value = '';
  $('uploadArtist').value = '';
  $('uploadAlbum').value = '';
  $('selectedFileName').textContent = '';
  audioFileInput.value = '';
  audioFileInput._file = null;
  $('uploadProgress').style.display = 'none';
}

/* ─── DELETE SONG ────────────────────────────────────────────── */
async function deleteSong(id) {
  await api.delete(`/api/songs/${id}`);
  state.songs = state.songs.filter(s => s.id !== id);
  state.likedIds.delete(id);
  toast('Song deleted');
  loadHome();
  if ($('view-liked').classList.contains('active')) loadLiked();
}

/* ─── CREATE PLAYLIST ────────────────────────────────────────── */
$('createPlaylistBtn').addEventListener('click', () => openModal('createPlaylistModal'));
$('closePlaylistModal').addEventListener('click', () => closeModal('createPlaylistModal'));

$('createPlaylistSubmit').addEventListener('click', async () => {
  const name = $('playlistName').value.trim();
  if (!name) { toast('Playlist name required'); return; }
  const p = await api.post('/api/playlists', { name, description: $('playlistDesc').value.trim() });
  state.playlists.push(p);
  renderSidebarPlaylists();
  toast(`Playlist "${name}" created`);
  closeModal('createPlaylistModal');
  $('playlistName').value = '';
  $('playlistDesc').value = '';
  openPlaylist(p.id);
});

/* ─── ADD TO PLAYLIST ────────────────────────────────────────── */
function openAddToPlaylist(songId) {
  state.addToPlaylistSongId = songId;
  const list = $('playlistPickerList');
  if (!state.playlists.length) {
    list.innerHTML = `<div class="empty-state"><p>No playlists yet. Create one first.</p></div>`;
  } else {
    list.innerHTML = state.playlists.map(p => `
      <div class="playlist-picker-item" data-id="${p.id}">
        <div class="playlist-picker-icon"><i class="fas fa-music"></i></div>
        <div class="playlist-picker-name">${escHtml(p.name)}</div>
      </div>
    `).join('');
    list.querySelectorAll('.playlist-picker-item').forEach(item => {
      item.addEventListener('click', async () => {
        await api.post(`/api/playlists/${item.dataset.id}/songs`, { songId: state.addToPlaylistSongId });
        toast('Added to playlist');
        closeModal('addToPlaylistModal');
        // Refresh playlist count in state
        const updated = await api.get('/api/playlists');
        state.playlists = updated;
        renderSidebarPlaylists();
      });
    });
  }
  openModal('addToPlaylistModal');
}
$('closeAddToPlaylist').addEventListener('click', () => closeModal('addToPlaylistModal'));

/* ─── MODAL HELPERS ──────────────────────────────────────────── */
function openModal(id) { $(id).classList.add('open'); }
function closeModal(id) { $(id).classList.remove('open'); }
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('open'); });
});

/* ─── KEYBOARD SHORTCUTS ─────────────────────────────────────── */
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') { e.preventDefault(); $('playPauseBtn').click(); }
  if (e.code === 'ArrowRight') { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 10); }
  if (e.code === 'ArrowLeft') { audio.currentTime = Math.max(0, audio.currentTime - 10); }
  if (e.code === 'ArrowUp') { audio.volume = Math.min(1, audio.volume + 0.1); $('volumeFill').style.width = (audio.volume * 100) + '%'; }
  if (e.code === 'ArrowDown') { audio.volume = Math.max(0, audio.volume - 0.1); $('volumeFill').style.width = (audio.volume * 100) + '%'; }
});

/* ─── ESCAPE HTML ────────────────────────────────────────────── */
function escHtml(str) {
  const el = document.createElement('div');
  el.textContent = str || '';
  return el.innerHTML;
}

/* ─── INIT ───────────────────────────────────────────────────── */
loadAll();
