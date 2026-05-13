'use strict';

const twilio = require('twilio');
const { findNearestShelters, formatNearestSheltersResponse } = require('./shelterFinder');
const { generateToken, getTokenData, invalidateToken } = require('./locationToken');
const sessions = require('./sessions');

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const FALLBACKS = {
  womenHelpline: '181',
  womenPoliceCell: '1091',
  emergency: '112',
};

const BASE_URL = (process.env.BASE_URL || 'https://sakhi.onrender.com').replace(/\/$/, '');

// ─── DISTRESS KEYWORDS ────────────────────────────────────────────────────────

const DISTRESS_KEYWORDS = {
  en: ['help', 'danger', 'i am in danger', 'i need help', 'save me', 'please help', 'emergency', 'he is hitting me', 'hurting me'],
  hi: ['bachao', 'mujhe bachao', 'madad karo', 'mujhe madad chahiye', 'dar lag raha hai', 'khatara', 'maar raha hai', 'maro mat'],
  hl: ['bachao', 'mujhe bachao', 'madad karo', 'mujhe madad chahiye', 'dar lag raha hai', 'khatara', 'help karo', 'please help', 'maar raha hai', 'maro mat', 'maarta hai', 'marti hai', 'peet raha hai', 'dara raha hai', 'dhakka diya', 'chot lagi', 'khoon', 'rone de nahi'],
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
    en: '📍 *To share your location:* Tap the 📎 or + icon below, tap "Location", and send your current location.',
    hl: '📍 *Location share karne ke liye:* Niche 📎 ya + icon dabayein, "Location" chunein aur bhej dein.',
    hi: '📍 *लोकेशन भेजने के लिए:* नीचे 📎 या + आइकन दबाएं, "Location" चुनें और भेजें।',
    mr: '📍 *लोकेशन पाठवण्यासाठी:* खाली 📎 किंवा + आयकॉन दाबा, "Location" निवडा आणि पाठवा.',
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
  contactAlert: {
    en: (loc, time) => `⚠️ URGENT: Someone who trusts you needs your help RIGHT NOW.\n\n${loc}\n\nTime: ${time} IST\n\nPlease go to her immediately or call 181 if she does not respond.\n\n— Sakhi Safety App`,
    hl: (loc, time) => `⚠️ URGENT: Kisi ne aapko madad ke liye bulaya hai.\n\n${loc}\n\nSamay: ${time} IST\n\nKripya turant uske paas jayein ya agar wo jawab na de toh 181 par call karein.\n\n— Sakhi Safety App`,
    hi: (loc, time) => `⚠️ आवश्यक: किसी ने आपको मदद के लिए बुलाया है।\n\n${loc}\n\nसमय: ${time} IST\n\nकृपया तुरंत उनके पास जाएं या अगर वो जवाब न दें तो 181 पर कॉल करें।\n\n— Sakhi Safety App`,
    mr: (loc, time) => `⚠️ अत्यंत महत्त्वाची सूचना: एका व्यक्तीने तुम्हाला मदतीसाठी बोलावले आहे.\n\n${loc}\n\nवेळ: ${time} IST\n\nकृपया त्वरित तिच्याकडे जा किंवा तिने उत्तर न दिल्यास 181 वर कॉल करा.\n\n— Sakhi Safety App`,
  },
  locShared: {
    en: (link) => `📍 Her location: ${link}`,
    hl: (link) => `📍 Uski location: ${link}`,
    hi: (link) => `📍 उनकी लोकेशन: ${link}`,
    mr: (link) => `📍 तिची लोकेशन: ${link}`
  },
  locArea: {
    en: (area) => `📍 Her area: ${area}`,
    hl: (area) => `📍 Uska area: ${area}`,
    hi: (area) => `📍 उनका क्षेत्र: ${area}`,
    mr: (area) => `📍 तिचा भाग: ${area}`
  },
  locNone: {
    en: '📍 Location not yet shared — please call her directly.',
    hl: '📍 Location abhi share nahi hui — kripya use direct call karein.',
    hi: '📍 लोकेशन अभी साझा नहीं की गई है — कृपया उन्हें सीधे कॉल करें।',
    mr: '📍 लोकेशन अद्याप शेअर केलेली नाही — कृपया तिला थेट कॉल करा.'
  },
  alertSuccess: {
    en: '✅ Alert sent to your contacts.\n\nThey know you need help. You are not alone. 🌸\n\nPolice: 112 | Helpline: 181',
    hl: '✅ Aapke contacts ko alert bhej diya gaya hai.\n\nWo jante hain ki aapko madad chahiye. Aap akeli nahi hain. 🌸\n\nPolice: 112 | Helpline: 181',
    hi: '✅ आपके संपर्कों को अलर्ट भेज दिया गया है।\n\nवे जानते हैं कि आपको मदद चाहिए। आप अकेली नहीं हैं। 🌸\n\nपुलिस: 112 | हेल्पलाइन: 181',
    mr: '✅ तुमच्या संपर्कांना अलर्ट पाठवला आहे.\n\nत्यांना माहित आहे की तुम्हाला मदतीची गरज आहे. तुम्ही एकटे नाहीत. 🌸\n\nपोलीस: 112 | हेल्पलाइन: 181'
  },
  alertFail: {
    en: 'I tried but could not send the alerts. Please call them directly or dial 181. You are not alone. 🌸',
    hl: 'Main alert nahi bhej payi. Kripya unhe direct call karein ya 181 dabayein. Aap akeli nahi hain. 🌸',
    hi: 'मैं अलर्ट नहीं भेज पाई। कृपया उन्हें सीधे कॉल करें या 181 डायल करें। आप अकेली नहीं हैं। 🌸',
    mr: 'मी अलर्ट पाठवू शकले नाही. कृपया त्यांना थेट कॉल करा किंवा 181 डायल करा. तुम्ही एकटे नाहीत. 🌸'
  }
};

