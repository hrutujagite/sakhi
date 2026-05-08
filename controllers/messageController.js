const twilio = require('twilio');
const { getAIResponse, getFIRDraft } = require('../utils/groq');
const { formatShelterResponse } = require('../utils/shelterFinder');

const sessions = {};

const extractPincode = (msg) => {
  const match = msg.match(/\b\d{6}\b/);
  return match ? match[0] : null;
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
    "What happened? Please describe briefly.",
    "When did it happen? (date and time if you remember)",
    "Who did this? (only their relation to you e.g. husband, in-law — no full names needed)",
    "Were there any witnesses?",
    "Were there any injuries or damage? (please reply in one message)"
  ],
  hi: [
    "\u0915\u094d\u092f\u093e \u0939\u0941\u0906? \u0915\u0943\u092a\u092f\u093e \u0938\u0902\u0915\u094d\u0937\u0947\u092a \u092e\u0947\u0902 \u092c\u0924\u093e\u090f\u0902\u0964",
    "\u0915\u092c \u0939\u0941\u0906? (\u0924\u093e\u0930\u0940\u0916 \u0914\u0930 \u0938\u092e\u092f \u0905\u0917\u0930 \u092f\u093e\u0926 \u0939\u094b)",
    "\u0915\u093f\u0938\u0928\u0947 \u0915\u093f\u092f\u093e? (\u0938\u093f\u0930\u094d\u092b \u0930\u093f\u0936\u094d\u0924\u093e \u092c\u0924\u093e\u090f\u0902 \u091c\u0948\u0938\u0947 \u092a\u0924\u093f, \u0938\u093e\u0938 \u2014 \u092a\u0942\u0930\u093e \u0928\u093e\u092e \u091c\u0930\u0942\u0930\u0940 \u0928\u0939\u0940\u0902)",
    "\u0915\u094b\u0908 \u0917\u0935\u093e\u0939 \u0925\u093e?",
    "\u0915\u094b\u0908 \u091a\u094b\u091f \u092f\u093e \u0928\u0941\u0915\u0938\u093e\u0928 \u0939\u0941\u0906? (\u090f\u0915 message \u092e\u0947\u0902 \u092c\u0924\u093e\u090f\u0902)"
  ],
  hl: [
    "Kya hua? Thoda batao.",
    "Kab hua? (date aur time agar yaad ho)",
    "Kisne kiya? (sirf rishta batao jaise pati, saas — poora naam zaroori nahi)",
    "Koi gawah tha?",
    "Koi chot ya nuksan hua? (ek hi message mein batao)"
  ],
  mr: [
    "\u0915\u093e\u092f \u091d\u093e\u0932\u0902? \u0925\u094b\u0921\u0915\u094d\u092f\u093e\u0924 \u0938\u093e\u0902\u0917\u093e.",
    "\u0915\u0947\u0935\u094d\u0939\u093e \u091d\u093e\u0932\u0902? (\u0924\u093e\u0930\u0940\u0916 \u0906\u0923\u093f \u0935\u0947\u0933 \u0906\u0920\u0935\u0924 \u0905\u0938\u0947\u0932 \u0924\u0930)",
    "\u0915\u094b\u0923\u0940 \u0915\u0947\u0932\u0902? (\u092b\u0915\u094d\u0924 \u0928\u093e\u0924\u0947 \u0938\u093e\u0902\u0917\u093e \u091c\u0938\u0947 \u0928\u0935\u0930\u093e, \u0938\u093e\u0938\u0942 \u2014 \u092a\u0942\u0930\u094d\u0923 \u0928\u093e\u0935 \u0928\u0915\u094b)",
    "\u0915\u094b\u0923\u0940 \u0938\u093e\u0915\u094d\u0937\u0940\u0926\u093e\u0930 \u0939\u094b\u0924\u0947 \u0915\u093e?",
    "\u0915\u093e\u0939\u0940 \u0926\u0941\u0916\u093e\u092a\u0924 \u0915\u093f\u0902\u0935\u093e \u0928\u0941\u0915\u0938\u093e\u0928 \u091d\u093e\u0932\u0902 \u0915\u093e? (\u090f\u0915\u093e\u091a message \u092e\u0927\u094d\u092f\u0947 \u0938\u093e\u0902\u0917\u093e)"
  ]
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
  const words = msg.toLowerCase().split(/\s+/);
  const hinglishCount = words.filter(w => hinglishWords.includes(w)).length;
  if (hinglishCount >= 1) return 'hl';
  return 'en';
};

