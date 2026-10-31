const http = require('http');
const app = require('./src/app');
const { initDb } = require('./src/database/schema');
const websocket = require('./src/core/websocket');
const { PORT } = require('./config/constants');
const { STATIC_DIR } = require('./config/paths');

const server = http.createServer(app);

// Attach WebSocket Manager to HTTP Server & Enable Realtime Live Reload
websocket.attachServer(server);
websocket.enableStaticLiveReload(STATIC_DIR);

// Initialize Database & Start Server
initDb()
  .then(() => {
    server.listen(PORT, () => {
      console.log('========================================================');
      console.log('       OMNIREACH - OMNICHANNEL OUTREACH AUTOMATION      ');
      console.log('========================================================');
      console.log(`[INFO] Landing Page:  http://localhost:${PORT}/`);
      console.log(`[INFO] Dashboard App: http://localhost:${PORT}/dashboard`);
      console.log('[INFO] Realtime WebSocket aktif di /ws');
      console.log('========================================================');
    });
  })
  .catch((err) => {
    console.error('Database initialization failed:', err);
    process.exit(1);
  });
