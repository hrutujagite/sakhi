'use strict';

const twilio = require('twilio');
const { findSheltersByPincode } = require('./shelterFinder');
const { generateToken, getTokenData, invalidateToken } = require('./locationToken');
const sessions = require('./sessions');

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const FALLBACKS = {
  womenHelpline: '181',
  womenPoliceCell: '1091',
  emergency: '112',
};

const BASE_URL = process.env.BASE_URL || 'https://sakhi.onrender.com';

// ─── DISTRESS KEYWORDS ────────────────────────────────────────────────────────

const DISTRESS_KEYWORDS = {
  en: ['help', 'danger', 'i am in danger', 'i need help', 'save me', 'please help', 'emergency', 'he is hitting me', 'hurting me'],
  hi: ['bachao', 'mujhe bachao', 'madad karo', 'mujhe madad chahiye', 'dar lag raha hai', 'khatara', 'maar raha hai', 'maro mat'],
  hl: ['bachao', 'mujhe bachao', 'madad karo', 'mujhe madad chahiye', 'dar lag raha hai', 'khatara', 'help karo', 'please help'],
  mr: ['vaachava', 'mala madad kara', 'dhoka', 'bhiti', 'aata vaachava', 'maartoy'],
  te: ['sahayam', 'naaku sahayam kavali', 'help cheyyi', 'naaku bhayam'],
  ta: ['udavi', 'ennai kapattu', 'bayam', 'kapattu'],
  kn: ['sahaya', 'nanage sahaya beku', 'bhaya'],
  bn: ['bachao', 'amar sahayo chai', 'bipad'],
  gu: ['bachavo', 'madad karo', 'khatro'],
  pa: ['bachao', 'mainu bachao', 'khatara', 'madad karo'],
};

// ─── MULTI-LANGUAGE TEMPLATES ────────────────────────────────────────────────
// Softer wording so messages look less suspicious if seen by someone else

const TEMPLATES = {
  // Opening line of emergency message
  opening: {
    en: 'I\'m here with you. 🌸',
    hl: 'Main yahan hoon. 🌸',
    hi: 'मैं यहाँ हूँ। 🌸',
    mr: 'मी इथे आहे. 🌸',
  },
  // Shelter label
  shelterLabel: {
    en: '📍 *Safe space:*',
    hl: '📍 *Safe jagah:*',
    hi: '📍 *सुरक्षित जगह:*',
    mr: '📍 *सुरक्षित जागा:*',
  },
  // Shelter fallback
  shelterFallback: {
    en: '📍 Safe space: Call 181 for info.',
    hl: '📍 Safe jagah: Jaankari ke liye 181 call karein.',
    hi: '📍 सुरक्षित जगह: जानकारी के लिए 181 पर कॉल करें।',
    mr: '📍 सुरक्षित जागा: माहितीसाठी 181 वर फोन करा.',
  },
  // Contacts label
  contactsLabel: {
    en: '📞 *Helpful numbers:*',
    hl: '📞 *Helpful numbers:*',
    hi: '📞 *सहायक नंबर:*',
    mr: '📞 *उपयुक्त क्रमांक:*',
  },
  // Location link instruction
  locationInstruction: {
    en: '🔗 *Tap to send location:*',
    hl: '🔗 *Location bhejనే ke liye tap karein:*',
    hi: '🔗 *लोकेशन भेजने के लिए दबाएं:*',
    mr: '🔗 *लोकेशन पाठवण्यासाठी दाबा:*',
  },
  // Quick reply options
  options: {
    en: 'Reply:\n1️⃣ Alert friend  2️⃣ Safe steps  3️⃣ More places  4️⃣ I\'m safe',
    hl: 'Reply:\n1️⃣ Dost ko batao  2️⃣ Surakshit kadam  3️⃣ Aur jagah  4️⃣ Main theek hoon',
    hi: 'उत्तर दें:\n1️⃣ दोस्त को बताएं  2️⃣ सुरक्षित कदम  3️⃣ और जगहें  4️⃣ मैं ठीक हूँ',
    mr: 'उत्तर द्या:\n1️⃣ मित्राला सांगा  2️⃣ सुरक्षित पावले  3️⃣ अजून जागा  4️⃣ मी ठीक आहे',
  },
  // Erase hint at bottom
  eraseHint: {
    en: '_Type *Erase* anytime to hide chat._',
    hl: '_Chat chupane ke liye kabhi bhi *Erase* likhein._',
    hi: '_चैट छिपाने के लिए कभी भी *Erase* लिखें।_',
    mr: '_चॅट लपवण्यासाठी कधीही *Erase* लिहा._',
  },
  // Check-in message
  checkIn: {
    en: 'Checking in. You okay? Reply *OK* 🌸',
    hl: 'Theek ho? Reply *OK* 🌸',
    hi: 'ठीक हो? *OK* लिखें 🌸',
    mr: 'ठीक आहात? *OK* लिहा 🌸',
  },
  // Confirmation follow-up (2 min timer)
  confirmFollowUp: {
    en: 'Safe? Reply *OK* 🌸',
    hl: 'Surakshit ho? *OK* likho 🌸',
    hi: 'सुरक्षित हो? *OK* लिखो 🌸',
    mr: 'सुरक्षित आहात? *OK* लिहा 🌸',
  },
  // Safety steps
  safetySteps: {
    en: [
      '*If you can move:*',
      '→ Lock yourself in or find an exit',
      '→ Take phone + ID + cash quietly',
      '→ Don\'t say you\'re leaving',
      '→ Go to shelter or call 181\n',
      '*Can\'t move?*',
      '→ Stay calm, lock the door',
      '→ Message me when safe\n',
      '181 | 112',
    ].join('\n'),
    hl: [
      '*Ja sakti ho to:*',
      '→ Taale wali jagah mein jao ya bahar niklo',
      '→ Phone + pehchaan patra + paisa chupchap lo',
      '→ Batao mat ki ja rahi ho',
      '→ Surakshit jagah jao ya 181 call karo\n',
      '*Nahi ja sakti?*',
      '→ Shaant raho, darwaza band karo',
      '→ Surakshit hone par sandesh karo\n',
      '181 | 112',
    ].join('\n'),
    hi: [
      '*जा सकती हो तो:*',
      '→ ताले वाली जगह जाओ या बाहर निकलो',
      '→ फोन + पहचान पत्र + पैसे चुपचाप लो',
      '→ बताओ मत कि जा रही हो',
      '→ सुरक्षित जगह जाओ या 181 पर कॉल करो\n',
      '*नहीं जा सकतीं?*',
      '→ शांत रहो, दरवाज़ा बंद करो',
      '→ सुरक्षित होने पर संदेश करो\n',
      '181 | 112',
    ].join('\n'),
    mr: [
      '*जाता येत असेल तर:*',
      '→ कुलूप असलेल्या खोलीत जा किंवा बाहेर पड',
      '→ फोन + ओळखपत्र + पैसे शांतपणे घे',
      '→ जात आहेस हे सांगू नकोस',
      '→ सुरक्षित जागी जा किंवा 181 वर फोन कर\n',
      '*जाता येत नसेल?*',
      '→ शांत रहा, दार बंद कर',
      '→ सुरक्षित झाल्यावर निरोप पाठव\n',
      '181 | 112',
    ].join('\n'),
  },
};

