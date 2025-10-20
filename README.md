# Khmer Voice to Memo

A React-based voice memo application with Khmer speech recognition.

## Features

- 🎤 Real-time Khmer speech recognition
- 📱 Audio file upload and transcription
- 💾 Local data persistence (IndexedDB)
- 🎵 Audio player with progress control
- 📥 Export audio and transcript files
- 🌍 Internationalized date formatting

## Quick Start

```bash
# Install dependencies
npm install

# Start development server (default port: 3004)
npm run dev

# Build for production
npm run build
```

## ⚠️ Important Notes

### Port Configuration
- **Default port is locked to 3004** to maintain IndexedDB data consistency
- IndexedDB data is isolated per Origin (protocol + domain + port)
- Changing the port will result in a fresh database with no previous memos
- If you need to access your existing data, always use port 3004

### Network Requirements
- Requires internet connection for first-time model download (~50MB)
- Model is cached locally after first load
- If you're behind a proxy/firewall, ensure access to huggingface.co

## Tech Stack

- React 18 + Vite
- @xenova/transformers
- Web Audio API
- IndexedDB
