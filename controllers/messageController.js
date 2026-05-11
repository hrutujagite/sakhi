const twilio = require('twilio');
const { getAIResponse, getFIRDraft } = require('../utils/groq');
const { formatShelterResponse, getBestShelter, findByDistrict, findByState } = require('../utils/shelterFinder');
const { generateToken } = require('../utils/locationToken');
const sessions = require('../utils/sessions');
const {
  isDistress,
  isActiveConversation,
  activateEmergency,
  activateDisguise,
  startConfirmTimers,
  clearConfirmTimers,
  clearCheckInTimers,
  handleAlertContact,
  handleSafetySteps,
  handleMoreShelters,
  handleSafeNow,
  buildEmergencyMsg,
} = require('../utils/emergencyMode');

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const extractPincode = (msg) => {
  const match = msg.match(/\b\d{3}\s?\d{3}\b/);
  return match ? match[0].replace(/\s/g, '') : null;
};

const isFIRTrigger = (msg) => {
  const triggers = ['fir', 'complaint', 'police', 'report', 'case'];
  const hindiTriggers = ['\u0936\u093f\u0915\u093e\u092f\u0924', '\u0924\u0915\u094d\u0930\u093e\u0930', '\u0926\u0930\u094d\u091c'];
  return triggers.some(t => msg?.toLowerCase().includes(t)) ||
         hindiTriggers.some(t => msg?.includes(t));
};

const HELP_TRIGGERS = ['help', 'madad', 'bachao', 'helpme', 'help me', 'danger',
  '\u092e\u0926\u0926', '\u092c\u091a\u093e\u0913', '\u092e\u0926\u0924'];

const FIR_QUESTIONS = {
  en: [
    'What happened? Please describe briefly.',
    'When did it happen? (date and time if you remember)',
    'Who did this? (only their relation to you e.g. husband, in-law — no full names needed)',
    'Were there any witnesses?',
    'Were there any injuries or damage? (please reply in one message)',
  ],
  hi: [
    '\u0915\u094d\u092f\u093e \u0939\u0941\u0906? \u0915\u0943\u092a\u092f\u093e \u0938\u0902\u0915\u094d\u0937\u0947\u092a \u092e\u0947\u0902 \u092c\u0924\u093e\u090f\u0902\u0964',
    '\u0915\u092c \u0939\u0941\u0906? (\u0924\u093e\u0930\u0940\u0916 \u0914\u0930 \u0938\u092e\u092f \u0905\u0917\u0930 \u092f\u093e\u0926 \u0939\u094b)',
    '\u0915\u093f\u0938\u0928\u0947 \u0915\u093f\u092f\u093e? (\u0938\u093f\u0930\u094d\u092b \u0930\u093f\u0936\u094d\u0924\u093e \u092c\u0924\u093e\u090f\u0902 \u091c\u0948\u0938\u0947 \u092a\u0924\u093f, \u0938\u093e\u0938 \u2014 \u092a\u0942\u0930\u093e \u0928\u093e\u092e \u091c\u0930\u0942\u0930\u0940 \u0928\u0939\u0940\u0902)',
    '\u0915\u094b\u0908 \u0917\u0935\u093e\u0939 \u0925\u093e?',
    '\u0915\u094b\u0908 \u091a\u094b\u091f \u092f\u093e \u0928\u0941\u0915\u0938\u093e\u0928 \u0939\u0941\u0906? (\u090f\u0915 message \u092e\u0947\u0902 \u092c\u0924\u093e\u090f\u0902)',
  ],
  hl: [
    'Kya hua? Thoda batao.',
    'Kab hua? (date aur time agar yaad ho)',
    'Kisne kiya? (sirf rishta batao jaise pati, saas — poora naam zaroori nahi)',
    'Koi gawah tha?',
    'Koi chot ya nuksan hua? (ek hi message mein batao)',
  ],
  mr: [
    '\u0915\u093e\u092f \u091d\u093e\u0932\u0902? \u0925\u094b\u0921\u0915\u094d\u092f\u093e\u0924 \u0938\u093e\u0902\u0917\u093e.',
    '\u0915\u0947\u0935\u094d\u0939\u093e \u091d\u093e\u0932\u0902? (\u0924\u093e\u0930\u0940\u0916 \u0906\u0923\u093f \u0935\u0947\u0933 \u0906\u0920\u0935\u0924 \u0905\u0938\u0947\u0932 \u0924\u0930)',
    '\u0915\u094b\u0923\u0940 \u0915\u0947\u0932\u0902? (\u092b\u0915\u094d\u0924 \u0928\u093e\u0924\u0947 \u0938\u093e\u0902\u0917\u093e \u091c\u0938\u0947 \u0928\u0935\u0930\u093e, \u0938\u093e\u0938\u0942 \u2014 \u092a\u0942\u0930\u094d\u0923 \u0928\u093e\u0935 \u0928\u0915\u094b)',
    '\u0915\u094b\u0923\u0940 \u0938\u093e\u0915\u094d\u0937\u0940\u0926\u093e\u0930 \u0939\u094b\u0924\u0947 \u0915\u093e?',
    '\u0915\u093e\u0939\u0940 \u0926\u0941\u0916\u093e\u092a\u0924 \u0915\u093f\u0902\u0935\u093e \u0928\u0941\u0915\u0938\u093e\u0928 \u091d\u093e\u0932\u0902 \u0915\u093e? (\u090f\u0915\u093e\u091a message \u092e\u0927\u094d\u092f\u0947 \u0938\u093e\u0902\u0917\u093e)',
  ],
};

