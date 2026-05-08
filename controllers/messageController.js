const twilio = require('twilio');
const { getAIResponse } = require('../utils/groq');
const { formatShelterResponse } = require('../utils/shelterFinder');

// In-memory session store
const sessions = {};

// Check if message contains a pincode (6 digits)
const extractPincode = (msg) => {
  const match = msg.match(/\b\d{6}\b/);
  return match ? match[0] : null;
};

const handleMessage = async (req, res) => {
  const incomingMsg = req.body.Body?.trim();
  const sender = req.body.From;

  console.log(`Message from ${sender}: ${incomingMsg}`);

  // Initialize session if new user
  if (!sessions[sender]) {
    sessions[sender] = {
      state: 'INIT',
      history: []        // ← conversation memory
    };
  }

  const session = sessions[sender];
  let responseText = '';

  // ── DISGUISE MODE trigger ────────────────────────────────────────────
  if (incomingMsg?.toLowerCase() === 'erase') {
    sessions[sender] = { state: 'DISGUISE', history: [] };
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

  // ── PINCODE detected — find shelters ────────────────────────────────
  else if (extractPincode(incomingMsg)) {
    const pincode = extractPincode(incomingMsg);
    responseText = formatShelterResponse(pincode);
  }

  // ── TRIGGER WORDS — first contact ───────────────────────────────────
  else if (['help', 'madad', 'bachao', 'helpme', 'help me', 'मदद', 'बचाओ', 'मदत'].includes(incomingMsg?.toLowerCase())) {
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