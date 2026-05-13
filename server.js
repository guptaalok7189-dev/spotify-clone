const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Ensure upload directory exists
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Simple JSON file-based database
const DB_PATH = path.join(__dirname, 'db', 'data.json');
function readDB() {
  if (!fs.existsSync(DB_PATH)) {
    const initial = { songs: [], playlists: [], users: [] };
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}
function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// Multer config for audio uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, uuidv4() + ext);
  }
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = ['.mp3', '.wav', '.ogg', '.flac', '.m4a'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only audio files allowed'));
  },
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// Cover art upload
const coverStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, 'cover_' + uuidv4() + ext);
  }
});
const uploadCover = multer({ storage: coverStorage, limits: { fileSize: 5 * 1024 * 1024 } });

// ─── SONGS ───────────────────────────────────────────────────────────────────

// Get all songs
app.get('/api/songs', (req, res) => {
  const db = readDB();
  const { search } = req.query;
  let songs = db.songs;
  if (search) {
    const q = search.toLowerCase();
    songs = songs.filter(s =>
      s.title.toLowerCase().includes(q) ||
      s.artist.toLowerCase().includes(q) ||
      (s.album || '').toLowerCase().includes(q)
    );
  }
  res.json(songs);
});

// Get single song
app.get('/api/songs/:id', (req, res) => {
  const db = readDB();
  const song = db.songs.find(s => s.id === req.params.id);
  if (!song) return res.status(404).json({ error: 'Song not found' });
  res.json(song);
});

// Upload a song
app.post('/api/songs', upload.single('audio'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No audio file provided' });
  const { title, artist, album, duration } = req.body;
  if (!title || !artist) return res.status(400).json({ error: 'Title and artist required' });

  const db = readDB();
  const song = {
    id: uuidv4(),
    title,
    artist,
    album: album || 'Unknown Album',
    duration: parseFloat(duration) || 0,
    filename: req.file.filename,
    url: `/uploads/${req.file.filename}`,
    cover: req.body.cover || null,
    createdAt: new Date().toISOString()
  };
  db.songs.push(song);
  writeDB(db);
  res.status(201).json(song);
});

// Update song cover art
app.post('/api/songs/:id/cover', uploadCover.single('cover'), (req, res) => {
  const db = readDB();
  const idx = db.songs.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Song not found' });
  if (req.file) {
    db.songs[idx].cover = `/uploads/${req.file.filename}`;
    writeDB(db);
  }
  res.json(db.songs[idx]);
});

// Delete a song
app.delete('/api/songs/:id', (req, res) => {
  const db = readDB();
  const idx = db.songs.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Song not found' });
  const song = db.songs[idx];
  // Delete file
  const filePath = path.join(uploadDir, song.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  db.songs.splice(idx, 1);
  // Remove from playlists too
  db.playlists.forEach(p => { p.songs = p.songs.filter(id => id !== song.id); });
  writeDB(db);
  res.json({ success: true });
});

// ─── PLAYLISTS ────────────────────────────────────────────────────────────────

// Get all playlists
app.get('/api/playlists', (req, res) => {
  const db = readDB();
  const playlists = db.playlists.map(p => ({
    ...p,
    songCount: p.songs.length
  }));
  res.json(playlists);
});

// Get playlist with full song details
app.get('/api/playlists/:id', (req, res) => {
  const db = readDB();
  const playlist = db.playlists.find(p => p.id === req.params.id);
  if (!playlist) return res.status(404).json({ error: 'Playlist not found' });
  const songs = playlist.songs.map(sid => db.songs.find(s => s.id === sid)).filter(Boolean);
  res.json({ ...playlist, songs });
});

// Create playlist
app.post('/api/playlists', (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const db = readDB();
  const playlist = {
    id: uuidv4(),
    name,
    description: description || '',
    songs: [],
    createdAt: new Date().toISOString()
  };
  db.playlists.push(playlist);
  writeDB(db);
  res.status(201).json(playlist);
});

// Update playlist
app.put('/api/playlists/:id', (req, res) => {
  const db = readDB();
  const idx = db.playlists.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Playlist not found' });
  const { name, description } = req.body;
  if (name) db.playlists[idx].name = name;
  if (description !== undefined) db.playlists[idx].description = description;
  writeDB(db);
  res.json(db.playlists[idx]);
});

// Delete playlist
app.delete('/api/playlists/:id', (req, res) => {
  const db = readDB();
  const idx = db.playlists.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Playlist not found' });
  db.playlists.splice(idx, 1);
  writeDB(db);
  res.json({ success: true });
});

// Add song to playlist
app.post('/api/playlists/:id/songs', (req, res) => {
  const { songId } = req.body;
  const db = readDB();
  const playlist = db.playlists.find(p => p.id === req.params.id);
  if (!playlist) return res.status(404).json({ error: 'Playlist not found' });
  const song = db.songs.find(s => s.id === songId);
  if (!song) return res.status(404).json({ error: 'Song not found' });
  if (!playlist.songs.includes(songId)) {
    playlist.songs.push(songId);
    writeDB(db);
  }
  res.json(playlist);
});

// Remove song from playlist
app.delete('/api/playlists/:id/songs/:songId', (req, res) => {
  const db = readDB();
  const playlist = db.playlists.find(p => p.id === req.params.id);
  if (!playlist) return res.status(404).json({ error: 'Playlist not found' });
  playlist.songs = playlist.songs.filter(id => id !== req.params.songId);
  writeDB(db);
  res.json(playlist);
});

// ─── LIKED SONGS ─────────────────────────────────────────────────────────────

app.get('/api/liked', (req, res) => {
  const db = readDB();
  const liked = db.liked || [];
  const songs = liked.map(id => db.songs.find(s => s.id === id)).filter(Boolean);
  res.json(songs);
});

app.post('/api/liked/:songId', (req, res) => {
  const db = readDB();
  if (!db.liked) db.liked = [];
  if (!db.liked.includes(req.params.songId)) {
    db.liked.push(req.params.songId);
    writeDB(db);
  }
  res.json({ liked: true });
});

app.delete('/api/liked/:songId', (req, res) => {
  const db = readDB();
  if (!db.liked) db.liked = [];
  db.liked = db.liked.filter(id => id !== req.params.songId);
  writeDB(db);
  res.json({ liked: false });
});

// ─── START ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🎵 Spotify Clone running at http://localhost:${PORT}\n`);
});