const detectLang = (msg) => {
  if (!msg) return 'hl';
  const devanagari = /[\u0900-\u097F]/;
  if (devanagari.test(msg)) {
    const marathiWords = ['\u0906\u0939\u0947', '\u0928\u093e\u0939\u0940', '\u0915\u093e\u092f', '\u0915\u0947\u0935\u094d\u0939\u093e', '\u0915\u0941\u0920\u0947', '\u092e\u0932\u093e', '\u0924\u0941\u092e\u094d\u0939\u0940', '\u0906\u092a\u0923', '\u091d\u093e\u0932\u0902', '\u0938\u093e\u0902\u0917\u093e'];
    if (marathiWords.some(w => msg.includes(w))) return 'mr';
    return 'hi';
  }
  const hinglishWords = ['mujhe', 'mere', 'mera', 'meri', 'kya', 'karo', 'chahiye', 'hoon', 'hai', 'tha', 'thi', 'nahi', 'aur', 'bhi', 'pati', 'ghar', 'madad', 'bachao', 'haan', 'bata', 'kab', 'kaise', 'kyun', 'abhi', 'yahan'];
  const hinglishCount = msg.toLowerCase().split(/\s+/).filter(w => hinglishWords.includes(w)).length;
  if (hinglishCount >= 1) return 'hl';
  return 'en';
};

// Append the "I need help now" footer to every support-mode message
const withHelpFooter = (text) =>
  `${text}\n\n_⚡ Reply *HELP* at any time if you need emergency assistance._`;

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────

