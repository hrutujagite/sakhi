const twilio = require('twilio');
const { getAIResponse, getFIRDraft } = require('../utils/groq');
const { formatShelterResponse, getBestShelter } = require('../utils/shelterFinder');
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
    responseText = await activateDisguise(sender, session);
    return sendTwiML(res, responseText);
  }

  // ── PRIORITY 2: ERASE — disguise mode ────────────────────────────────────────
  if (lower === 'erase') {
    responseText = await activateDisguise(sender, session);
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

  // ── SUPPORT MENU OPTIONS ────────────────────────────────────────────────────
  if (session.state === 'SUPPORT') {
    // Option 1: Legal Rights — detailed sub-menu
    if (incomingMsg === '1') {
      session.state = 'LEGAL_RIGHTS';
      const langResponses = {
        hi: `📜 *आपके कानूनी अधिकार (PWDVA):*\n\n` +
          `1️⃣ *घर में रहने का अधिकार* — कोई आपको घर से नहीं निकाल सकता\n` +
          `2️⃣ *सुरक्षा आदेश* — कोर्ट से protection order\n` +
          `3️⃣ *खर्चा पाने का अधिकार* — Maintenance\n` +
          `4️⃣ *बच्चों की कस्टडी* — कोर्ट से custody\n` +
          `5️⃣ *मुआवज़ा* — चोट के लिए compensation\n` +
          `6️⃣ *मुफ्त कानूनी मदद* — DLSA, Protection Officer\n\n` +
          `किसी भी नंबर पर reply करें, मैं विस्तार से बताऊंगी। 🌸`,
        mr: `📜 *तुमचे कायदेशीर अधिकार (PWDVA):*\n\n` +
          `1️⃣ *घरात राहण्याचा अधिकार*\n` +
          `2️⃣ *संरक्षण आदेश* — कोर्टाकडून protection order\n` +
          `3️⃣ *खर्चाचा अधिकार* — Maintenance\n` +
          `4️⃣ *मुलांची कस्टडी*\n` +
          `5️⃣ *नुकसानभरपाई*\n` +
          `6️⃣ *मोफत कायदेशीर मदत* — DLSA\n\n` +
          `कोणत्याही नंबरवर reply करा. 🌸`,
        en: `📜 *Your Legal Rights (PWDVA):*\n\n` +
          `1️⃣ *Right to live in shared home* — No one can throw you out\n` +
          `2️⃣ *Protection Order* — Court can stop the abuser\n` +
          `3️⃣ *Right to Maintenance* — Financial support\n` +
          `4️⃣ *Child Custody* — Court can grant custody\n` +
          `5️⃣ *Compensation* — For injuries & damages\n` +
          `6️⃣ *Free Legal Help* — DLSA, Protection Officer\n\n` +
          `Reply with any number for details. 🌸`,
      };
      responseText = withHelpFooter(
        langResponses[session.lang] ||
        `📜 *Aapke Legal Rights (PWDVA):*\n\n` +
        `1️⃣ *Ghar mein rehne ka haq* — Koi nikaal nahi sakta\n` +
        `2️⃣ *Suraksha ka haq* — Court se protection order\n` +
        `3️⃣ *Kharcha pane ka haq* — Maintenance\n` +
        `4️⃣ *Bachon ki custody* — Court se maang sakte hain\n` +
        `5️⃣ *Muavza* — Chot ke liye compensation\n` +
        `6️⃣ *Free legal madad* — DLSA, Protection Officer\n\n` +
        `Kisi bhi number par reply karein, detail mein bataungi. 🌸`
      );
      return sendTwiML(res, responseText);
    }

    // ── MENU OPTION 2: FIND SHELTER ────────────────────────────────────────────────
    if (incomingMsg === '2' || lower.includes('shelter')) {
      session.state = 'SUPPORT_SHELTER_MENU';
      responseText = withHelpFooter(
        `📍 For the most accurate nearby support centres, you can securely share your live location.\n\nReply:\n1️⃣ Share Live Location\n2️⃣ Enter District/Area Manually`
      );
      return sendTwiML(res, responseText);
    }

    // Option 3: Prepare FIR
    if (incomingMsg === '3' || isFIRTrigger(incomingMsg)) {
      session.state = 'FIR';
      session.firAnswers = [];
      session.firStep = 0;
      const questions = FIR_QUESTIONS[session.lang] || FIR_QUESTIONS.hl;
      const langIntro = {
        hi: `मैं आपकी FIR तैयार करने में मदद करूँगी 🌸\n\n⚖️ *याद रखें:*\n• Police FIR लेने से मना नहीं कर सकती (Section 154)\n• Zero FIR किसी भी थाने में हो सकती है\n• अगर Police ना सुने → SP office, Women's Cell, या Magistrate से शिकायत करें\n\nकुछ सवाल पूछूँगी — एक एक करके। आराम से जवाब देना।`,
        mr: `मी तुमची FIR तयार करण्यात मदत करेन 🌸\n\n⚖️ *लक्षात ठेवा:*\n• Police FIR नाकारू शकत नाही (Section 154)\n• Zero FIR कोणत्याही ठाण्यात होऊ शकते\n• Police ऐकत नसेल → SP office, Women's Cell कडे जा\n\nकाही प्रश्न विचारेन — एक एक करून. शांतपणे उत्तर द्या.`,
        en: `I'll help you prepare your FIR 🌸\n\n⚖️ *Remember:*\n• Police CANNOT refuse to file FIR (Section 154)\n• Zero FIR can be filed at ANY police station\n• If police refuse → complain to SP, Women's Cell, or Magistrate\n\nI'll ask a few questions — one by one. Take your time.`,
      };
      responseText = (langIntro[session.lang] ||
        `Main aapki FIR taiyaar karne mein madad karungi 🌸\n\n⚖️ *Yaad rakhein:*\n• Police FIR lene se mana nahi kar sakti (Section 154)\n• Zero FIR kisi bhi thane mein ho sakti hai\n• Agar police na sune → SP office, Women's Cell, ya Magistrate se shikayat karein\n\nKuch sawaal puchungi — ek ek karke. Aaram se jawab dena.`) +
        `\n\n*Sawaal 1:*\n${questions[0]}`;
      return sendTwiML(res, responseText);
    }

    // Option 4: Just Talk
    if (incomingMsg === '4') {
      const langResponses = {
        hi: `मैं यहाँ हूँ, तुम्हारी बात सुनने के लिए 🌸\n\n` +
          `जो भी मन में हो — डर, गुस्सा, उदासी — सब कह सकती हो। कोई judge नहीं करेगा।\n\n` +
          `पहले बताओ — *क्या तुम अभी सुरक्षित हो?*\n` +
          `फिर जो भी कहना है, कहो। मैं सुन रही हूँ। 💛`,
        mr: `मी इथे आहे, तुमचं ऐकायला 🌸\n\n` +
          `मनात जे काही आहे — भीती, राग, दुःख — सगळं सांगू शकता. कोणी judge नाही करणार.\n\n` +
          `आधी सांगा — *तुम्ही आत्ता सुरक्षित आहात का?*\n` +
          `मग जे सांगायचं ते सांगा. मी ऐकतेय. 💛`,
        en: `I'm here to listen 🌸\n\n` +
          `Whatever you're feeling — fear, anger, sadness — you can say it all. No judgment here.\n\n` +
          `First tell me — *are you safe right now?*\n` +
          `Then share whatever is on your mind. I'm listening. 💛`,
      };
      responseText = withHelpFooter(
        langResponses[session.lang] ||
        `Main yahan hoon, aapki baat sunne ke liye 🌸\n\n` +
        `Jo bhi mann mein ho — dar, gussa, udaasi — sab keh sakti hain. Koi judge nahi karega.\n\n` +
        `Pehle bataiye — *kya aap abhi safe hain?*\n` +
        `Phir jo bhi kehna hai, kahein. Main sun rahi hoon. 💛`
      );
      return sendTwiML(res, responseText);
    }
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

  // ── LEGAL RIGHTS SUB-MENU ──────────────────────────────────────────────────
  if (session.state === 'LEGAL_RIGHTS') {
    const subOption = incomingMsg?.trim();
    const rightDetails = {
      '1': {
        hl: `🏠 *Ghar mein rehne ka haq (Section 17 PWDVA):*\n\n• Shaadi ke baad ka ghar aapka bhi hai — chahe naam kisi ka bhi ho\n• Koi aapko lock out ya nikaal nahi sakta\n• *Kya karein:* Magistrate Court mein Residence Order ke liye apply karein\n• Protection Officer FREE mein help karenge — apne district mein poochein\n• *Documents:* Shaadi ka proof, ghar ka address\n\n📞 DLSA se free vakeel milega: apne district ka DLSA search karein`,
        hi: `🏠 *घर में रहने का अधिकार (Section 17 PWDVA):*\n\n• शादी के बाद का घर आपका भी है — चाहे नाम किसी का भी हो\n• कोई आपको lock out या निकाल नहीं सकता\n• *क्या करें:* Magistrate Court में Residence Order के लिए apply करें\n• Protection Officer मुफ्त में मदद करेंगे\n• *Documents:* शादी का प्रमाणपत्र, घर का पता\n\n📞 DLSA से मुफ्त वकील मिलेगा`,
        mr: `🏠 *घरात राहण्याचा अधिकार (Section 17 PWDVA):*\n\n• लग्नानंतरचे घर तुमचेही आहे — नाव कोणाचेही असो\n• कोणी तुम्हाला बाहेर काढू शकत नाही\n• *काय करा:* Magistrate Court मध्ये Residence Order साठी अर्ज करा\n• Protection Officer मोफत मदत करतात\n\n📞 DLSA कडून मोफत वकील मिळेल`,
        en: `🏠 *Right to Shared Household (Section 17 PWDVA):*\n\n• The matrimonial home is yours too — regardless of whose name it's in\n• Nobody can lock you out or evict you\n• *What to do:* Apply for Residence Order in Magistrate Court\n• Protection Officer will help for FREE\n• *Documents needed:* Marriage proof, address\n\n📞 Free lawyer from DLSA (District Legal Services Authority)`,
      },
      '2': {
        hl: `🛡️ *Protection Order (Section 18 PWDVA):*\n\n• Court abuser ko order deta hai: koi hinsa nahi, koi sampark nahi\n• Urgent cases mein kuch hi dinon mein mil sakta hai\n• Order todne par abuser ko jail ho sakti hai\n• *Kya karein:* Magistrate Court mein application dein\n• Protection Officer ya DLSA vakeel se FREE madad lein\n\n*Zaroori documents:* Medical reports, photos (agar hain), incident ka description`,
        hi: `🛡️ *सुरक्षा आदेश (Section 18 PWDVA):*\n\n• कोर्ट आदेश देती है: कोई हिंसा नहीं, कोई संपर्क नहीं\n• ज़रूरी मामलों में कुछ दिनों में मिल सकता है\n• आदेश तोड़ने पर जेल हो सकती है\n• *क्या करें:* Magistrate Court में application दें\n• Protection Officer या DLSA से मुफ्त मदद लें`,
        mr: `🛡️ *संरक्षण आदेश (Section 18 PWDVA):*\n\n• कोर्ट आदेश देते: हिंसा नाही, संपर्क नाही\n• तातडीच्या प्रकरणांत काही दिवसांत मिळू शकतो\n• आदेश मोडल्यास जेल होऊ शकते\n• *काय करा:* Magistrate Court मध्ये अर्ज द्या`,
        en: `🛡️ *Protection Order (Section 18 PWDVA):*\n\n• Court orders: no violence, no contact, no entry to your workplace\n• Can be obtained in days for urgent cases\n• Violation = jail for the abuser\n• *What to do:* File application in Magistrate Court\n• Protection Officer or DLSA lawyer will help for FREE`,
      },
      '3': {
        hl: `💰 *Maintenance ka haq (Section 20 PWDVA):*\n\n• Aapko pati se kharcha milne ka haq hai — chahe saath na reh rahi hon\n• *Kahan apply karein:* Family Court ya Magistrate Court\n• Interim maintenance kuch hafton mein mil sakta hai\n• *Documents:* Shaadi ka proof, pati ki income proof, apne kharchon ki details\n• *Free vakeel:* DLSA se sampark karein — har district mein hai\n\n💡 Agar pati income chupaye → court uski jaanch kar sakti hai`,
        hi: `💰 *भरण-पोषण का अधिकार (Section 20 PWDVA):*\n\n• आपको पति से खर्चा मिलने का हक है\n• *कहाँ apply करें:* Family Court या Magistrate Court\n• Interim maintenance कुछ हफ्तों में मिल सकता है\n• *Documents:* शादी प्रमाणपत्र, पति की income, खर्चों की details\n• *मुफ्त वकील:* DLSA से संपर्क करें`,
        mr: `💰 *खर्चाचा अधिकार (Section 20 PWDVA):*\n\n• तुम्हाला पतीकडून खर्च मिळण्याचा अधिकार आहे\n• *कुठे अर्ज करा:* Family Court किंवा Magistrate Court\n• *Documents:* लग्न प्रमाणपत्र, पतीचे उत्पन्न\n• *मोफत वकील:* DLSA शी संपर्क साधा`,
        en: `💰 *Right to Maintenance (Section 20 PWDVA):*\n\n• You have the right to financial support from your husband\n• *Where to apply:* Family Court or Magistrate Court\n• Interim maintenance can come within weeks\n• *Documents:* Marriage proof, husband's income proof, expense details\n• *Free lawyer:* Contact your district's DLSA`,
      },
      '4': {
        hl: `👶 *Bachon ki Custody:*\n\n• Family Court mein Guardianship Act ke tahat apply karein\n• Court bachon ki safety aur welfare ko sabse pehle dekhti hai\n• 5 saal se chhote bachon ki custody aam taur par maa ko milti hai\n• *Agar bachche khatre mein hain:* Emergency custody ke liye turant apply karein\n• *Documents:* Bachon ke birth certificates, school records, violence ka evidence\n\n💡 DLSA se FREE vakeel lein`,
        hi: `👶 *बच्चों की कस्टडी:*\n\n• Family Court में Guardianship Act के तहत apply करें\n• Court बच्चों की safety और welfare को प्राथमिकता देती है\n• 5 साल से छोटे बच्चों की custody आम तौर पर माँ को मिलती है\n• *खतरे में हों तो:* Emergency custody के लिए तुरंत apply करें\n\n💡 DLSA से मुफ्त वकील लें`,
        mr: `👶 *मुलांची कस्टडी:*\n\n• Family Court मध्ये Guardianship Act अंतर्गत अर्ज करा\n• Court मुलांच्या सुरक्षिततेला प्राधान्य देते\n• 5 वर्षांखालील मुलांची कस्टडी सामान्यतः आईला मिळते\n\n💡 DLSA कडून मोफत वकील मिळेल`,
        en: `👶 *Child Custody:*\n\n• Apply in Family Court under Guardianship Act\n• Court prioritizes children's safety and welfare\n• Children under 5 usually stay with the mother\n• *If children are in danger:* Apply for emergency custody immediately\n• *Documents:* Birth certificates, school records, evidence of violence\n\n💡 Get a FREE lawyer from DLSA`,
      },
      '5': {
        hl: `⚖️ *Muavza / Compensation (Section 22 PWDVA):*\n\n• Chot, mental trauma, ya nuksan ke liye compensation maang sakte hain\n• Magistrate Court mein PWDVA case ke saath hi apply karein\n• Medical reports aur photos rakhein\n\n💡 Protection Officer application file karne mein madad karenge — FREE`,
        hi: `⚖️ *मुआवज़ा (Section 22 PWDVA):*\n\n• चोट, मानसिक trauma, या नुकसान के लिए compensation माँग सकती हैं\n• Magistrate Court में PWDVA case के साथ apply करें\n• Medical reports और photos रखें\n\n💡 Protection Officer मुफ्त में मदद करेंगे`,
        mr: `⚖️ *नुकसानभरपाई (Section 22 PWDVA):*\n\n• दुखापत, मानसिक त्रास, किंवा नुकसानीसाठी compensation मागू शकता\n• Magistrate Court मध्ये PWDVA case सोबत अर्ज करा\n\n💡 Protection Officer मोफत मदत करतात`,
        en: `⚖️ *Compensation (Section 22 PWDVA):*\n\n• You can claim compensation for injuries, mental trauma, or damages\n• Apply along with your PWDVA case in Magistrate Court\n• Keep medical reports and photos as evidence\n\n💡 Protection Officer will help you file — FREE`,
      },
      '6': {
        hl: `🆓 *Free Legal Madad:*\n\n• *DLSA* (District Legal Services Authority) — har district mein hai, free vakeel milta hai\n• *Protection Officer* — PWDVA ke tahat niyukt, free seva\n• *One Stop Centre* — 24/7 open, medical + legal + police sab ek jagah\n• *NCW Helpline:* 1800-111-224 (toll-free)\n• *Women Helpline:* 181\n• *NCW Online Complaint:* ncw.nic.in\n\n💡 Aapko koi bhi document ki zaroorat nahi — seedha jaakar madad maangein`,
        hi: `🆓 *मुफ्त कानूनी मदद:*\n\n• *DLSA* — हर जिले में है, मुफ्त वकील\n• *Protection Officer* — PWDVA के तहत, मुफ्त सेवा\n• *One Stop Centre* — 24/7, medical + legal + police एक जगह\n• *NCW:* 1800-111-224\n• *Women Helpline:* 181\n• *Online शिकायत:* ncw.nic.in`,
        mr: `🆓 *मोफत कायदेशीर मदत:*\n\n• *DLSA* — प्रत्येक जिल्ह्यात, मोफत वकील\n• *Protection Officer* — PWDVA अंतर्गत, मोफत सेवा\n• *One Stop Centre* — 24/7, medical + legal + police एकत्र\n• *NCW:* 1800-111-224\n• *Women Helpline:* 181`,
        en: `🆓 *Free Legal Help:*\n\n• *DLSA* (District Legal Services Authority) — free lawyer in every district\n• *Protection Officer* — appointed under PWDVA, free service\n• *One Stop Centre* — 24/7, medical + legal + police all in one place\n• *NCW Helpline:* 1800-111-224 (toll-free)\n• *Women Helpline:* 181\n• *NCW Online Complaint:* ncw.nic.in\n\n💡 You don't need any documents — just go and ask for help`,
      },
    };

    if (rightDetails[subOption]) {
      // Stay in LEGAL_RIGHTS so user can explore more options
      const detail = rightDetails[subOption];
      const backHint = {
        hi: `\n\n─────────\n📜 *कोई और अधिकार जानना है?* 1-6 में से नंबर भेजें\n↩️ Main menu ke liye *0* bhejein`,
        mr: `\n\n─────────\n📜 *आणखी अधिकार जाणून घ्यायचे?* 1-6 मधून नंबर पाठवा\n↩️ Main menu साठी *0* पाठवा`,
        en: `\n\n─────────\n📜 *Want to know another right?* Reply 1-6\n↩️ Send *0* to go back to main menu`,
      };
      const hint = backHint[session.lang] || `\n\n─────────\n📜 *Aur jaanna hai?* 1-6 mein se number bhejein\n↩️ Main menu ke liye *0* bhejein`;
      responseText = (detail[session.lang] || detail.hl) + hint;
      return sendTwiML(res, responseText);
    }
    // "0" = go back to support menu
    if (subOption === '0') {
      session.state = 'SUPPORT';
      responseText = withHelpFooter(
        `Main yahan hoon 🌸\n\n1️⃣ Aapke legal rights\n2️⃣ Nazdeeki shelter dhundhna\n3️⃣ FIR ki taiyaari\n4️⃣ Bas baat karna\n\nAapko kya chahiye?`
      );
      return sendTwiML(res, responseText);
    }
    // If not a valid sub-option, fall back to AI in legal context
    session.state = 'SUPPORT';
    // fall through to AI response below
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
  const aiReply = await getAIResponse(incomingMsg, session);
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