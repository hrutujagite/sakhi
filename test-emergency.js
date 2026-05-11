require('dotenv').config();

// ─── COLOUR HELPERS ───────────────────────────────────────────────────────────
const green  = (t) => `\x1b[32m${t}\x1b[0m`;
const red    = (t) => `\x1b[31m${t}\x1b[0m`;
const yellow = (t) => `\x1b[33m${t}\x1b[0m`;
const bold   = (t) => `\x1b[1m${t}\x1b[0m`;

let passed = 0, failed = 0;

const ok   = (label) => { console.log(green(`  ✅ PASS: ${label}`)); passed++; };
const fail = (label, reason) => { console.log(red(`  ❌ FAIL: ${label}`)); console.log(`       → ${reason}`); failed++; };
const section = (title) => console.log(`\n${bold(yellow('━━━ ' + title + ' ━━━'))}`);

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — DISTRESS KEYWORD DETECTION
// ─────────────────────────────────────────────────────────────────────────────
section('1. Distress Keyword Detection');

const { isDistress, isActiveConversation } = require('./utils/emergencyMode');

const distressTests = [
  { msg: 'help',                   lang: 'en', expect: true,  label: 'English: "help"' },
  { msg: 'please help me',         lang: 'en', expect: true,  label: 'English: "please help me"' },
  { msg: 'save me',                lang: 'en', expect: true,  label: 'English: "save me"' },
  { msg: 'I am fine today',        lang: 'en', expect: false, label: 'English: safe message' },
  { msg: 'bachao',                 lang: 'hl', expect: true,  label: 'Hinglish: "bachao"' },
  { msg: 'mujhe madad chahiye',    lang: 'hl', expect: true,  label: 'Hinglish: "mujhe madad chahiye"' },
  { msg: 'kya recipe batao',       lang: 'hl', expect: false, label: 'Hinglish: safe message' },
  { msg: 'bachao mujhe',           lang: 'hi', expect: true,  label: 'Hindi: "bachao mujhe"' },
  { msg: 'vaachava',               lang: 'mr', expect: true,  label: 'Marathi: "vaachava"' },
  { msg: 'sahayam',                lang: 'te', expect: true,  label: 'Telugu: "sahayam"' },
  { msg: 'udavi',                  lang: 'ta', expect: true,  label: 'Tamil: "udavi"' },
];

distressTests.forEach(({ msg, lang, expect, label }) => {
  const result = isDistress(msg, lang);
  result === expect ? ok(label) : fail(label, `Got ${result}, expected ${expect}`);
});

// isActiveConversation
const now = Date.now();
const activeSession   = { lastActiveTime: now - 5 * 60 * 1000, messageCount: 3 }; // 5 min ago, 3 msgs
const inactiveSession = { lastActiveTime: now - 2 * 60 * 60 * 1000, messageCount: 5 }; // 2 hours ago
const newSession      = { lastActiveTime: now, messageCount: 1 };

isActiveConversation(activeSession)   ? ok('Active conversation detected correctly')   : fail('Active conversation', 'Should be true');
isActiveConversation(inactiveSession) ? fail('Inactive conversation', 'Should be false') : ok('Inactive (>1hr) detected correctly');
isActiveConversation(newSession)      ? fail('New session (1 msg)', 'Should be false')   : ok('New session (<2 msgs) detected correctly');

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — LOCATION TOKEN
// ─────────────────────────────────────────────────────────────────────────────
section('2. Location Token');

const { generateToken, getTokenData, storeCoords, invalidateToken } = require('./utils/locationToken');

const FAKE_SENDER = 'whatsapp:+919999999999';

// Generate
const token = generateToken(FAKE_SENDER);
typeof token === 'string' && token.length === 32
  ? ok(`Token generated: ${token}`)
  : fail('Token generation', `Got: ${token}`);

