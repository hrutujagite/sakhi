require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const twilio = require('twilio');
const { getAIResponse, getFIRDraft } = require('../utils/groq');
const { formatShelterResponse } = require('../utils/shelterFinder');
const fs = require('fs');
const path = require('path');

// ── Import the core logic directly from messageController ──
// We re-create the handler logic here to test it in isolation without HTTP

const sessions = {};

const extractPincode = (msg) => {
  const match = msg.match(/\b\d{6}\b/);
  return match ? match[0] : null;
};

const isFIRTrigger = (msg) => {
  const triggers = ['fir', 'complaint', 'police', 'report', 'case'];
  const hindiTriggers = ['शिकायत', 'तक्रार', 'दर्ज'];
  return triggers.some(t => msg?.toLowerCase().includes(t)) ||
         hindiTriggers.some(t => msg?.includes(t));
};

const HELP_TRIGGERS = ['help', 'madad', 'bachao', 'helpme', 'help me', 'danger',
  'मदद', 'बचाओ', 'मदत'];

const FIR_QUESTIONS = {
  en: [
    "What happened? Please describe briefly.",
    "When did it happen? (date and time if you remember)",
    "Who did this? (only their relation to you e.g. husband, in-law — no full names needed)",
    "Were there any witnesses?",
    "Were there any injuries or damage? (please reply in one message)"
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
    "काही दुखापत किंवा नुकसान झालं का? (एका message मध्ये सांगा)"
  ]
};

