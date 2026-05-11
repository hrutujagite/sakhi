const shelters = require('../data/shelters.json');

const findSheltersByPincode = (pincode) => {
  if (!pincode) return [];

  // First try exact pincode match
  let results = shelters.filter(s => s.pincode === pincode);

  // If no exact match, gradually check from 5 digits down to 2 digits to find the closest region
  for (let len = 5; len >= 2 && results.length === 0; len--) {
    const prefix = pincode.substring(0, len);
    results = shelters.filter(s => s.pincode.startsWith(prefix));
  }

  // If still nothing, return first 3 shelters as fallback
  if (results.length === 0) {
    results = shelters.slice(0, 3);
  }

  // Return max 3 results
  return results.slice(0, 3);
};

const formatShelterResponse = (pincode) => {
  const results = findSheltersByPincode(pincode);

  let response = `🏠 Nearest shelters for pincode ${pincode}:\n\n`;

  results.forEach((shelter, index) => {
    response += `${index + 1}. *${shelter.name}*\n`;
    response += `   📍 ${shelter.address}, ${shelter.district}, ${shelter.state} - ${shelter.pincode}\n`;
    response += `   📞 ${shelter.phone}\n\n`;
  });

  response += `\nAll One Stop Centres are FREE and available 24/7.\n`;
  response += `Helpline: 181 | Police: 112`;

  return response;
};

module.exports = { findSheltersByPincode, formatShelterResponse };