// Retrieve
const data = getTokenData(token);
data && data.sender === FAKE_SENDER
  ? ok('Token data retrieved correctly')
  : fail('Token retrieval', JSON.stringify(data));

// Store coordinates
const stored = storeCoords(token, 19.0760, 72.8777);
stored ? ok('Coordinates stored in token') : fail('storeCoords', 'Returned false');

const dataAfter = getTokenData(token);
dataAfter?.lat === 19.0760 && dataAfter?.lng === 72.8777
  ? ok('Coordinates read back correctly')
  : fail('Coordinate read-back', JSON.stringify(dataAfter));

// Invalidate
invalidateToken(token);
const afterInvalidate = getTokenData(token);
afterInvalidate === null
  ? ok('Token invalidated correctly (returns null)')
  : fail('Token invalidation', 'Token still exists after invalidate');

// Expired token simulation
const expiredToken = generateToken(FAKE_SENDER);
// Manually corrupt expiry
const internal = require('./utils/locationToken');
// (We can't directly access the Map, so just test that a random token returns null)
const fakeResult = getTokenData('00000000000000000000000000000000');
fakeResult === null ? ok('Non-existent token returns null') : fail('Non-existent token', 'Should return null');

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — QUICK REPLY HANDLERS (no Twilio calls)
// ─────────────────────────────────────────────────────────────────────────────
section('3. Quick Reply Handlers (offline)');

const { handleSafetySteps, handleMoreShelters, handleSafeNow } = require('./utils/emergencyMode');
const sessions = require('./utils/sessions');

// Setup a fake emergency session
const fakeSender = 'whatsapp:+910000000001';
sessions[fakeSender] = {
  state: 'EMERGENCY',
  emergencyStartTime: Date.now(),
  locationCaptured: false,
  locationCoords: null,
  trustedContactAlerted: false,
  reAlerted: false,
  checkInCount: 0,
  allShelters: [
    { name: 'One Stop Centre - Mumbai', address: 'Sion Hospital, Mumbai', phone: '18002330505' },
    { name: 'One Stop Centre - Pune',   address: 'Sassoon Hospital, Pune', phone: '18002330505' },
  ],
  emergencyShelter: { name: 'One Stop Centre - Mumbai', address: 'Sion Hospital, Mumbai', phone: '18002330505' },
  trustedContact: { name: 'Priya', phone: '+919876543210' },
  policeAlertPreference: false,
  locationToken: null,
  lang: 'hl',
};

// Safety steps
const safetyMsg = handleSafetySteps();
safetyMsg.includes('Safety Steps') && safetyMsg.includes('181')
  ? ok('Safety steps message contains expected content')
  : fail('Safety steps', 'Missing key content');

// More shelters
const shelterMsg = handleMoreShelters(sessions[fakeSender]);
shelterMsg.includes('Mumbai') && shelterMsg.includes('181')
  ? ok('More shelters message lists shelters correctly')
  : fail('More shelters', shelterMsg.substring(0, 100));

// No shelters fallback
const noShelterSession = { allShelters: [] };
const fallbackMsg = handleMoreShelters(noShelterSession);
fallbackMsg.includes('181')
  ? ok('No-shelter fallback includes helpline 181')
  : fail('No-shelter fallback', fallbackMsg.substring(0, 100));

// Safe now
const safeReply = handleSafeNow(fakeSender, sessions[fakeSender]);
safeReply.includes('relieved') && sessions[fakeSender].state === 'SUPPORT'
  ? ok('handleSafeNow resets state to SUPPORT and returns warm reply')
  : fail('handleSafeNow', `state=${sessions[fakeSender].state}, reply=${safeReply.substring(0,50)}`);

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — DISGUISE MODE
// ─────────────────────────────────────────────────────────────────────────────
section('4. Disguise Mode');

const { activateDisguise } = require('./utils/emergencyMode');

