const shelters = require('../data/shelters.json');

const findSheltersByPincode = (pincode) => {
  // First try exact pincode match
  let results = shelters.filter(s => s.pincode === pincode);

  // If no exact match, try same state by first 2 digits of pincode
  if (results.length === 0) {
    const pincodePrefix = pincode.substring(0, 2);
    results = shelters.filter(s => s.pincode.substring(0, 2) === pincodePrefix);
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
    response += `   📍 ${shelter.address}\n`;
    response += `   📞 ${shelter.phone}\n\n`;
  });

  response += `\nAll One Stop Centres are FREE and available 24/7.\n`;
  response += `Helpline: 181 | Police: 112`;

  return response;
};

module.exports = { findSheltersByPincode, formatShelterResponse };