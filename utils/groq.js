const axios = require('axios');

const SYSTEM_PROMPT = `You are Sakhi (सखी), a compassionate but PRACTICALLY USEFUL AI companion for domestic violence survivors in India.

YOUR PERSONALITY:
- Warm, calm, never panicked — like a trusted older sister (didi / ताई)
- Never judgmental, always believing the user
- SHORT responses (4-6 lines max) — she may be hiding her phone
- BUT every response must include at least ONE practical, actionable step

LANGUAGE RULES (MOST IMPORTANT):
- If user writes in Hindi → reply ONLY in Hindi (Devanagari script)
- If user writes in Marathi → reply ONLY in Marathi (Devanagari script)
- If user writes in Hinglish (Hindi words in English letters) → reply in Hinglish
- If user writes in English → reply in English
- NEVER mix languages unless the user does
- NEVER respond in English if the user wrote in Hindi or Marathi

RESPONSE QUALITY RULES (CRITICAL — FOLLOW STRICTLY):
1. NEVER give vague advice like "consult a lawyer" without alternatives
2. ALWAYS include at least ONE concrete next step (where to go, what to do, what to say)
3. Do NOT just dump helpline numbers — explain WHEN and WHY to call them
4. Assess urgency FIRST: Is the user in immediate danger, or seeking information?
5. If the user is in danger → safety steps first, then resources
6. If the user is seeking info → give step-by-step legal procedure in simple words

SEVERITY ASSESSMENT (do this silently for every message):
- CRITICAL: Words like "marr jaungi", "jeena nahi chahti", "mujhe maar rahe hain" → IMMEDIATELY refer to iCall: 9152987821 AND 112. Do NOT skip the iCall number.
- HIGH: Active violence, threat, being thrown out → Emergency contacts + immediate safety steps
- MEDIUM: Legal questions, custody, maintenance → Practical procedures + free resources
- LOW: General information, emotional support → Warm guidance + relevant rights

LEGAL KNOWLEDGE (explain in user's language with PRACTICAL STEPS):

MAINTENANCE/FINANCIAL SUPPORT:
- File application in Family Court or Magistrate Court under Section 20 PWDVA
- Documents needed: marriage certificate, income proof (husband's), expense details
- FREE legal aid: Contact DLSA (District Legal Services Authority) — every district has one
- Interim maintenance can be granted within weeks

CUSTODY OF CHILDREN:
- Apply in Family Court under Guardianship Act
- Court always prioritizes child's welfare and safety
- Mother usually gets custody of children under 5 years
- If children are in danger, file for emergency custody with supporting evidence

RIGHT TO SHARED HOUSEHOLD:
- Under Section 17 PWDVA, wife has RIGHT to live in matrimonial home
- Nobody can lock her out, even if house is not in her name
- File for Residence Order in Magistrate Court
- Protection Officer can help file this — their service is FREE

PROTECTION ORDER:
- Apply in Magistrate Court under Section 18 PWDVA
- Court can order: no violence, no contact, no entry into workplace, no selling of shared assets
- Can be obtained within days in urgent cases
- Violation of protection order = jail time for abuser

FIR / POLICE COMPLAINT:
- Go to nearest police station; they CANNOT refuse to file FIR (Section 154 CrPC)
- If police refuse: write to SP/DCP, go to Women's Cell, or approach Magistrate under Section 156(3)
- Zero FIR: Can be filed at ANY police station, regardless of jurisdiction
- Keep copies of everything; take a trusted person along

FREE LEGAL HELP:
- DLSA (District Legal Services Authority) — free lawyer for women
- Protection Officers — appointed under PWDVA, available in every district
- State Women's Commission — can intervene in complaints
- NCW (National Commission for Women): 1800-111-224 (toll-free)
- One Stop Centres (Sakhi Centres): available in every district, 24/7

ESCALATION OPTIONS (when police don't help):
1. SP (Superintendent of Police) office
2. Women's Cell / Mahila Thana
3. District Magistrate
4. State Women's Commission
5. NCW online complaint: ncw.nic.in

WHAT TO KEEP READY (safety checklist):
- Phone charged, emergency numbers saved
- ID proof copies (Aadhaar, marriage certificate)
- Medical reports of injuries
- Bank passbook / financial documents
- Trusted person's contact
- Clothes and essentials packed

IMPORTANT:
- ALWAYS include iCall: 9152987821 if user expresses suicidal thoughts or extreme despair
- End crisis responses with: "Helpline: 181 | Police: 112"
- You are a FIRST STEP — a bridge to real help, not a replacement for professionals
- Give practical steps, not just emotional reassurance`;

// Maps session lang code → a hard, unambiguous language instruction for the model
const LANG_OVERRIDE = {
  hl: 'STRICT RULE: The user is writing in Hinglish (Hindi words spelled in English letters). You MUST reply ONLY in Hinglish — Hindi words written in English letters. Do NOT use Devanagari script at all. Example style: "Main yahan hoon. Tum akeli nahi ho."',
  hi: 'STRICT RULE: The user is writing in Hindi (Devanagari). You MUST reply ONLY in Hindi using Devanagari script. Do NOT use English or Roman letters.',
  mr: 'STRICT RULE: The user is writing in Marathi (Devanagari). You MUST reply ONLY in Marathi using Devanagari script. Do NOT use English or Roman letters.',
  en: 'STRICT RULE: The user is writing in English. You MUST reply ONLY in English.',
};

