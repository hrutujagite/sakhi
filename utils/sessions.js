'use strict';

/**
 * Persistent session store backed by a JSON file (lowdb v1).
 *
 * Drop-in replacement for the old in-memory `sessions = {}` object.
 * Supports: sessions[key], sessions[key] = val, delete sessions[key]
 *
 * Fields that are NOT persisted (they are runtime-only):
 *   - history      (AI conversation history — too large, resets fine)
 *   - checkInTimer / confirmTimer references (can't serialise timers)
 *
 * All onboarding data IS persisted:
 *   state, lang, userName, userAddress, trustedContacts, trustedContactNames,
 *   disguiseKeyword, pincode, district, savedArea, policeAlertPreference,
 *   emergencyShelter, allShelters, locationCoords, locationToken, etc.
 */

const low  = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');

// Store the file alongside this module so it works on both local and Render
const DB_PATH = path.join(__dirname, '..', 'data', 'sessions.json');

const adapter = new FileSync(DB_PATH);
const db = low(adapter);

// Initialise with empty sessions object if file is blank
db.defaults({ sessions: {} }).write();

// Fields that hold runtime-only data (timers, large history) — skip persistence
const SKIP_KEYS = new Set(['history']);

/**
 * Write one session back to disk, stripping non-serialisable fields.
 */
function persist(sender, value) {
  if (!value) {
    db.get('sessions').unset(sender).write();
    return;
  }
  const safe = {};
  for (const [k, v] of Object.entries(value)) {
    if (SKIP_KEYS.has(k)) continue;
    // Skip timer IDs (numbers from setTimeout) — they are meaningless after restart
    if (k.endsWith('Timer') || k.endsWith('Timers')) continue;
    safe[k] = v;
  }
  db.get('sessions').set(sender, safe).write();
}

/**
 * Wrap a session object so every property assignment auto-saves to disk.
 */
function makeProxy(sender, raw) {
  return new Proxy(raw, {
    set(target, prop, value) {
      target[prop] = value;
      persist(sender, target);
      return true;
    },
    deleteProperty(target, prop) {
      delete target[prop];
      persist(sender, target);
      return true;
    },
  });
}

/**
 * The sessions store — looks and behaves exactly like the old plain object.
 */
const sessions = new Proxy({}, {
  // GET sessions[sender]
  get(_, sender) {
    // Special symbols/props used by JS internals — pass through
    if (typeof sender !== 'string') return undefined;

    // Already loaded in this process?
    const cached = Reflect.get(_, sender);
    if (cached) return cached;

    // Load from disk
    const stored = db.get(`sessions.${sender}`).value();
    if (!stored) return undefined;

    // Restore runtime fields that are never persisted
    stored.history = stored.history || [];

    const proxy = makeProxy(sender, stored);
    Reflect.set(_, sender, proxy);
    return proxy;
  },

  // SET sessions[sender] = { ... }
  set(_, sender, value) {
    if (typeof sender !== 'string') return true;
    if (value === undefined || value === null) {
      Reflect.deleteProperty(_, sender);
      persist(sender, null);
      return true;
    }
    // Ensure history always exists in memory
    value.history = value.history || [];
    const proxy = makeProxy(sender, value);
    Reflect.set(_, sender, proxy);
    persist(sender, value);
    return true;
  },

  // DELETE sessions[sender]
  deleteProperty(_, sender) {
    if (typeof sender !== 'string') return true;
    Reflect.deleteProperty(_, sender);
    persist(sender, null);
    return true;
  },

  // HAS — "sender in sessions"
  has(_, sender) {
    if (Reflect.has(_, sender)) return true;
    return db.get('sessions').has(sender).value();
  },
});

module.exports = sessions;