// Helper — pick the right language, fallback to English
const t = (key, lang) => TEMPLATES[key][lang] || TEMPLATES[key].en;

// ─── GOOGLE MAPS LINK ─────────────────────────────────────────────────────────
const getMapsLink = (shelter) => {
  if (shelter.lat && shelter.lng) {
    return `https://www.google.com/maps?q=${shelter.lat},${shelter.lng}`;
  }
  const dest = encodeURIComponent(`${shelter.name}, ${shelter.address}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
};

const DISGUISE_MSGS = [
  '🌿 Here is a healthy recipe idea for today: Moong Dal Khichdi.\n\nIngredients:\n- 1/2 cup rice\n- 1/2 cup yellow moong dal\n- 1 tsp ghee\n- A pinch of turmeric\n- Salt to taste\n\nInstructions:\n1. Wash dal and rice.\n2. Heat ghee in cooker, add cumin seeds.\n3. Add dal, rice, turmeric, and water.\n4. Cook for 3 whistles.\n\nEnjoy this light, nutritious meal ready in 20 minutes!',
  '🍵 Wellness tip: Start your morning with warm turmeric milk.\n\nIt supports immunity and keeps you calm.\n\nSteps:\n1. Boil 1 glass of milk.\n2. Add 1/2 tsp turmeric powder.\n3. Add a pinch of black pepper.\n4. Sweeten with jaggery.\n\nDrink it warm before bed for a good night\'s sleep.',
  '🥗 Today\'s healthy meal: Sprout salad with lemon and a pinch of chaat masala!\n\nIngredients:\n- 1 cup mixed sprouts\n- 1 chopped onion\n- 1 chopped tomato\n- 1 green chilli\n- Coriander leaves\n- Lemon juice\n\nMix everything well and serve fresh. It is packed with protein!',
];

// ─── TWILIO OUTBOUND ──────────────────────────────────────────────────────────

const sendMsg = async (to, body) => {
  try {
    if (process.env.NODE_ENV !== "development") {
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      await client.messages.create({
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
        to,
        body,
      });
    } else {
      console.log(`[DevMode: Simulated Send to ${to}]:\n${body}`);
    }
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
    const contacts = s.trustedContacts || [];
    if (contacts.length > 0 && !s.reAlerted) {
      s.reAlerted = true;
      for (const contact of contacts) {
        await sendMsg(
          `whatsapp:${contact}`,
          `⚠️ URGENT: A woman you know has not confirmed she is safe.\n\n` +
          `Please try reaching her immediately.\n` +
          `If she does not respond, please call 112.\n\n` +
          `— Sakhi Safety App`
        ).catch(err => console.error(err.message));
      }
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
// (Removed lookupShelters since we use getBestShelter directly)

// ─── BUILD INITIAL EMERGENCY MESSAGE ─────────────────────────────────────────
// TASK 3: Shows top 3 GPS-nearest shelters. TASK 2: GPS-only, no fallbacks.

const buildEmergencyMsg = (session, locationLink) => {
  const lang = session.lang || 'en';

  let msg = t('opening', lang) + '\n\n';

  // Show top 3 shelters if GPS coords are available
  const coords = session.locationCoords;
  if (coords && coords.lat != null && coords.lng != null) {
    const nearest = findNearestShelters(coords.lat, coords.lng, 3);
    msg += formatNearestSheltersResponse(nearest) + '\n\n';
  } else if (session.allShelters && session.allShelters.length > 0) {
    // Pre-computed shelters from activation time
    msg += formatNearestSheltersResponse(session.allShelters) + '\n\n';
  } else {
    // No GPS available — prompt user to share location
    msg += t('shelterFallback', lang) + '\n\n';
  }

  msg += `${t('contactsLabel', lang)}\n`;
  msg += `• ${FALLBACKS.womenHelpline}\n`;
  msg += `• ${FALLBACKS.womenPoliceCell}\n`;
  msg += `• ${FALLBACKS.emergency}\n\n`;

  msg += `${t('locationInstruction', lang)}\n\n`;

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

  // Step 2 — GPS-only shelter lookup (TASK 2: no pincode/district/state fallback)
  // allShelters stores top 3 nearest; emergencyShelter stores the closest one.
  // If no GPS coords yet, allShelters stays empty — user is prompted to share location.
  const coords = session.locationCoords;
  if (coords && coords.lat != null && coords.lng != null) {
    const nearest = findNearestShelters(coords.lat, coords.lng, 3);
    session.allShelters = nearest;
    session.emergencyShelter = nearest.length > 0 ? nearest[0] : null;
  } else {
    session.emergencyShelter = null;
    session.allShelters = [];
  }

  // Step 3 — location token
  let locationLink = null;
  try {
    const token = generateToken(sender);
    session.locationToken = token;
    locationLink = `${BASE_URL}/loc/${token}`;
  } catch (e) {
    console.error('[Emergency] Token error:', e.message);
  }

  // Step 4 — return emergency message to be sent instantly
  const msg = buildEmergencyMsg(session, locationLink);
  
  // Start check-in timers
  startCheckInTimers(sender);
  return msg;
};

// ─── QUICK REPLY HANDLERS ─────────────────────────────────────────────────────

const handleAlertContact = async (sender, session) => {
  const lang = session.lang || 'en';
  const contacts = session.trustedContacts || [];
  if (contacts.length === 0) {
    return 'I could not find your trusted contacts. Please call 181 directly — they will help you right now. 🌸';
  }

  let locationText = '';
  if (session.locationCoords) {
    const { lat, lng } = session.locationCoords;
    const mapsLink = `https://maps.google.com/?q=${lat},${lng}`;
    locationText = TEMPLATES.locShared[lang] ? TEMPLATES.locShared[lang](mapsLink) : TEMPLATES.locShared.en(mapsLink);
  } else if (session.savedArea) {
    locationText = TEMPLATES.locArea[lang] ? TEMPLATES.locArea[lang](session.savedArea) : TEMPLATES.locArea.en(session.savedArea);
  } else {
    locationText = TEMPLATES.locNone[lang] || TEMPLATES.locNone.en;
  }

  const now = new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
  });

  let successCount = 0;
  for (const contact of contacts) {
    const contactMsg = TEMPLATES.contactAlert[lang] ? TEMPLATES.contactAlert[lang](locationText, now) : TEMPLATES.contactAlert.en(locationText, now);

    try {
      await sendMsg(`whatsapp:${contact}`, contactMsg);
      successCount++;
    } catch (err) {
      console.error(`[Alert] Failed to send to ${contact}:`, err.message);
    }
  }

  if (successCount > 0) {
    session.trustedContactAlerted = true;
    session.contactAlertTime = Date.now();
    return TEMPLATES.alertSuccess[lang] || TEMPLATES.alertSuccess.en;
  } else {
    return TEMPLATES.alertFail[lang] || TEMPLATES.alertFail.en;
  }
};

