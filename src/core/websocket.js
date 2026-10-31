const WebSocket = require('ws');

class WebSocketManager {
  constructor() {
    this.clients = new Set();
  }

  attachServer(server) {
    const wss = new WebSocket.Server({ server, path: '/ws' });

    wss.on('connection', (ws) => {
      this.clients.add(ws);
      ws.on('close', () => this.clients.delete(ws));
      ws.on('error', () => this.clients.delete(ws));

      // Kirim initial ping / status
      this.sendTo(ws, { type: 'connected', message: 'WebSocket realtime connected' });
    });

    return wss;
  }

  enableStaticLiveReload(staticDir) {
    const fs = require('fs');
    if (!fs.existsSync(staticDir)) return;

    let debounceTimer = null;
    try {
      fs.watch(staticDir, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        // Skip hidden or temp files
        if (filename.startsWith('.') || filename.includes('node_modules')) return;

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          this.broadcast('live_reload', { file: filename });
        }, 200);
      });
    } catch (e) {
      console.warn('File watch error:', e.message);
    }
  }

  sendTo(ws, payload) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(payload));
      } catch (err) {
        console.error('WebSocket send error:', err);
      }
    }
  }

  broadcast(type, data = {}) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const timestamp = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    const payload = JSON.stringify({
      type,
      data,
      timestamp
    });

    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(payload);
        } catch (err) {
          this.clients.delete(ws);
        }
      }
    }
  }
}

module.exports = new WebSocketManager();

