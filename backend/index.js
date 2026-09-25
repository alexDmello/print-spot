// Root entrypoint bridge for Vercel Express service
// Wraps the Express app import in error handling to surface module-level crashes
let app;
try {
  app = require('./dist/server.js');
} catch (err) {
  // If the Express app fails to load, create a minimal handler that returns the error
  console.error('[FATAL] Express app failed to load:', err);
  const express = require('express');
  app = express();
  const errorMessage = err && err.message ? err.message : String(err);
  const errorStack = err && err.stack ? err.stack : 'No stack trace';
  app.use((_req, res) => {
    res.status(500).json({
      error: 'Backend failed to initialize',
      message: errorMessage,
      stack: process.env.NODE_ENV !== 'production' ? errorStack : undefined,
    });
  });
}

module.exports = app;
