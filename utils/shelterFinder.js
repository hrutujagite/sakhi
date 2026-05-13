'use strict';

const shelters = require('../data/shelters.json');
const haversineDistance = require('./distance');

// ─── GOOGLE MAPS LINK BUILDER ─────────────────────────────────────────────────

function getMapsLink(shelter) {
  if (shelter.lat && shelter.lng) {
    return `https://www.google.com/maps?q=${shelter.lat},${shelter.lng}`;
  }
  const dest = encodeURIComponent(`${shelter.name}, ${shelter.address}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
}

// ─── GPS-ONLY: FIND NEAREST SHELTERS ─────────────────────────────────────────
// TASK 2: Shelter recommendations ONLY use GPS coordinates + Haversine distance.
// All pincode, district, and state fallbacks have been removed.
//
// Returns up to `limit` shelters within 50km, sorted ascending by distance.
// Each result includes: name, address, phone, distance (km), mapsLink.
// Returns [] if no shelter exists within 50km or coords are unavailable.

function findNearestShelters(lat, lng, limit = 3) {
  if (lat == null || lng == null) return [];

  const results = [];

  for (const shelter of shelters) {
    if (!shelter.lat || !shelter.lng) continue;

    const distance = haversineDistance(lat, lng, shelter.lat, shelter.lng);

    // Only include shelters within 50km
    if (distance <= 50) {
      results.push({
        name: shelter.name,
        address: shelter.address,
        district: shelter.district,
        state: shelter.state,
        pincode: shelter.pincode,
        phone: shelter.phone,
        lat: shelter.lat,
        lng: shelter.lng,
        distance: parseFloat(distance.toFixed(2)),
        mapsLink: getMapsLink(shelter),
      });
    }
  }

  // Sort ascending by distance
  results.sort((a, b) => a.distance - b.distance);

  return results.slice(0, limit);
}

// ─── LEGACY WRAPPER (kept for call-site compatibility) ────────────────────────
// TASK 2: getBestShelter() is now a thin wrapper around findNearestShelters().
// It returns the single nearest shelter within 50km, or null if none found.
// All district / pincode / state fallbacks have been intentionally removed.

function getBestShelter(session) {
  // 1. Try GPS location first (if available and nearest is within 50km)
  if (session.locationCoords && session.locationCoords.lat != null && session.locationCoords.lng != null) {
    const nearest = findNearestShelters(session.locationCoords.lat, session.locationCoords.lng, 1);
    if (nearest.length > 0) return nearest[0];
  }

  // 2. Fallback to district matching
  if (session.district) {
    const districtResults = findByDistrict(session.district, session.geoState);
    if (districtResults.length > 0) return districtResults[0];
  }

  // 3. Fallback to pincode matching
  if (session.pincode) {
    const pinResults = findSheltersByPincode(session.pincode);
    if (pinResults.length > 0) return pinResults[0];
  }

  // 4. Fallback to state matching
  if (session.geoState) {
    const stateResults = findByState(session.geoState);
    if (stateResults.length > 0) return stateResults[0];
  }

  // 5. National Helpline Fallback
  return {
    isFallback: true,
    name: "National Women Helpline",
    phone: "181",
    message: "Please contact the national women helpline."
  };
}

// ─── FORMAT MULTI-SHELTER RESPONSE ───────────────────────────────────────────
// TASK 3: Returns a WhatsApp-readable block listing up to 3 nearest shelters.

function formatNearestSheltersResponse(nearestShelters) {
  if (!nearestShelters || nearestShelters.length === 0) {
    return `🏠 *No nearby support centres found.*

To find centres closest to you, please share your *Live Location* using the link above.

Otherwise, you can call the Women Helpline: *181* (24/7, free).`;
  }

  let response = `🏠 *Nearby Safe Spaces:*\n\n`;
  nearestShelters.forEach((shelter, index) => {
    response += `${index + 1}️⃣ *${shelter.name}*\n`;
    response += `📍 ${shelter.address}, ${shelter.district}, ${shelter.state} - ${shelter.pincode}\n`;
    response += `📞 ${shelter.phone}\n`;
    if (shelter.distance) {
      response += `📏 ${shelter.distance} km away\n`;
    }
    response += `🗺️ ${shelter.mapsLink}\n\n`;
  });

  response += `_Choose the option safest and easiest for you to reach._\n\n`;
  response += `Helpline: 181 | Police: 112`;
  return response;
}

// ─── PINCODE LOOKUP (kept for formatShelterResponse only) ────────────────────
// NOTE: This is no longer used in emergency or support shelter flows.
// Retained only as a reference; can be removed in a future cleanup.

function findSheltersByPincode(pincode) {
  if (!pincode) return [];
  let results = shelters.filter(s => s.pincode === pincode);
  for (let len = 5; len >= 3 && results.length === 0; len--) {
    const prefix = pincode.substring(0, len);
    results = shelters.filter(s => s.pincode.startsWith(prefix));
  }
  return results.slice(0, 3);
}

function formatShelterResponse(pincode) {
  const results = findSheltersByPincode(pincode);
  if (results.length === 0) {
    return `🏠 We couldn't find a shelter exactly matching pincode ${pincode}.\n\nPlease call Women Helpline: 181`;
  }
  let response = `🏠 Nearest shelters for pincode ${pincode}:\n\n`;
  results.forEach((shelter, index) => {
    response += `${index + 1}. *${shelter.name}*\n`;
    response += `   📍 ${shelter.address}, ${shelter.district}, ${shelter.state} - ${shelter.pincode}\n`;
    response += `   📞 ${shelter.phone}\n\n`;
  });
  response += `\nAll One Stop Centres are FREE and available 24/7.\n`;
  response += `Helpline: 181 | Police: 112`;
  return response;
}

// ─── LEGACY SINGLE-SHELTER FINDERS (no longer used in main flows) ─────────────

function findNearestShelter(userLat, userLng) {
  const results = findNearestShelters(userLat, userLng, 1);
  return results.length > 0 ? results[0] : null;
}

function findByDistrict(district, state) {
  const qDistrict = district.toLowerCase().trim();
  
  // Try matching with state first
  if (state) {
    const matched = shelters.filter(s => {
      const sDistrict = s.district.toLowerCase();
      return (sDistrict.includes(qDistrict) || qDistrict.includes(sDistrict)) &&
             s.state.toLowerCase() === state.toLowerCase();
    });
    if (matched.length > 0) return matched;
  }

  // If no match with state, try matching district globally
  return shelters.filter(s => {
    const sDistrict = s.district.toLowerCase();
    return (sDistrict.includes(qDistrict) || qDistrict.includes(sDistrict));
  });
}

function findByState(state) {
  return shelters.filter(s =>
    s.state.toLowerCase() === state.toLowerCase()
  );
}

module.exports = {
  findNearestShelters,        // TASK 2 & 3: primary export — GPS-only, top 3
  formatNearestSheltersResponse, // TASK 3: multi-shelter WhatsApp formatter
  getBestShelter,             // legacy wrapper — single nearest or null
  findNearestShelter,         // legacy single finder
  findByDistrict,             // legacy — retained, not used in main flows
  findByState,                // legacy — retained, not used in main flows
  findSheltersByPincode,      // legacy — retained for reference
  formatShelterResponse,      // legacy pincode formatter
};