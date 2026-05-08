const twilio = require('twilio');
const { getAIResponse, getFIRDraft } = require('../utils/groq');
const { formatShelterResponse } = require('../utils/shelterFinder');

// In-memory session store
const sessions = {};

// Check if message contains a pincode (6 digits)
const extractPincode = (msg) => {
  const match = msg.match(/\b\d{6}\b/);
  return match ? match[0] : null;
};

// Check if message is FIR trigger
const isFIRTrigger = (msg) => {
  const triggers = ['fir', 'complaint', 'police', 'शिकायत', 'तक्रार', 'report', 'दर्ज', 'case'];
  return triggers.some(t => msg?.toLowerCase().includes(t));
};

// FIR questions in 4 languages
const FIR_QUESTIONS = {
  en: [
    "What happened? Please describe briefly.",
    "When did it happen? (date and time if you remember)",
    "Who did this? (only their relation to you, e.g. husband, in-law — no full names needed)",
    "Were there any witnesses?",
    "Were there any injuries or damage? (one message please)"
  ],
  hi: [
    "क्या हुआ? कृपया संक्षेप में बताएं।",
    "कब हुआ? (तारीख और समय अगर याद हो)",
    "किसने किया? (सिर्फ रिश्ता बताएं जैसे पति, सास — पूरा नाम जरूरी नहीं)",
    "कोई गवाह था?",
    "कोई चोट या नुकसान हुआ? (एक message में बताएं)"
  ],
  hl: [
    "Kya hua? Thoda batao.",
    "Kab hua? (date aur time agar yaad ho)",
    "Kisne kiya? (sirf rishta batao jaise pati, saas — poora naam zaroori nahi)",
    "Koi gawah tha?",
    "Koi chot ya nuksan hua? (ek hi message mein batao)"
  ],
  mr: [
    "काय झालं? थोडक्यात सांगा.",
    "केव्हा झालं? (तारीख आणि वेळ आठवत असेल तर)",
    "कोणी केलं? (फक्त नाते सांगा जसे नवरा, सासू — पूर्ण नाव नको)",
    "कोणी साक्षीदार होते का?",
    "काही दुखापत किंवा नुकसान झालं का? (एकाच message मध्ये सांगा)"
  ]
};

// Detect language from message
const detectLang = (msg) => {
  if (!msg) return 'hl';
  const devanagari = /[\u0900-\u097F]/;
  // If Devanagari script detected
  if (devanagari.test(msg)) {
    const marathiWords = ['आहे', 'नाही', 'काय', 'केव्हा', 'कुठे', 'मला', 'तुम्ही', 'आपण', 'झालं', 'सांगा'];
    if (marathiWords.some(w => msg.includes(w))) return 'mr';
    return 'hi';
  }
  // Hinglish detection — common Hindi words in Roman script
  const hinglishWords = ['mujhe', 'mere', 'mera', 'meri', 'kya', 'karo', 'chahiye', 'hoon', 'hai', 'tha', 'thi', 'nahi', 'aur', 'bhi', 'yahan', 'wahan', 'pati', 'ghar', 'madad', 'bachao', 'acha', 'theek', 'haan', 'nahi', 'bata', 'kab', 'kaise', 'kyun'];
  const words = msg.toLowerCase().split(/\s+/);
  const hinglishCount = words.filter(w => hinglishWords.includes(w)).length;
  if (hinglishCount >= 1) return 'hl';
  return 'en';
};

