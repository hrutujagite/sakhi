const crypto = require('crypto');

// In-memory store: token -> { sender, expiry, lat, lng, used }
const tokenStore = new Map();

const EMERGENCY_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const SUPPORT_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** Generate a unique one-time token for a sender. */
const generateToken = (sender, type = 'emergency') => {
  const token = crypto.randomBytes(16).toString('hex');
  const ttl = type === 'support' ? SUPPORT_TTL_MS : EMERGENCY_TTL_MS;
  tokenStore.set(token, {
    sender,
    type,
    expiry: Date.now() + ttl,
    lat: null,
    lng: null,
    used: false,
  });
  return token;
};

/** Retrieve token data. Returns null if expired or not found. */
const getTokenData = (token) => {
  const data = tokenStore.get(token);
  if (!data) return null;
  if (Date.now() > data.expiry) {
    tokenStore.delete(token);
    return null;
  }
  return data;
};

/** Store coordinates captured from the location page. */
const storeCoords = (token, lat, lng) => {
  const data = getTokenData(token);
  if (!data) return false;
  data.lat = lat;
  data.lng = lng;
  data.used = true;
  return true;
};

/** Invalidate a token immediately (after use or on disguise/erase). */
const invalidateToken = (token) => {
  tokenStore.delete(token);
};

/** Prune expired tokens (call periodically if needed). */
const pruneExpired = () => {
  const now = Date.now();
  for (const [token, data] of tokenStore.entries()) {
    if (now > data.expiry) tokenStore.delete(token);
  }
};

// Prune every 10 minutes automatically
setInterval(pruneExpired, 10 * 60 * 1000);

module.exports = { generateToken, getTokenData, storeCoords, invalidateToken };
