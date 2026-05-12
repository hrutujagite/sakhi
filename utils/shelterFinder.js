const shelters = require('../data/shelters.json');
const haversineDistance = require('./distance');

function findSheltersByPincode(pincode) {
    if (!pincode) return [];
    
    // First try exact pincode match
    let results = shelters.filter(s => s.pincode === pincode);
    
    // If no exact match, check from 5 digits down to 3 digits
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

function findNearestShelter(userLat, userLng) {
    let nearest = null;
    let minDistance = Infinity;

    for (const shelter of shelters) {
        if (!shelter.lat || !shelter.lng) continue;

        const distance = haversineDistance(
            userLat,
            userLng,
            shelter.lat,
            shelter.lng
        );

        if (distance < minDistance) {
            minDistance = distance;
            nearest = {
                ...shelter,
                distance: distance.toFixed(2)
            };
        }
    }

    return nearest;
}

function findByDistrict(district, state) {
    return shelters.filter(s => {
        const sDistrict = s.district.toLowerCase();
        const qDistrict = district.toLowerCase();
        return (sDistrict.includes(qDistrict) || qDistrict.includes(sDistrict)) &&
               s.state.toLowerCase() === state.toLowerCase();
    });
}

function findByState(state) {
    return shelters.filter(s =>
        s.state.toLowerCase() === state.toLowerCase()
    );
}

function getBestShelter(session) {
    // 1. Try GPS location first (if available and nearest is within 50km)
    if (session.locationCoords?.lat && session.locationCoords?.lng) {
        const nearest = findNearestShelter(
            session.locationCoords.lat,
            session.locationCoords.lng
        );
        
        // Bonus Improvement: Check if distance is < 50 km
        if (nearest && parseFloat(nearest.distance) < 50) {
            return nearest;
        }
    }

    // 2. Fallback to district matching
    if (session.district && session.geoState) {
        const districtResults = findByDistrict(
            session.district,
            session.geoState
        );

        if (districtResults.length) {
            return districtResults[0]; // returning first match for district
        }
    }

    // 3. Fallback to pincode matching
    if (session.pincode) {
        const pinResults = findSheltersByPincode(session.pincode);
        if (pinResults.length) {
            return pinResults[0];
        }
    }

    // 4. Fallback to state matching
    if (session.geoState) {
        const stateResults = findByState(session.geoState);

        if (stateResults.length) {
            return stateResults[0]; // returning first match for state
        }
    }

    // 5. National Helpline Fallback
    return {
        isFallback: true,
        name: "National Women Helpline",
        helpline: "181",
        message: "Please contact the national women helpline."
    };
}

module.exports = { 
    findNearestShelter,
    findByDistrict,
    findByState,
    getBestShelter,
    findSheltersByPincode,
    formatShelterResponse
};