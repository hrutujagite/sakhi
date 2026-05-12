require('dotenv').config({ override: true });
const express = require('express');
const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const path = require('path');

// Routes
const webhookRoute = require('./routes/webhook');
app.use('/webhook', webhookRoute);

// Location capture route (innocent-looking wellness page)
const locationRoute = require('./routes/location');
app.use('/loc', locationRoute);

const sessions = require('./utils/sessions');
const fs = require('fs');
const path = require('path');
app.get('/debug/:phone', (req, res) => {
  const phone = req.params.phone.trim();
  const fixedPhone = phone.replace(/^ /, '+');
  const key = fixedPhone.startsWith('whatsapp:') ? fixedPhone : `whatsapp:${fixedPhone}`;

  console.log(`[Debug Route] Requested phone: "${phone}", resolved key: "${key}"`);

  let sess = sessions[key] || sessions[fixedPhone] || sessions[phone];
  if (!sess) {
    try {
      const dbData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'sessions.json'), 'utf8'));
      sess = dbData.sessions?.[key] || dbData.sessions?.[fixedPhone] || dbData.sessions?.[phone] || null;
    } catch (e) { }
  }
  res.json(sess || null);
});

// Health check
app.get('/', (req, res) => {
  res.send('Sakhi is running 🌸');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Sakhi server running on port ${PORT}`);
});