const handleMessage = async (req, res) => {
  const incomingMsg = req.body.Body?.trim();
  const sender = req.body.From;

  console.log(`[${new Date().toISOString()}] From ${sender}: ${incomingMsg}`);

  // Hidden developer command to wipe the session and start from scratch
  if (incomingMsg && incomingMsg.trim().toUpperCase() === 'RESET SESSION') {
    delete sessions[sender];
    return sendTwiML(res, '⚙️ Developer: Session wiped. Send "hi" to restart onboarding.');
  }

  if (!sessions[sender]) {
    sessions[sender] = {
      state: 'ONBOARDING_CONTACT_PHONE', history: [], lang: 'hl',
      firAnswers: [], firStep: 0,
      messageCount: 0, lastActiveTime: null,
      disguiseKeyword: null,
      trustedContacts: [],
      trustedContactNames: null,
      pincode: null,
      district: null,
      savedArea: null,
      policeAlertPreference: false,
    };
    return sendTwiML(res, `Namaste! 🌸 I am Sakhi. Before we start, I need to know a few things to keep you safe.\n\nPlease reply with the phone number(s) of people you trust. Start with +91 (e.g. +919876543210). You can send multiple numbers separated by commas.`);
  }

  const session = sessions[sender];
  let responseText = '';

  // Track message count and last active time for distress context check
  session.messageCount = (session.messageCount || 0) + 1;
  session.lastActiveTime = Date.now();

  // ── ONBOARDING FLOW ──────────────────────────────────────────────────────────
  if (session.state.startsWith('ONBOARDING_')) {
    if (session.state === 'ONBOARDING_CONTACT_PHONE') {
      session.trustedContacts = incomingMsg.split(',').map(p => p.replace(/[^0-9+]/g, '')).filter(p => p);
      session.state = 'ONBOARDING_CONTACT_NAME';
      return sendTwiML(res, `What are their names?`);
    }
    if (session.state === 'ONBOARDING_CONTACT_NAME') {
      session.trustedContactNames = incomingMsg;
      session.state = 'ONBOARDING_DISGUISE_KEY';
      return sendTwiML(res, `Got it. Now, choose a secret word. If you type this word anytime, I will immediately hide our chat and act like a cooking bot.`);
    }
    if (session.state === 'ONBOARDING_DISGUISE_KEY') {
      session.disguiseKeyword = incomingMsg.trim();
      session.state = 'ONBOARDING_PINCODE';
      return sendTwiML(res, `Secret word saved. Lastly, what is your 6-digit Pincode? This helps me find nearby safe spaces if you ever need them.`);
    }
    if (session.state === 'ONBOARDING_PINCODE') {
      const pin = extractPincode(incomingMsg);
      if (pin) {
        session.pincode = pin;
      } else {
        session.savedArea = incomingMsg; // Fallback if no valid pin found
      }
      session.state = 'SUPPORT';
      return sendTwiML(res, `Thank you! Setup is complete. 🌸\n\nHow can I help you today?\n1️⃣ Know my legal rights\n2️⃣ Find a nearby shelter\n3️⃣ Prepare an FIR\n4️⃣ Just talk`);
    }
  }

  // Detect language for non-FIR states
  if (incomingMsg && session.state !== 'FIR') {
    session.lang = detectLang(incomingMsg);
  }

  const lower = incomingMsg?.toLowerCase().trim() || '';

  // ── PRIORITY 1: DISGUISE KEYWORD (silent emergency) ─────────────────────────
  const disguiseKw = session.disguiseKeyword;
  if (disguiseKw && incomingMsg?.toUpperCase() === disguiseKw.toUpperCase()) {
    // Activate emergency silently in background
    activateEmergency(sender, session).catch(err =>
      console.error('[Emergency] Silent activation error:', err.message)
    );
    // Send innocent reply to screen
    responseText = activateDisguise(sender, session);
    return sendTwiML(res, responseText);
  }

  // ── PRIORITY 2: ERASE — disguise mode ────────────────────────────────────────
  if (lower === 'erase') {
    responseText = activateDisguise(sender, session);
    return sendTwiML(res, responseText);
  }

  // ── PRIORITY 3: DISGUISE MODE ─────────────────────────────────────────────────
  if (session.state === 'DISGUISE') {
    if (lower === 'help') {
      session.state = 'SUPPORT';
      responseText = withHelpFooter(
        `Main yahan hoon 🌸\n\nMain aapki madad kar sakti hoon:\n1️⃣ Aapke legal rights\n2️⃣ Nazdeeki shelter dhundhna\n3️⃣ FIR ki taiyaari\n4️⃣ Bas baat karna\n\nAapko kya chahiye?`
      );
    } else {
      responseText = getDisguiseResponse(incomingMsg);
    }
    return sendTwiML(res, responseText);
  }

  // ── PRIORITY 4: EMERGENCY MODE QUICK REPLIES ─────────────────────────────────
  if (session.state === 'EMERGENCY') {
    if (lower === '1' || lower.includes('alert') || lower.includes('contact')) {
      responseText = await handleAlertContact(sender, session);
    } else if (lower === '2' || lower.includes('safety') || lower.includes('step')) {
      responseText = handleSafetySteps(session);
    } else if (lower === '3' || lower.includes('more shelter')) {
      responseText = handleMoreShelters(session);
    } else if (lower === '4' || lower === 'ok' || lower.includes('safe now') || lower.includes('i am safe')) {
      responseText = handleSafeNow(sender, session);
    } else {
      // Any other message in emergency — re-show options in user's language
      const BASE_URL = (process.env.BASE_URL || 'https://sakhi.onrender.com').replace(/\/$/, '');
      const locationLink = session.locationToken ? `${BASE_URL}/loc/${session.locationToken}` : null;
      responseText = buildEmergencyMsg(session, locationLink);
    }
    return sendTwiML(res, responseText);
  }

  // ── PRIORITY 5: EMERGENCY CONFIRMATION STEP ──────────────────────────────────
  if (session.state === 'EMERGENCY_CONFIRM' || session.state === 'EMERGENCY_FOLLOWUP') {
    const yesMatch = lower === '1' || /\b(yes|haan|ha|help me|haan help)\b/.test(lower);
    const noMatch = lower === '2' || /\b(no|nahi|okay|ok|just talking)\b/.test(lower);

    if (yesMatch) {
      clearConfirmTimers(sender);
      responseText = await activateEmergency(sender, session);
      return sendTwiML(res, responseText);
    } else if (noMatch) {
      clearConfirmTimers(sender);
      session.state = 'SUPPORT';
      responseText = withHelpFooter(
        `Main yahan hoon. 🌸\n\nAapko kya chahiye?\n1️⃣ Aapke legal rights\n2️⃣ Nazdeeki shelter\n3️⃣ FIR ki taiyaari\n4️⃣ Bas baat karna`
      );
      return sendTwiML(res, responseText);
    } else {
      responseText = `Please reply:\n1️⃣ Yes — I need help now\n2️⃣ No — I am okay`;
      return sendTwiML(res, responseText);
    }
  }

  // ── PRIORITY 6: HELP TRIGGERS ─────────────────────────────────────────────────
  if (HELP_TRIGGERS.includes(lower)) {
    session.state = 'TRIAGE';
    session.history = [];
    responseText = withHelpFooter(
      `Namaste 🌸 Main Sakhi hoon. Main yahan hoon aapke saath.\n\nKya aap abhi khatre mein hain?\n\nReply karein:\n1️⃣ HAAN - Mujhe ABHI madad chahiye\n2️⃣ NAHI - Mujhe guidance aur support chahiye`
    );
    return sendTwiML(res, responseText);
  }

  // ── PRIORITY 7: DISTRESS KEYWORD DETECTION ────────────────────────────────────
  if (isDistress(incomingMsg, session.lang) && session.state !== 'FIR') {
    if (isActiveConversation(session)) {
      // Has active conversation — ask one clarifying question
      session.state = 'EMERGENCY_CONFIRM';
      startConfirmTimers(sender);
      responseText =
        `Are you in immediate danger right now? 🌸\n\n` +
        `1️⃣ Yes — help me\n2️⃣ No — just talking`;
    } else {
      // First message or inactive — skip clarification, go straight to confirm
      session.state = 'EMERGENCY_CONFIRM';
      startConfirmTimers(sender);
      responseText =
        `I am right here with you. Do you need emergency help right now? 🌸\n\n` +
        `1️⃣ Yes — help me now\n2️⃣ No — I am okay`;
    }
    return sendTwiML(res, responseText);
  }

  // ── PRIORITY 8: PINCODE (not during FIR) ─────────────────────────────────────
  if (extractPincode(incomingMsg) && session.state !== 'FIR') {
    const pincode = extractPincode(incomingMsg);
    session.pincode = pincode; // save for emergency use
    responseText = withHelpFooter(formatShelterResponse(pincode));
    return sendTwiML(res, responseText);
  }

  // ── TRIAGE ────────────────────────────────────────────────────────────────────
  if (session.state === 'TRIAGE') {
    const yesMatch = incomingMsg === '1' || /\b(yes|haan|ha)\b/.test(lower);
    if (yesMatch) {
      session.state = 'EMERGENCY_CONFIRM';
      startConfirmTimers(sender);
      responseText =
        `I am right here with you. Do you need emergency help right now? 🌸\n\n` +
        `1️⃣ Yes — help me now\n2️⃣ No — I am okay`;
    } else {
      session.state = 'SUPPORT';
      responseText = withHelpFooter(
        `Main yahan hoon 🌸\n\nMain aapki madad kar sakti hoon:\n1️⃣ Aapke legal rights\n2️⃣ Nazdeeki shelter dhundhna\n3️⃣ FIR ki taiyaari\n4️⃣ Bas baat karna\n\nAapko kya chahiye?`
      );
    }
    return sendTwiML(res, responseText);
  }

  // ── MENU OPTION 2: FIND SHELTER ────────────────────────────────────────────────
  if (session.state === 'SUPPORT' && (incomingMsg === '2' || lower.includes('shelter'))) {
    session.state = 'SUPPORT_SHELTER_MENU';
    responseText = withHelpFooter(
      `📍 For the most accurate nearby support centres, you can securely share your live location.\n\nReply:\n1️⃣ Share Live Location\n2️⃣ Enter District/Area Manually`
    );
    return sendTwiML(res, responseText);
  }

  // ── SHELTER MENU HANDLING ─────────────────────────────────────────────────────
  if (session.state === 'SUPPORT_SHELTER_MENU') {
    if (incomingMsg === '1') {
      session.state = 'SUPPORT_SHELTER_LOC';
      const token = generateToken(sender, 'support');
      const BASE_URL = (process.env.BASE_URL || 'https://sakhi.onrender.com').replace(/\/$/, '');
      responseText = withHelpFooter(
        `To improve nearby support recommendations, tap below:\n\n${BASE_URL}/loc/${token}`
      );
      return sendTwiML(res, responseText);
    } else if (incomingMsg === '2') {
      session.state = 'SUPPORT_SHELTER_DISTRICT';
      responseText = withHelpFooter(`Please enter your district, city, or area name. (e.g. Pune, Mumbai Suburban)`);
      return sendTwiML(res, responseText);
    } else {
      responseText = withHelpFooter(`Please reply with 1 or 2.`);
      return sendTwiML(res, responseText);
    }
  }

  // ── SHELTER DISTRICT HANDLING ─────────────────────────────────────────────────
  if (session.state === 'SUPPORT_SHELTER_DISTRICT') {
    session.district = incomingMsg;
    // Assume state is Maharashtra for now since all current data is MH
    session.geoState = 'Maharashtra'; 
    const shelter = getBestShelter(session);
    
    // Reset state
    session.state = 'SUPPORT';
    
    let msg = '';
    if (shelter && !shelter.isFallback) {
      msg = `Nearest Support Centre:\n\n📍 *${shelter.name}*\n📞 ${shelter.phone}\n\n📍 ${shelter.address}, ${shelter.district}, ${shelter.state} - ${shelter.pincode}\n`;
    } else {
      msg = `We couldn't find a support centre for ${incomingMsg}.\n\nPlease call Women Helpline: 181`;
    }
    
    responseText = withHelpFooter(msg);
    return sendTwiML(res, responseText);
  }

  // ── MENU OPTIONS 1 & 4 TRANSLATION ───────────────────────────────────────────
  let promptForAI = incomingMsg;
  if (session.state === 'SUPPORT') {
      if (incomingMsg === '1') promptForAI = "What are my legal rights regarding domestic violence?";
      if (incomingMsg === '4') promptForAI = "I just want to talk. Please comfort me.";
  }

  // ── FIR TRIGGER ────────────────────────────────────────────────────────────────
  if (session.state === 'SUPPORT' && (incomingMsg === '3' || isFIRTrigger(incomingMsg))) {
    session.state = 'FIR';
    session.firAnswers = [];
    session.firStep = 0;
    const questions = FIR_QUESTIONS[session.lang] || FIR_QUESTIONS.hl;
    responseText =
      `Main aapki FIR taiyaar karne mein madad karungi 🌸\n\nKuch sawaal puchungi — ek ek karke. Aaram se jawab dena.\n\n*Sawaal 1:*\n${questions[0]}`;
    return sendTwiML(res, responseText);
  }

  // ── FIR FLOW ───────────────────────────────────────────────────────────────────
  if (session.state === 'FIR') {
    const questions = FIR_QUESTIONS[session.lang] || FIR_QUESTIONS.hl;
    session.firAnswers.push(incomingMsg);
    session.firStep = session.firAnswers.length;
    if (session.firStep < questions.length) {
      responseText = `*Sawaal ${session.firStep + 1}:*\n${questions[session.firStep]}`;
    } else {
      session.state = 'SUPPORT';
      responseText = await getFIRDraft(session.firAnswers, session.lang);
    }
    return sendTwiML(res, responseText);
  }

  // ── SUPPORT / EMERGENCY / DEFAULT — AI response ────────────────────────────────
  const aiReply = await getAIResponse(promptForAI, session);
  responseText = withHelpFooter(aiReply);
  return sendTwiML(res, responseText);
};