const handleMessage = async (req, res) => {
  const incomingMsg = req.body.Body?.trim();
  const sender = req.body.From;

  console.log(`Message from ${sender}: ${incomingMsg}`);

  if (!sessions[sender]) {
    sessions[sender] = { state: 'INIT', history: [], lang: 'hl', firAnswers: [], firStep: 0 };
  }

  const session = sessions[sender];
  let responseText = '';

  if (incomingMsg && session.state !== 'FIR') {
    session.lang = detectLang(incomingMsg);
  }

  // HELP TRIGGERS — checked FIRST, always works even in disguise mode
  if (HELP_TRIGGERS.includes(incomingMsg?.toLowerCase())) {
    sessions[sender].state = 'TRIAGE';
    sessions[sender].history = [];
    responseText = `Namaste \uD83C\uDF38 Main Sakhi hoon. Main yahan hoon aapke saath.

Kya aap abhi khatre mein hain?

Reply karein:
1\uFE0F\u20E3 HAAN - Mujhe ABHI madad chahiye
2\uFE0F\u20E3 NAHI - Mujhe guidance aur support chahiye`;
  }

  // ERASE — disguise mode
  else if (incomingMsg?.toLowerCase() === 'erase') {
    sessions[sender] = { state: 'DISGUISE', history: [], lang: session.lang, firAnswers: [], firStep: 0 };
    responseText = `\uD83C\uDF73 Welcome to Ruchika's Kitchen!

Today's recipe: Aloo Paratha
- 2 cups wheat flour
- 3 boiled potatoes
- Salt, green chilli, coriander to taste

Type any vegetable name for its recipe! \uD83C\uDF3F`;
  }

  // DISGUISE MODE
  else if (session.state === 'DISGUISE') {
    responseText = await getDisguiseResponse(incomingMsg);
  }

  // PINCODE — not during FIR
  else if (extractPincode(incomingMsg) && session.state !== 'FIR') {
    const pincode = extractPincode(incomingMsg);
    responseText = formatShelterResponse(pincode);
  }

  // TRIAGE
  else if (session.state === 'TRIAGE') {
    if (incomingMsg === '1' || incomingMsg?.toLowerCase().match(/\b(yes|haan|ha)\b/)) {
      sessions[sender].state = 'EMERGENCY';
      responseText = `\uD83D\uDEA8 Aap akeli nahi hain. Madad aa rahi hai.

\uD83D\uDCDE Abhi call karein:
- Police: 112
- Women Helpline: 181

\uD83C\uDFC3 Agar aap safely nikal sakti hain:
- Apna phone, ID, paisa lo
- Padosi, mandir, ya dukaan jaao
- Police ko batao: "Mujhe suraksha chahiye"

Apna PINCODE bhejein — main aapke paas ka shelter dhundhungi.`;
    } else {
      sessions[sender].state = 'SUPPORT';
      responseText = `Main yahan hoon \uD83C\uDF38

Main aapki madad kar sakti hoon:
1\uFE0F\u20E3 Aapke legal rights
2\uFE0F\u20E3 Nazdeeki shelter dhundhna
3\uFE0F\u20E3 FIR ki taiyaari
4\uFE0F\u20E3 Bas baat karna

Aapko kya chahiye?`;
    }
  }

  // FIR TRIGGER — support mode only
  else if (session.state === 'SUPPORT' && (incomingMsg === '3' || isFIRTrigger(incomingMsg))) {
    session.state = 'FIR';
    session.firAnswers = [];
    session.firStep = 0;
    const questions = FIR_QUESTIONS[session.lang] || FIR_QUESTIONS.hl;
    responseText = `Main aapki FIR taiyaar karne mein madad karungi \uD83C\uDF38

Kuch sawaal puchungi — ek ek karke. Aaram se jawab dena.

*Sawaal 1:*
${questions[0]}`;
  }

  // FIR FLOW — collecting answers
  else if (session.state === 'FIR') {
    const questions = FIR_QUESTIONS[session.lang] || FIR_QUESTIONS.hl;
    session.firAnswers.push(incomingMsg);
    session.firStep = session.firAnswers.length;
    if (session.firStep < questions.length) {
      responseText = `*Sawaal ${session.firStep + 1}:*
${questions[session.firStep]}`;
    } else {
      session.state = 'SUPPORT';
      responseText = await getFIRDraft(session.firAnswers, session.lang);
    }
  }

  // SUPPORT or EMERGENCY — AI
  else if (session.state === 'SUPPORT' || session.state === 'EMERGENCY') {
    responseText = await getAIResponse(incomingMsg, session);
  }

  // DEFAULT
  else {
    responseText = await getAIResponse(incomingMsg, session);
  }

  const twiml = new twilio.twiml.MessagingResponse();
  twiml.message(responseText);
  res.type('text/xml');
  res.send(twiml.toString());
};

const getDisguiseResponse = async (msg) => {
  const recipes = {
    'aloo': '\uD83E\uDD54 Aloo Sabzi:\n• 3 aloo\n• 1 pyaaz\n• Jeera, haldi, namak\n• 15 min pakao',
    'paneer': '\uD83E\uDDC0 Paneer Bhurji:\n• 200g paneer\n• 1 pyaaz, 1 tamatar\n• Garam masala, namak\n• 10 min pakao',
    'dal': '\uD83E\uDED8 Dal Tadka:\n• 1 cup yellow dal\n• Ghee, jeera, lahsun\n• 3 seetiyan pressure cooker mein',
    'chawal': '\uD83C\uDF5A Jeera Rice:\n• 1 cup chawal\n• Ghee, jeera\n• 2 cup paani\n• 10 min pakao',
    'sabzi': '\uD83E\uDD66 Mix Veg:\n• Jo bhi sabzi ho ghar mein\n• Pyaaz tamatar base\n• Masale swad anusar',
  };
  const found = Object.keys(recipes).find(key => msg.toLowerCase().includes(key));
  return found
    ? recipes[found]
    : `\uD83C\uDF73 Ruchika's Kitchen mein hai: Aloo, Paneer, Dal, Chawal, Sabzi!\n\nKoi bhi sabzi ka naam likho recipe ke liye \uD83C\uDF3F`;
};

module.exports = { handleMessage };