// Helper — pick the right language, fallback to English
const t = (key, lang) => TEMPLATES[key][lang] || TEMPLATES[key].en;

// ─── GOOGLE MAPS LINK ─────────────────────────────────────────────────────────
// Opens Google Maps with directions FROM user's current GPS TO the shelter.
// No shelter coordinates needed — Google Maps resolves the address automatically.
const getMapsLink = (shelter) => {
  const dest = encodeURIComponent(`${shelter.name}, ${shelter.address}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
};

const DISGUISE_MSGS = [
  '🌿 Here is a healthy recipe idea for today: Moong Dal Khichdi — light, nutritious, and ready in 20 minutes.',
  '🍵 Wellness tip: Start your morning with warm turmeric milk. Simple and soothing.',
  '🥗 Today\'s healthy meal: Sprout salad with lemon and a pinch of chaat masala!',
];

// ─── TWILIO OUTBOUND ──────────────────────────────────────────────────────────

const sendMsg = async (to, body) => {
  try {
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      to,
      body,
    });
  } catch (err) {
    console.error('[Emergency] Outbound failed to', to, ':', err.message);
  }
};

// ─── DISTRESS DETECTION ───────────────────────────────────────────────────────

const isDistress = (msg, lang) => {
  if (!msg) return false;
  const lower = msg.toLowerCase().trim();
  const langKws = DISTRESS_KEYWORDS[lang] || [];
  const enKws = DISTRESS_KEYWORDS.en;
  const all = lang === 'en' ? enKws : [...langKws, ...enKws];
  return all.some(kw => lower.includes(kw));
};

const isActiveConversation = (session) => {
  if (!session.lastActiveTime) return false;
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  return session.lastActiveTime >= oneHourAgo && (session.messageCount || 0) >= 2;
};

// ─── CHECK-IN TIMERS ──────────────────────────────────────────────────────────

const checkInTimers = {};

const clearCheckInTimers = (sender) => {
  (checkInTimers[sender] || []).forEach(t => clearTimeout(t));
  delete checkInTimers[sender];
};

const startCheckInTimers = (sender) => {
  clearCheckInTimers(sender);

  const t1 = setTimeout(async () => {
    const s = sessions[sender];
    if (!s || s.state !== 'EMERGENCY') return;
    s.checkInCount = (s.checkInCount || 0) + 1;
    await sendMsg(sender, t('checkIn', s.lang || 'en'));
  }, 15 * 60 * 1000);

  const t2 = setTimeout(async () => {
    const s = sessions[sender];
    if (!s || s.state !== 'EMERGENCY') return;
    s.checkInCount = (s.checkInCount || 0) + 1;
    await sendMsg(sender, t('checkIn', s.lang || 'en'));
  }, 30 * 60 * 1000);

  const t3 = setTimeout(async () => {
    const s = sessions[sender];
    if (!s || s.state !== 'EMERGENCY') return;
    const contact = s.trustedContact;
    if (contact?.phone && !s.reAlerted) {
      s.reAlerted = true;
      await sendMsg(
        `whatsapp:${contact.phone}`,
        `⚠️ URGENT: ${contact.name || 'A woman you know'} has not confirmed she is safe.\n\n` +
        `Please try reaching her immediately.\n` +
        `If she does not respond, please call 112.\n\n` +
        `— Sakhi Safety App`
      );
    }
  }, 45 * 60 * 1000);

  checkInTimers[sender] = [t1, t2, t3];
};

// ─── CONFIRMATION TIMERS (before full emergency activates) ────────────────────

const confirmTimers = {};

const clearConfirmTimers = (sender) => {
  (confirmTimers[sender] || []).forEach(t => clearTimeout(t));
  delete confirmTimers[sender];
};

const startConfirmTimers = (sender) => {
  clearConfirmTimers(sender);

  // 2 min: send follow-up if still waiting
  const t1 = setTimeout(async () => {
    const s = sessions[sender];
    if (!s || s.state !== 'EMERGENCY_CONFIRM') return;
    s.state = 'EMERGENCY_FOLLOWUP';
    await sendMsg(sender, t('confirmFollowUp', s.lang || 'en'));
  }, 2 * 60 * 1000);

  // 5 min total: auto-activate emergency (she cannot respond)
  const t2 = setTimeout(async () => {
    const s = sessions[sender];
    if (!s || (s.state !== 'EMERGENCY_CONFIRM' && s.state !== 'EMERGENCY_FOLLOWUP')) return;
    await activateEmergency(sender, s);
  }, 5 * 60 * 1000);

  confirmTimers[sender] = [t1, t2];
};

// ─── SHELTER LOOKUP ───────────────────────────────────────────────────────────

const lookupShelters = (session) => {
  try {
    const key = session.pincode || session.district || '';
    if (!key) return [];
    return findSheltersByPincode(key) || [];
  } catch {
    return [];
  }
};

// ─── BUILD INITIAL EMERGENCY MESSAGE ─────────────────────────────────────────

const buildEmergencyMsg = (session, locationLink) => {
  const lang = session.lang || 'en';

  let msg = t('opening', lang) + '\n\n';

  const shelter = session.emergencyShelter;
  if (shelter) {
    const mapsLink = getMapsLink(shelter);
    msg += `${t('shelterLabel', lang)}\n${shelter.name}\n📍 ${shelter.address}\n📞 ${shelter.phone}\n🗺️ ${mapsLink}\n\n`;
  } else {
    msg += t('shelterFallback', lang) + '\n\n';
  }

  msg += `${t('contactsLabel', lang)}\n`;
  msg += `• ${FALLBACKS.womenHelpline}\n`;
  msg += `• ${FALLBACKS.womenPoliceCell}\n`;
  msg += `• ${FALLBACKS.emergency}\n`;
  if (session.policeAlertPreference) {
    msg += `• 1091\n`;
  }
  msg += '\n';

  if (locationLink) {
    msg += `${t('locationInstruction', lang)}\n${locationLink}\n\n`;
  }

  msg += t('options', lang) + '\n\n';
  msg += t('eraseHint', lang);

  return msg;
};

// ─── EMERGENCY ACTIVATION ─────────────────────────────────────────────────────

const activateEmergency = async (sender, session) => {
  clearConfirmTimers(sender);

  // Step 1 — set mode + timestamp
  session.state = 'EMERGENCY';
  session.emergencyStartTime = Date.now();
  session.locationCaptured = false;
  session.locationCoords = null;
  session.trustedContactAlerted = false;
  session.contactAlertTime = null;
  session.checkInCount = 0;
  session.reAlerted = false;

  // Step 2 — shelter lookup with fallback
  const shelters = lookupShelters(session);
  session.emergencyShelter = shelters[0] || null;
  session.allShelters = shelters;

  // Step 3 — location token
  let locationLink = null;
  try {
    const token = generateToken(sender);
    session.locationToken = token;
    locationLink = `${BASE_URL}/loc/${token}`;
  } catch (e) {
    console.error('[Emergency] Token error:', e.message);
  }

  // Step 4 — send emergency message (target: within 3 seconds)
  const msg = buildEmergencyMsg(session, locationLink);
  await sendMsg(sender, msg);

  // Start check-in timers
  startCheckInTimers(sender);
};

// ─── QUICK REPLY HANDLERS ─────────────────────────────────────────────────────

const handleAlertContact = async (sender, session) => {
  const contact = session.trustedContact;
  if (!contact?.phone) {
    return 'I could not find your trusted contact. Please call 181 directly — they will help you right now. 🌸';
  }

  let locationText = '';
  if (session.locationCoords) {
    const { lat, lng } = session.locationCoords;
    locationText = `📍 Her location: https://maps.google.com/?q=${lat},${lng}`;
  } else if (session.savedArea) {
    locationText = `📍 Her area: ${session.savedArea}`;
  } else {
    locationText = '📍 Location not yet shared — please call her directly.';
  }

  const now = new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
  });

  const contactMsg =
    `⚠️ URGENT: ${contact.name || 'Someone who trusts you'} needs your help RIGHT NOW.\n\n` +
    `${locationText}\n\nTime: ${now} IST\n\n` +
    `Please go to her immediately or call 181 if she does not respond.\n\n` +
    `— Sakhi Safety App`;

  try {
    await sendMsg(`whatsapp:${contact.phone}`, contactMsg);
    session.trustedContactAlerted = true;
    session.contactAlertTime = Date.now();
    return `✅ Message sent to ${contact.name}.\n\nThey know you need help. You are not alone. 🌸\n\nPolice: 112 | Helpline: 181`;
  } catch {
    return `I tried but could not send the alert. Please call ${contact.name} directly or dial 181. You are not alone. 🌸`;
  }
};