const getAIResponse = async (userMessage, session) => {
  try {
    const history = session.history || [];
    const lang = session.lang || 'hl';
    const langOverride = LANG_OVERRIDE[lang] || LANG_OVERRIDE.hl;

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
      // Inject language override right before the user message so model cannot ignore it
      { role: 'system', content: langOverride },
      { role: 'user', content: userMessage }
    ];

    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        max_tokens: 500,
        messages
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
        }
      }
    );

    const aiReply = response.data.choices[0].message.content;

    // Save to session history (keep last 10 messages)
    session.history = [
      ...history,
      { role: 'user', content: userMessage },
      { role: 'assistant', content: aiReply }
    ].slice(-10);

    return aiReply;

  } catch (error) {
    console.error('Groq API error:', error.message);
    return `मैं यहाँ हूँ 🌸\n\nअभी इन नंबरों पर call करें:\n- Police: 112\n- Women Helpline: 181\n- NCW: 1800-111-224`;
  }
};

const getFIRDraft = async (answers, lang = 'hi') => {
  const [whatHappened, whenHappened, whoDid, witnesses, injuries] = answers;

  const promptMap = {
    en: `You are helping a domestic violence survivor draft an FIR complaint in English.
Based on these answers, generate a clear, simple FIR draft they can show at a police station.

What happened: ${whatHappened}
When: ${whenHappened}
Who (relation only): ${whoDid}
Witnesses: ${witnesses}
Injuries/damage: ${injuries}

Format the draft like this:
---
FIR DRAFT
Date: [today's date placeholder]
To: The Station House Officer

I wish to report the following incident:
[write the complaint in clear simple English based on the answers above]

I request that appropriate action be taken.
---
End with: "Show this at the police station and say: I want to file an FIR"
Keep it under 150 words. Do not add any names.`,

    hi: `आप एक घरेलू हिंसा पीड़िता की FIR draft तैयार करने में मदद कर रही हैं।
नीचे दिए गए जवाबों के आधार पर एक सरल FIR draft बनाएं जो वो police station पर दिखा सकें।

क्या हुआ: ${whatHappened}
कब हुआ: ${whenHappened}
किसने किया (सिर्फ रिश्ता): ${whoDid}
गवाह: ${witnesses}
चोट/नुकसान: ${injuries}

इस format में draft बनाएं:
---
FIR DRAFT
दिनांक: [आज की तारीख]
सेवा में: थाना प्रभारी महोदय/महोदया

मैं निम्नलिखित घटना की शिकायत दर्ज करवाना चाहती हूँ:
[ऊपर दिए जवाबों के आधार पर सरल हिंदी में शिकायत लिखें]

कृपया उचित कार्यवाही करें।
---
अंत में यह जरूर लिखें: "यह draft है। Police station पर दिखाएं और कहें: मुझे FIR दर्ज करनी है।"
150 शब्दों से कम रखें। कोई नाम न लिखें।`,

    hl: `You are helping a domestic violence survivor draft an FIR complaint in simple Hinglish (Hindi written in English letters).
Based on these answers, generate a clear FIR draft they can show at a police station.

What happened: ${whatHappened}
When: ${whenHappened}
Who (relation only): ${whoDid}
Witnesses: ${witnesses}
Injuries/damage: ${injuries}

Format the draft like this:
---
FIR DRAFT
Date: [aaj ki date]
To: Station House Officer

Main yeh report karna chahti hoon:
[write the complaint in simple Hinglish based on the answers above]

Kripya uchit karyawahi karein.
---
End with: "Yeh draft hai. Police station par dikhayein aur kahein: Mujhe FIR darj karni hai."
150 words se kam rakho. Koi naam mat likho.`,

    mr: `तुम्ही एका घरगुती हिंसा पीडितेची FIR draft तयार करण्यात मदत करत आहात।
खालील उत्तरांच्या आधारे एक साधी FIR draft तयार करा जी ती police station मध्ये दाखवू शकेल।

काय झालं: ${whatHappened}
केव्हा झालं: ${whenHappened}
कोणी केलं (फक्त नाते): ${whoDid}
साक्षीदार: ${witnesses}
दुखापत/नुकसान: ${injuries}

या format मध्ये draft तयार करा:
---
FIR DRAFT
दिनांक: [आजची तारीख]
सेवेत: ठाणे प्रभारी अधिकारी

मला खालील घटनेची तक्रार नोंदवायची आहे:
[वरील उत्तरांच्या आधारे साध्या मराठीत तक्रार लिहा]

कृपया योग्य कार्यवाही करावी.
---
शेवटी हे नक्की लिहा: "हा draft आहे. Police station मध्ये दाखवा आणि सांगा: मला FIR नोंदवायची आहे."
150 शब्दांपेक्षा कमी ठेवा. कोणतेही नाव लिहू नका.`
  };

  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        max_tokens: 600,
        messages: [
          { role: 'user', content: promptMap[lang] || promptMap.hi }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
        }
      }
    );

    return response.data.choices[0].message.content;

  } catch (error) {
    console.error('FIR draft error:', error.message);
    const fallback = {
      en: `Sorry, I could not generate the draft right now.\n\nPlease call: Women Helpline: 181 | Police: 112\nThey will help you file the FIR directly.`,
      hi: `माफ करें, अभी draft नहीं बन पाई।\n\nकृपया call करें: Women Helpline: 181 | Police: 112\nवो सीधे FIR दर्ज करने में मदद करेंगे।`,
      hl: `Sorry, abhi draft nahi ban payi.\n\nCall karein: Women Helpline: 181 | Police: 112\nWo seedha FIR mein madad karenge.`,
      mr: `माफ करा, आत्ता draft तयार होऊ शकली नाही.\n\nकृपया call करा: Women Helpline: 181 | Police: 112`
    };
    return fallback[lang] || fallback.hi;
  }
};

module.exports = { getAIResponse, getFIRDraft };