// ─── SEND TWIML HELPER ────────────────────────────────────────────────────────

const sendTwiML = (res, text) => {
  const twiml = new twilio.twiml.MessagingResponse();
  if (text) twiml.message(text);
  res.type('text/xml');
  res.send(twiml.toString());
};

// ─── DISGUISE RESPONSE (cooking bot) ─────────────────────────────────────────

const getDisguiseResponse = (msg) => {
  const recipes = {
    aloo: '🥔 Aloo Sabzi:\n• 3 aloo\n• 1 pyaaz\n• Jeera, haldi, namak\n• 15 min pakao',
    paneer: '🧀 Paneer Bhurji:\n• 200g paneer\n• 1 pyaaz, 1 tamatar\n• Garam masala, namak\n• 10 min pakao',
    dal: '🫘 Dal Tadka:\n• 1 cup yellow dal\n• Ghee, jeera, lahsun\n• 3 seetiyan pressure cooker mein',
    chawal: '🍚 Jeera Rice:\n• 1 cup chawal\n• Ghee, jeera\n• 2 cup paani\n• 10 min pakao',
    sabzi: '🥦 Mix Veg:\n• Jo bhi sabzi ho ghar mein\n• Pyaaz tamatar base\n• Masale swad anusar',
  };
  const found = Object.keys(recipes).find(key => msg?.toLowerCase().includes(key));
  return found
    ? recipes[found]
    : `🍳 Ruchika\'s Kitchen mein hai: Aloo, Paneer, Dal, Chawal, Sabzi!\n\nKoi bhi sabzi ka naam likho recipe ke liye 🌿`;
};

module.exports = { handleMessage };