const disguiseSender = 'whatsapp:+910000000002';
sessions[disguiseSender] = {
  state: 'EMERGENCY',
  emergencyStartTime: Date.now(),
  locationToken: null,
  locationCoords: null,
  locationCaptured: false,
  trustedContactAlerted: false,
  contactAlertTime: null,
  checkInCount: 0,
  reAlerted: false,
};

const disguiseReply = activateDisguise(disguiseSender, sessions[disguiseSender]);

sessions[disguiseSender].state === 'DISGUISE'
  ? ok('State changed to DISGUISE')
  : fail('Disguise state', `Got: ${sessions[disguiseSender].state}`);

sessions[disguiseSender].emergencyStartTime === null
  ? ok('Emergency start time wiped from session')
  : fail('Emergency wipe', 'emergencyStartTime should be null');

typeof disguiseReply === 'string' && disguiseReply.length > 0
  ? ok(`Innocent reply returned: "${disguiseReply.substring(0, 50)}..."`)
  : fail('Disguise reply', 'Empty or invalid');

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 — LOCATION CAPTURE PAGE (server test)
// ─────────────────────────────────────────────────────────────────────────────
section('5. Location Capture Page (HTTP test)');

const http = require('http');

// Start a mini server for testing
const express = require('express');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
const locationRoute = require('./routes/location');
app.use('/loc', locationRoute);

const server = app.listen(0, async () => {
  const port = server.address().port;
  const testToken = generateToken('whatsapp:+910000000003');
  const base = `http://localhost:${port}`;

  // Test 1: GET valid token → should return HTML
  await new Promise((resolve) => {
    http.get(`${base}/loc/${testToken}`, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        res.statusCode === 200 && body.includes('Daily Wellness Tip')
          ? ok('GET /loc/:token serves innocent wellness page (200)')
          : fail('GET /loc/:token', `Status: ${res.statusCode}, body snippet: ${body.substring(0,80)}`);
        resolve();
      });
    });
  });

  // Test 2: GET invalid token → 404
  await new Promise((resolve) => {
    http.get(`${base}/loc/invalidtoken123`, (res) => {
      res.statusCode === 404
        ? ok('GET /loc/invalidtoken returns 404')
        : fail('Invalid token 404', `Got status: ${res.statusCode}`);
      resolve();
    });
  });

  // Test 3: POST coordinates to valid token
  const postToken = generateToken('whatsapp:+910000000003');
  await new Promise((resolve) => {
    const body = JSON.stringify({ lat: 19.076, lng: 72.877 });
    const req = http.request(`${base}/loc/${postToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': body.length },
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        const json = JSON.parse(data);
        res.statusCode === 200 && json.ok === true
          ? ok('POST /loc/:token stores coordinates and returns { ok: true }')
          : fail('POST /loc/:token', `Status: ${res.statusCode}, body: ${data}`);
        // Token should now be invalidated
        getTokenData(postToken) === null
          ? ok('Token invalidated after POST (one-use only)')
          : fail('Token one-use', 'Token still exists after POST');
        resolve();
      });
    });
    req.write(body);
    req.end();
  });

  // Test 4: POST to already-used token → 410 Gone
  await new Promise((resolve) => {
    const expiredBody = JSON.stringify({ lat: 0, lng: 0 });
    const req = http.request(`${base}/loc/${postToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': expiredBody.length },
    }, (res) => {
      res.statusCode === 410
        ? ok('POST to used token returns 410 Gone')
        : fail('Used token reuse', `Got status: ${res.statusCode}`);
      resolve();
    });
    req.write(expiredBody);
    req.end();
  });

  server.close();

  // ─── FINAL SUMMARY ─────────────────────────────────────────────────────────
  console.log('\n' + bold('━━━ RESULTS ━━━'));
  console.log(green(`  Passed: ${passed}`));
  if (failed > 0) console.log(red(`  Failed: ${failed}`));
  else console.log(green('  All tests passed! 🌸'));
});
