# 🎵 Spotify Clone

A full-stack Spotify clone with real audio playback, playlists, liked songs, and search.

## Features
- 🎵 Upload and stream real MP3/WAV audio files
- 🎨 Spotify-identical dark UI
- 📋 Create and manage playlists
- ❤️ Like/unlike songs
- 🔍 Real-time search
- 🔀 Shuffle & repeat modes
- ⌨️ Keyboard shortcuts (Space, Arrow keys)
- 💾 JSON file database (no setup needed)

## Setup

### 1. Install Node.js
Download from https://nodejs.org (choose LTS version)

### 2. Install dependencies
Open a terminal in this folder and run:
```bash
npm install
```

### 3. Start the server
```bash
npm start
```

### 4. Open the app
Go to http://localhost:3000 in your browser

---

## How to use

### Upload Songs
1. Click **Upload Song** button or drag & drop an MP3/WAV
2. Fill in the title and artist
3. Click Upload

### Create Playlists
1. Click **Create Playlist** in the sidebar
2. Give it a name
3. Add songs using the **+** button on any song

### Keyboard Shortcuts
| Key | Action |
|-----|--------|
| `Space` | Play/Pause |
| `→` | Skip forward 10s |
| `←` | Skip back 10s |
| `↑` | Volume up |
| `↓` | Volume down |

## Project Structure
```
spotify-clone/
├── server.js          # Express backend
├── package.json       # Dependencies
├── db/
│   └── data.json      # Your data (auto-created)
└── public/
    ├── index.html     # Main page
    ├── css/style.css  # All styles
    ├── js/app.js      # Frontend logic
    └── uploads/       # Uploaded audio files
```

## Tech Stack
- **Backend**: Node.js + Express
- **Database**: JSON file (no MongoDB/PostgreSQL needed!)
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **File uploads**: Multer
