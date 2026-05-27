# BP-Arena: AOE Internal Client Implementation Plan

This project aims to build a custom game client for Age of Empires (AOE) for internal company use, inspired by Xarena. It will feature user authentication, room management, and a desktop launcher.

## 🏗️ Architecture

### 1. Frontend (Client UI)
- **Framework**: React (via Vite)
- **Styling**: Vanilla CSS with a modern, "Gaming" aesthetic (dark mode, neon accents, glassmorphism).
- **Desktop Wrapper**: Electron (to interact with the OS and launch games).

### 2. Backend (Server)
- **Framework**: **Golang** (Gin / Fiber)
- **Real-time**: **WebSockets** (Gorilla) for live room updates and matchmaking.
- **Database**: SQLite (for simplicity) or PostgreSQL (via GORM).

### 3. Networking & Launcher
- **Launcher**: Go's `os/exec` or Electron's `child_process` to start AOE.
- **LAN Emulation**: UDP Broadcast forwarding / Proxying via Go (if needed).

## 📂 Project Structure

```text
BP-Arena/
├── client/          # Vite + React + Electron UI
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── styles/
│   └── main.mjs     # Electron entry point
├── server/          # Golang Backend
│   ├── cmd/         # Entry points (main.go)
│   ├── internal/    # Business logic (handlers, models, services)
│   ├── go.mod
│   └── go.sum
└── shared/          # Shared types and constants
```

## 🚀 Phase 1: Foundation & UI Mockup
1. Initialize the project structure (Client & Go Server).
2. Setup Vite + React with a premium "Arena" design system.
3. Build the Login and Lobby pages.

## 🚀 Phase 2: Backend Development (Go)
1. Setup Go server with Gin and GORM.
2. Implement WebSocket for real-time room sync.
3. User Auth (JWT).

## 🚀 Phase 3: Desktop & Launcher Integration
1. Wrap the UI in Electron.
2. Implement the "Launch Game" feature (searching for game path, starting `.exe`).

## 🚀 Phase 4: Polish & Internal Deployment
1. Add match statistics and player profiles.
2. Setup a simple installer/distribution method.

---
**Next Step**: Initializing the project structure.