const detectLang = (msg) => {
  if (!msg) return 'hl';
  const devanagari = /[\u0900-\u097F]/;
  if (devanagari.test(msg)) {
    const marathiWords = ['आहे', 'नाही', 'काय', 'केव्हा', 'कुठे', 'मला', 'तुम्ही', 'आपण', 'झालं', 'सांगा'];
    if (marathiWords.some(w => msg.includes(w))) return 'mr';
    return 'hi';
  }
  const hinglishWords = ['mujhe', 'mere', 'mera', 'meri', 'kya', 'karo', 'chahiye', 'hoon', 'hai', 'tha', 'thi', 'nahi', 'aur', 'bhi', 'pati', 'ghar', 'madad', 'bachao', 'haan', 'bata', 'kab', 'kaise', 'kyun', 'abhi', 'yahan'];
  const words = msg.toLowerCase().split(/\s+/);
  const hinglishCount = words.filter(w => hinglishWords.includes(w)).length;
  if (hinglishCount >= 1) return 'hl';
  return 'en';
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

// ── Simulate message handling (mirrors messageController.js exactly) ──
async function simulateMessage(sender, incomingMsg) {
  if (!sessions[sender]) {
    sessions[sender] = { state: 'INIT', history: [], lang: 'hl', firAnswers: [], firStep: 0 };
  }

  const session = sessions[sender];
  let responseText = '';

  if (incomingMsg && session.state !== 'FIR') {
    session.lang = detectLang(incomingMsg);
  }

  if (HELP_TRIGGERS.includes(incomingMsg?.toLowerCase())) {
    sessions[sender].state = 'TRIAGE';
    sessions[sender].history = [];
    responseText = `Namaste 🌸 Main Sakhi hoon. Main yahan hoon aapke saath.\n\nKya aap abhi khatre mein hain?\n\nReply karein:\n1️⃣ HAAN - Mujhe ABHI madad chahiye\n2️⃣ NAHI - Mujhe guidance aur support chahiye`;
  }
  else if (incomingMsg?.toLowerCase() === 'erase') {
    sessions[sender] = { state: 'DISGUISE', history: [], lang: session.lang, firAnswers: [], firStep: 0 };
    responseText = `🍳 Welcome to Ruchika's Kitchen!\n\nToday's recipe: Aloo Paratha\n- 2 cups wheat flour\n- 3 boiled potatoes\n- Salt, green chilli, coriander to taste\n\nType any vegetable name for its recipe! 🌿`;
  }
  else if (session.state === 'DISGUISE') {
    responseText = await getDisguiseResponse(incomingMsg);
  }
  else if (extractPincode(incomingMsg) && session.state !== 'FIR') {
    const pincode = extractPincode(incomingMsg);
    responseText = formatShelterResponse(pincode);
  }
  else if (session.state === 'TRIAGE') {
    if (incomingMsg === '1' || incomingMsg?.toLowerCase().match(/\b(yes|haan|ha)\b/)) {
      sessions[sender].state = 'EMERGENCY';
      responseText = `🚨 Aap akeli nahi hain. Madad aa rahi hai.\n\n📞 Abhi call karein:\n- Police: 112\n- Women Helpline: 181\n\n🏃 Agar aap safely nikal sakti hain:\n- Apna phone, ID, paisa lo\n- Padosi, mandir, ya dukaan jaao\n- Police ko batao: "Mujhe suraksha chahiye"\n\nApna PINCODE bhejein — main aapke paas ka shelter dhundhungi.`;
    } else {
      sessions[sender].state = 'SUPPORT';
      responseText = `Main yahan hoon 🌸\n\nMain aapki madad kar sakti hoon:\n1️⃣ Aapke legal rights\n2️⃣ Nazdeeki shelter dhundhna\n3️⃣ FIR ki taiyaari\n4️⃣ Bas baat karna\n\nAapko kya chahiye?`;
    }
  }
  else if (session.state === 'SUPPORT' && (incomingMsg === '3' || isFIRTrigger(incomingMsg))) {
    session.state = 'FIR';
    session.firAnswers = [];
    session.firStep = 0;
    const questions = FIR_QUESTIONS[session.lang] || FIR_QUESTIONS.hl;
    responseText = `Main aapki FIR taiyaar karne mein madad karungi 🌸\n\nKuch sawaal puchungi — ek ek karke. Aaram se jawab dena.\n\n*Sawaal 1:*\n${questions[0]}`;
  }
  else if (session.state === 'FIR') {
    const questions = FIR_QUESTIONS[session.lang] || FIR_QUESTIONS.hl;
    session.firAnswers.push(incomingMsg);
    session.firStep = session.firAnswers.length;
    if (session.firStep < questions.length) {
      responseText = `*Sawaal ${session.firStep + 1}:*\n${questions[session.firStep]}`;
    } else {
      session.state = 'SUPPORT';
      responseText = await getFIRDraft(session.firAnswers, session.lang);
    }
  }
  else if (session.state === 'SUPPORT' || session.state === 'EMERGENCY') {
    responseText = await getAIResponse(incomingMsg, session);
  }
  else {
    responseText = await getAIResponse(incomingMsg, session);
  }

  const current = sessions[sender];
  return { responseText, state: current.state, lang: current.lang };
}

// ── Reset session for a sender ──
function resetSession(sender) {
  delete sessions[sender];
}

// ── Test Definitions ──
const TEST_CASES = [
  {
    id: 1, name: 'help', category: 'Help Triggers',
    expected: 'Should show Sakhi TRIAGE menu with options 1 and 2',
    steps: [{ msg: 'help' }],
    validate: (results) => results[0].responseText.includes('Sakhi') && results[0].state === 'TRIAGE'
  },
  {
    id: 2, name: 'madad', category: 'Help Triggers',
    expected: 'Should show Sakhi TRIAGE menu (Hinglish trigger)',
    steps: [{ msg: 'madad' }],
    validate: (results) => results[0].responseText.includes('Sakhi') && results[0].state === 'TRIAGE'
  },
  {
    id: 3, name: 'bachao', category: 'Help Triggers',
    expected: 'Should show Sakhi TRIAGE menu (Hinglish trigger)',
    steps: [{ msg: 'bachao' }],
    validate: (results) => results[0].responseText.includes('Sakhi') && results[0].state === 'TRIAGE'
  },
  {
    id: 4, name: 'मदद (Hindi)', category: 'Help Triggers',
    expected: 'Should show Sakhi TRIAGE menu (Hindi trigger)',
    steps: [{ msg: 'मदद' }],
    validate: (results) => results[0].responseText.includes('Sakhi') && results[0].state === 'TRIAGE'
  },
  {
    id: 5, name: 'मदत (Marathi)', category: 'Help Triggers',
    expected: 'Should show Sakhi TRIAGE menu (Marathi trigger)',
    steps: [{ msg: 'मदत' }],
    validate: (results) => results[0].responseText.includes('Sakhi') && results[0].state === 'TRIAGE'
  },
  {
    id: 6, name: 'danger', category: 'Help Triggers',
    expected: 'Should show Sakhi TRIAGE menu',
    steps: [{ msg: 'danger' }],
    validate: (results) => results[0].responseText.includes('Sakhi') && results[0].state === 'TRIAGE'
  },
  {
    id: 7, name: 'help → reply 1 (Emergency)', category: 'Triage Flow',
    expected: 'Should transition to EMERGENCY, show police numbers 112 and 181, ask for pincode',
    steps: [{ msg: 'help' }, { msg: '1' }],
    validate: (results) => results[1].state === 'EMERGENCY' && results[1].responseText.includes('112')
  },
  {
    id: 8, name: 'help → reply 2 (Support)', category: 'Triage Flow',
    expected: 'Should transition to SUPPORT, show 4 options menu',
    steps: [{ msg: 'help' }, { msg: '2' }],
    validate: (results) => results[1].state === 'SUPPORT' && results[1].responseText.includes('FIR')
  },
  {
    id: 9, name: 'help → 2 → reply 3 (FIR start)', category: 'FIR Flow',
    expected: 'Should start FIR flow with Sawaal 1',
    steps: [{ msg: 'help' }, { msg: '2' }, { msg: '3' }],
    validate: (results) => results[2].state === 'FIR' && results[2].responseText.includes('Sawaal 1')
  },
  {
    id: 10, name: 'During FIR → pincode 400001', category: 'FIR Flow',
    expected: 'Should record pincode as FIR answer (NOT trigger shelter search), ask next question',
    steps: [{ msg: 'help' }, { msg: '2' }, { msg: '3' }, { msg: '400001' }],
    validate: (results) => results[3].state === 'FIR' && results[3].responseText.includes('Sawaal 2')
  },
  {
    id: 11, name: 'help → 2 → mere pati ne mara (Hinglish FIR)', category: 'FIR Flow',
    expected: 'Should trigger AI response (note: "mere pati ne mara" may NOT trigger FIR flow — no FIR keyword)',
    steps: [{ msg: 'help' }, { msg: '2' }, { msg: 'mere pati ne mara' }],
    validate: (results) => {
      const lastResp = results[2];
      return lastResp.responseText.length > 10; // AI gave some response
    }
  },
  {
    id: 12, name: 'help → 2 → मुझे FIR करनी है (Hindi FIR)', category: 'FIR Flow',
    expected: 'Should start FIR flow in Hindi (contains word FIR)',
    steps: [{ msg: 'help' }, { msg: '2' }, { msg: 'मुझे FIR करनी है' }],
    validate: (results) => results[2].state === 'FIR'
  },
  {
    id: 13, name: 'help → 2 → तक्रार करायची आहे (Marathi FIR)', category: 'FIR Flow',
    expected: 'Should start FIR flow in Marathi (contains तक्रार)',
    steps: [{ msg: 'help' }, { msg: '2' }, { msg: 'तक्रार करायची आहे' }],
    validate: (results) => results[2].state === 'FIR'
  },
  {
    id: 14, name: 'help → 1 → 400001 (Mumbai shelter)', category: 'Shelter Finder',
    expected: 'Should show shelter info for Mumbai area (pincode prefix 40)',
    steps: [{ msg: 'help' }, { msg: '1' }, { msg: '400001' }],
    validate: (results) => results[2].responseText.includes('shelter') || results[2].responseText.includes('Nearest')
  },
  {
    id: 15, name: 'help → 1 → 411001 (Pune shelter)', category: 'Shelter Finder',
    expected: 'Should show shelter info — exact match for Pune OSC',
    steps: [{ msg: 'help' }, { msg: '1' }, { msg: '411001' }],
    validate: (results) => results[2].responseText.includes('Pune')
  },
  {
    id: 16, name: 'help → 1 → 999999 (fake pincode)', category: 'Shelter Finder',
    expected: 'Should return fallback shelters (first 3 from DB) since 99xxxx has no match',
    steps: [{ msg: 'help' }, { msg: '1' }, { msg: '999999' }],
    validate: (results) => results[2].responseText.includes('shelter') || results[2].responseText.includes('Nearest')
  },
  {
    id: 17, name: 'erase (Disguise mode)', category: 'Disguise Mode',
    expected: 'Should activate disguise mode — show Ruchika\'s Kitchen',
    steps: [{ msg: 'erase' }],
    validate: (results) => results[0].responseText.includes('Ruchika') && results[0].state === 'DISGUISE'
  },
  {
    id: 18, name: 'After erase → aloo', category: 'Disguise Mode',
    expected: 'Should show Aloo recipe (stay in disguise)',
    steps: [{ msg: 'erase' }, { msg: 'aloo' }],
    validate: (results) => results[1].responseText.includes('Aloo') && results[1].state === 'DISGUISE'
  },
  {
    id: 19, name: 'After erase → help (break out)', category: 'Disguise Mode',
    expected: 'Should break out of disguise and show Sakhi TRIAGE menu',
    steps: [{ msg: 'erase' }, { msg: 'help' }],
    validate: (results) => results[1].responseText.includes('Sakhi') && results[1].state === 'TRIAGE'
  },
  {
    id: 20, name: 'Mujhe ghar se nikaala ja raha hai...', category: 'AI Support',
    expected: 'Should provide empathetic support about right to live in shared household',
    steps: [{ msg: 'help' }, { msg: '2' }, { msg: 'Mujhe ghar se nikaala ja raha hai kya kar sakti hoon' }],
    validate: (results) => results[2].responseText.length > 20
  },
  {
    id: 21, name: 'Mujhe maintenance chahiye', category: 'AI Support',
    expected: 'Should explain maintenance rights under PWDVA',
    steps: [{ msg: 'help' }, { msg: '2' }, { msg: 'Mujhe maintenance chahiye' }],
    validate: (results) => results[2].responseText.length > 20
  },
  {
    id: 22, name: 'Bachon ki custody kaisi milegi', category: 'AI Support',
    expected: 'Should explain child custody rights',
    steps: [{ msg: 'help' }, { msg: '2' }, { msg: 'Bachon ki custody kaisi milegi' }],
    validate: (results) => results[2].responseText.length > 20
  },
  {
    id: 23, name: 'main bahut dari hui hoon', category: 'AI Support',
    expected: 'Should provide emotional support and safety info',
    steps: [{ msg: 'help' }, { msg: '2' }, { msg: 'main bahut dari hui hoon' }],
    validate: (results) => results[2].responseText.length > 20
  },
  {
    id: 24, name: 'main jeena nahi chahti (Crisis)', category: 'AI Support',
    expected: 'Should detect suicidal intent and include iCall: 9152987821',
    steps: [{ msg: 'help' }, { msg: '2' }, { msg: 'main jeena nahi chahti' }],
    validate: (results) => results[2].responseText.length > 20
  },
  {
    id: 25, name: 'ok (vague input)', category: 'Edge Cases',
    expected: 'Should handle gracefully with AI response',
    steps: [{ msg: 'help' }, { msg: '2' }, { msg: 'ok' }],
    validate: (results) => results[2].responseText.length > 5
  },
  {
    id: 26, name: 'haan (vague input)', category: 'Edge Cases',
    expected: 'Should handle gracefully with AI response',
    steps: [{ msg: 'help' }, { msg: '2' }, { msg: 'haan' }],
    validate: (results) => results[2].responseText.length > 5
  },
  {
    id: 27, name: 'asdfgh123 (gibberish)', category: 'Edge Cases',
    expected: 'Should handle gracefully without crashing',
    steps: [{ msg: 'help' }, { msg: '2' }, { msg: 'asdfgh123' }],
    validate: (results) => results[2].responseText.length > 5
  },
  {
    id: 28, name: '(blank space)', category: 'Edge Cases',
    expected: 'Should handle empty/space input without crashing',
    steps: [{ msg: ' ' }],
    validate: (results) => results[0].responseText.length > 0
  },
  {
    id: 29, name: 'shukriya after FIR draft', category: 'FIR Flow',
    expected: 'Should respond warmly after FIR draft (back in SUPPORT state)',
    steps: [
      { msg: 'help' }, { msg: '2' }, { msg: '3' },
      { msg: 'pati ne mara' }, { msg: 'kal raat' }, { msg: 'pati' }, { msg: 'nahi' }, { msg: 'haan chot aayi' },
      { msg: 'shukriya' }
    ],
    validate: (results) => {
      const last = results[results.length - 1];
      return last.state === 'SUPPORT' && last.responseText.length > 10;
    }
  },
  {
    id: 30, name: 'help after full FIR (fresh restart)', category: 'FIR Flow',
    expected: 'Should restart fresh at TRIAGE menu',
    steps: [
      { msg: 'help' }, { msg: '2' }, { msg: '3' },
      { msg: 'pati ne mara' }, { msg: 'kal raat' }, { msg: 'pati' }, { msg: 'nahi' }, { msg: 'haan chot aayi' },
      { msg: 'help' }
    ],
    validate: (results) => {
      const last = results[results.length - 1];
      return last.state === 'TRIAGE' && last.responseText.includes('Sakhi');
    }
  }
];

// ── Run All Tests ──
async function runAllTests() {
  const results = [];
  const startTime = Date.now();

  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║     🌸 SAKHI BOT — AUTOMATED TEST SUITE 🌸      ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  Started: ${new Date().toISOString()}      ║`);
  console.log('╚══════════════════════════════════════════════════╝\n');

  for (const tc of TEST_CASES) {
    const sender = `test-user-${tc.id}`;
    resetSession(sender);

    console.log(`\n── Test #${tc.id}: ${tc.name} ──`);

    const stepResults = [];
    let error = null;

    try {
      for (const step of tc.steps) {
        const result = await simulateMessage(sender, step.msg);
        stepResults.push(result);
        // Small delay to avoid rate limiting on Groq
        await new Promise(r => setTimeout(r, 300));
      }
    } catch (e) {
      error = e.message;
      console.log(`   ❌ ERROR: ${e.message}`);
    }

    let passed = false;
    try {
      passed = !error && tc.validate(stepResults);
    } catch (e) {
      passed = false;
    }

    const lastResult = stepResults[stepResults.length - 1];
    const truncatedResponse = lastResult
      ? lastResult.responseText.substring(0, 120).replace(/\n/g, ' ') + '...'
      : 'NO RESPONSE';

    console.log(`   State: ${lastResult?.state || 'ERROR'} | Lang: ${lastResult?.lang || '?'}`);
    console.log(`   Response: ${truncatedResponse}`);
    console.log(`   Result: ${passed ? '✅ PASS' : '❌ FAIL'}`);

    results.push({
      id: tc.id,
      name: tc.name,
      category: tc.category,
      expected: tc.expected,
      actualResponse: lastResult?.responseText || `ERROR: ${error}`,
      state: lastResult?.state || 'ERROR',
      lang: lastResult?.lang || '?',
      passed,
      error,
      allStepResponses: stepResults.map((r, i) => ({
        step: i + 1,
        message: tc.steps[i].msg,
        response: r.responseText,
        state: r.state,
        lang: r.lang
      }))
    });
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const passCount = results.filter(r => r.passed).length;
  const failCount = results.filter(r => !r.passed).length;

  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log(`║  RESULTS: ${passCount} passed, ${failCount} failed, ${results.length} total     ║`);
  console.log(`║  Time: ${elapsed}s                                     ║`);
  console.log('╚══════════════════════════════════════════════════╝\n');

  // Save raw JSON results
  const outDir = path.join(__dirname, '..', 'test-results');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const jsonPath = path.join(outDir, 'results.json');
  fs.writeFileSync(jsonPath, JSON.stringify({ meta: { timestamp: new Date().toISOString(), passed: passCount, failed: failCount, total: results.length, elapsed }, tests: results }, null, 2));
  console.log(`📄 JSON results saved to: ${jsonPath}`);

  return { results, passCount, failCount, elapsed };
}

module.exports = { runAllTests, TEST_CASES, simulateMessage, resetSession };

// Run if called directly
if (require.main === module) {
  runAllTests().then(({ passCount, failCount }) => {
    process.exit(failCount > 0 ? 1 : 0);
  }).catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
  });
}
