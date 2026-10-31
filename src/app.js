const express = require('express');
const path = require('path');
const { PROOFS_DIR, STATIC_DIR } = require('../config/paths');
const apiRoutes = require('./api/routes/index');

const app = express();

// Body Parser Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static Assets
app.use('/proofs', express.static(PROOFS_DIR));
app.use('/static', express.static(STATIC_DIR));

// API Routes
app.use('/api', apiRoutes);

// Frontend Routes
// 1. Root (/) -> Landing Page (landing.html)
app.get('/', (req, res) => {
  res.sendFile(path.join(STATIC_DIR, 'landing.html'));
});

app.get('/landing', (req, res) => {
  res.sendFile(path.join(STATIC_DIR, 'landing.html'));
});

// 2. Dashboard (/dashboard) -> Main Automation Dashboard (dashboard.html)
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(STATIC_DIR, 'dashboard.html'));
});

app.get('/app', (req, res) => {
  res.sendFile(path.join(STATIC_DIR, 'dashboard.html'));
});

// Fallback error handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

module.exports = app;