const handleMoreShelters = (session) => {
  const shelters = session.allShelters || [];
  if (!shelters.length) {
    return (
      `🏠 Shelters near you:\n\nPlease call Women Helpline 181 for the nearest shelter.\n` +
      `They are free, 24/7, and completely confidential.\n\nHelpline: 181 | Police: 112`
    );
  }
  let msg = '🏠 *All shelters near you:*\n\n';
  shelters.forEach((s, i) => {
    const mapsLink = getMapsLink(s);
    msg += `${i + 1}. *${s.name}*\n   📍 ${s.address}\n   📞 ${s.phone}\n   🗺️ ${mapsLink}\n\n`;
  });
  msg += `All One Stop Centres are FREE and available 24/7.\nHelpline: 181 | Police: 112`;
  return msg;
};

const handleSafeNow = (sender, session) => {
  clearCheckInTimers(sender);
  session.emergencyEndTime = Date.now();
  session.state = 'SUPPORT';
  // Wipe emergency-specific fields
  Object.assign(session, {
    emergencyStartTime: null, locationToken: null, locationCoords: null,
    locationCaptured: false, trustedContactAlerted: false, contactAlertTime: null,
    checkInCount: 0, reAlerted: false,
  });
  if (session.locationToken) invalidateToken(session.locationToken);

  return (
    'I am so relieved you are safe. 🌸\n\n' +
    'I am still here with you whenever you need me.\n\n' +
    'Would you like to switch to private mode? Type *Erase* at any time to turn Sakhi into a cooking app.'
  );
};