const handleMessage = async (req, res) => {
  const incomingMsg = req.body.Body?.trim();
  const sender = req.body.From;

  console.log(`Message from ${sender}: ${incomingMsg}`);

  // Initialize session if new user
  if (!sessions[sender]) {
    sessions[sender] = {
      state: 'INIT',
      history: [],
      lang: 'hi',
      firAnswers: [],
      firStep: 0
    };
  }

  const session = sessions[sender];
  let responseText = '';

  // Detect and store language
  if (incomingMsg && session.state !== 'FIR') {
    session.lang = detectLang(incomingMsg);
  }

  // ── DISGUISE MODE trigger ────────────────────────────────────────────
  if (incomingMsg?.toLowerCase() === 'erase') {
    sessions[sender] = { state: 'DISGUISE', history: [], lang: session.lang, firAnswers: [], firStep: 0 };
    responseText = `🍳 Welcome to Ruchika's Kitchen!

Today's recipe: Aloo Paratha
- 2 cups wheat flour
- 3 boiled potatoes
- Salt, green chilli, coriander to taste

Type any vegetable name for its recipe! 🌿`;
  }

  // ── DISGUISE MODE — stay as cooking bot ─────────────────────────────
  else if (session.state === 'DISGUISE') {
    responseText = await getDisguiseResponse(incomingMsg);
  }

  // ── PINCODE detected — find shelters (not during FIR flow) ──────────
  else if (extractPincode(incomingMsg) && session.state !== 'FIR') {
    const pincode = extractPincode(incomingMsg);
    responseText = formatShelterResponse(pincode);
  }

  // ── TRIGGER WORDS — first contact or re-trigger ─────────────────────
  else if (['help', 'madad', 'bachao', 'helpme', 'help me', 'मदद', 'बचाओ', 'मदत', 'danger'].includes(incomingMsg?.toLowerCase())) {
    sessions[sender].state = 'TRIAGE';
    responseText = `Namaste 🌸 Main Sakhi hoon. Main yahan hoon aapke saath.

Kya aap abhi khatre mein hain?

Reply karein:
1️⃣ HAAN - Mujhe ABHI madad chahiye
2️⃣ NAHI - Mujhe guidance aur support chahiye`;
  }

  // ── TRIAGE response ──────────────────────────────────────────────────
  else if (session.state === 'TRIAGE') {
    if (incomingMsg === '1' || incomingMsg?.toLowerCase().match(/\b(yes|haan|ha|हाँ|हां|हो)\b/)) {
      sessions[sender].state = 'EMERGENCY';
      responseText = `🚨 Aap akeli nahi hain. Madad aa rahi hai.

📞 Abhi call karein:
- Police: 112
- Women Helpline: 181

🏃 Agar aap safely nikal sakti hain:
- Apna phone, ID, paisa lo
- Padosi, mandir, ya dukaan jaao
- Police ko batao: "Mujhe suraksha chahiye"

Apna PINCODE bhejein — main aapke paas ka shelter dhundhungi.`;
    } else {
      sessions[sender].state = 'SUPPORT';
      responseText = `Main yahan hoon 🌸

Main aapki madad kar sakti hoon:
1️⃣ Aapke legal rights
2️⃣ Nazdeeki shelter dhundhna
3️⃣ FIR ki taiyaari
4️⃣ Bas baat karna

Aapko kya chahiye?`;
    }
  }

  // ── FIR TRIGGER — only in SUPPORT mode ──────────────────────────────
  else if (session.state === 'SUPPORT' && (incomingMsg === '3' || isFIRTrigger(incomingMsg))) {
    session.state = 'FIR';
    session.firAnswers = [];
    session.firStep = 0;

    const questions = FIR_QUESTIONS[session.lang] || FIR_QUESTIONS.hi;
    responseText = `Main aapki FIR taiyaar karne mein madad karungi 🌸

Kuch sawaal puchungi — ek ek karke. Aaram se jawab dena.

*Sawaal 1:*
${questions[0]}`;
  }

  // ── FIR FLOW — collecting answers one by one ─────────────────────────
  else if (session.state === 'FIR') {
    const questions = FIR_QUESTIONS[session.lang] || FIR_QUESTIONS.hi;

    // Save current answer
    session.firAnswers.push(incomingMsg);
    session.firStep = session.firAnswers.length;

    if (session.firStep < questions.length) {
      // Ask next question
      responseText = `*Sawaal ${session.firStep + 1}:*
${questions[session.firStep]}`;
    } else {
      // All 5 answers collected — generate FIR draft
      session.state = 'SUPPORT';
      responseText = await getFIRDraft(session.firAnswers, session.lang);
    }
  }

  // ── SUPPORT or EMERGENCY — AI with memory ───────────────────────────
  else if (session.state === 'SUPPORT' || session.state === 'EMERGENCY') {
    responseText = await getAIResponse(incomingMsg, session);
  }

  // ── DEFAULT — AI handles anything else ──────────────────────────────
  else {
    responseText = await getAIResponse(incomingMsg, session);
  }

  // Send response via Twilio
  const twiml = new twilio.twiml.MessagingResponse();
  twiml.message(responseText);

  res.type('text/xml');
  res.send(twiml.toString());
};

const getDisguiseResponse = async (msg) => {
  const recipes = {
    'aloo': '🥔 Aloo Sabzi:\n• 3 aloo\n• 1 pyaaz\n• Jeera, haldi, namak\n• 15 min pakao',
    'paneer': '🧀 Paneer Bhurji:\n• 200g paneer\n• 1 pyaaz, 1 tamatar\n• Garam masala, namak\n• 10 min pakao',
    'dal': '🫘 Dal Tadka:\n• 1 cup yellow dal\n• Ghee, jeera, lahsun\n• 3 seetiyan pressure cooker mein',
    'chawal': '🍚 Jeera Rice:\n• 1 cup chawal\n• Ghee, jeera\n• 2 cup paani\n• 10 min pakao',
    'sabzi': '🥦 Mix Veg:\n• Jo bhi sabzi ho ghar mein\n• Pyaaz tamatar base\n• Masale swad anusar',
  };

  const found = Object.keys(recipes).find(key => msg.toLowerCase().includes(key));
  return found
    ? recipes[found]
    : `🍳 Ruchika's Kitchen mein hai: Aloo, Paneer, Dal, Chawal, Sabzi!\n\nKoi bhi sabzi ka naam likho recipe ke liye 🌿`;
};

module.exports = { handleMessage };