// TASK 3: Uses shared multi-shelter formatter (GPS-only, top 3, sorted by distance)
const handleMoreShelters = (session) => {
  if (!session.locationCoords || session.locationCoords.lat == null) {
    return `📍 *Location needed.*\n\nPlease share your *Live Location* first to see nearby support centres. You can tap the 📎 or + icon below, tap "Location", and send your current location.`;
  }
  const shelterList = session.allShelters || [];
  return formatNearestSheltersResponse(shelterList);
};

const handleSafeNow = (sender, session) => {
  clearCheckInTimers(sender);
  session.emergencyEndTime = Date.now();
  session.state = 'TRIAGE';
  // Wipe emergency-specific fields
  Object.assign(session, {
    emergencyStartTime: null, locationToken: null, locationCoords: null,
    locationCaptured: false, trustedContactAlerted: false, contactAlertTime: null,
    checkInCount: 0, reAlerted: false,
  });
  if (session.locationToken) invalidateToken(session.locationToken);

  return (
    'I am so relieved you are safe. 🌸\n\n' +
    'Do you need any more help right now?\n\n' +
    '1️⃣ Yes — help me now\n' +
    '2️⃣ No — I am okay'
  );
};

// ─── SILENT SOS / STEALTH MODE ACTIVATION (TASK 7) ───────────────────────────
// SUPPRESSED WORDS — must NEVER appear in any visible WhatsApp message while
// session.state === 'DISGUISE':
//   emergency, shelter, alert, danger, unsafe, SOS, help
// All emergency logic runs silently in the backend only.

const activateDisguise = async (sender, session) => {
  console.log(`[STEALTH SOS ACTIVATED] Sender: ${sender} | Time: ${new Date().toISOString()}`);
  clearCheckInTimers(sender);
  clearConfirmTimers(sender);
  const prevToken = session.locationToken;
  if (prevToken) invalidateToken(prevToken);

  // Set DISGUISE state BEFORE sending messages
  Object.assign(session, {
    state: 'DISGUISE',
    emergencyStartTime: null,
    locationToken: null,
    locationCoords: null,
    locationCaptured: false,
    trustedContactAlerted: false,
    contactAlertTime: null,
    checkInCount: 0,
    reAlerted: false,
  });

  // Flood chat with innocent cooking messages in background (don't await)
  sendMsg(sender, DISGUISE_MSGS[1]).catch(err => console.error('[Disguise] bg msg 1 fail:', err.message));
  sendMsg(sender, DISGUISE_MSGS[2]).catch(err => console.error('[Disguise] bg msg 2 fail:', err.message));

  // Return first message for immediate TwiML response
  return DISGUISE_MSGS[0];
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
  buildEmergencyMsg,
  DISGUISE_MSGS,
  generateToken,
};