// ─── DISGUISE ACTIVATION ──────────────────────────────────────────────────────

const activateDisguise = (sender, session) => {
  clearCheckInTimers(sender);
  clearConfirmTimers(sender);
  if (session.locationToken) invalidateToken(session.locationToken);

  Object.assign(session, {
    state: 'DISGUISE',
    emergencyStartTime: null, locationToken: null, locationCoords: null,
    locationCaptured: false, trustedContactAlerted: false, contactAlertTime: null,
    checkInCount: 0, reAlerted: false,
  });

  return DISGUISE_MSGS[Math.floor(Math.random() * DISGUISE_MSGS.length)];
};

// ─── LOCATION COORDS UPDATE (called from location route) ─────────────────────

const storeLocationInSession = (sender, lat, lng) => {
  const session = sessions[sender];
  if (!session) return;
  session.locationCoords = { lat, lng };
  session.locationCaptured = true;
};

module.exports = {
  isDistress,
  isActiveConversation,
  activateEmergency,
  activateDisguise,
  startConfirmTimers,
  clearConfirmTimers,
  clearCheckInTimers,
  handleAlertContact,
  handleSafetySteps: (session) => t('safetySteps', session?.lang || 'en'),
  handleMoreShelters,
  handleSafeNow,
  storeLocationInSession,
  FALLBACKS,
};
