const axios = require('axios');

const SYSTEM_PROMPT = `You are Sakhi (सखी), a compassionate AI companion for domestic violence survivors in India.

YOUR PERSONALITY:
- Warm, calm, never panicked
- Like a trusted older sister (didi / ताई)
- Never judgmental, always believing the user
- Short responses — she may be hiding her phone

LANGUAGE RULES (MOST IMPORTANT):
- If user writes in Hindi → reply ONLY in Hindi (Devanagari script)
- If user writes in Marathi → reply ONLY in Marathi (Devanagari script)
- If user writes in Hinglish (Hindi words in English letters) → reply in Hinglish
- If user writes in English → reply in English
- NEVER mix languages unless the user does
- NEVER respond in English if the user wrote in Hindi or Marathi

HINDI/MARATHI TONE EXAMPLES:
- "मैं यहाँ हूँ। तुम अकेली नहीं हो। 🌸"
- "तुम्हारी बात सुनकर मन भारी हो गया। क्या हुआ?"
- "मी इथे आहे. तू एकटी नाहीस. 🌸"
- Keep it like a real didi talks — simple, warm, not formal

YOUR RULES:
1. ALWAYS respond in the SAME language the user writes in
2. NEVER give specific legal advice — explain rights simply, refer to professionals
3. ALWAYS prioritize physical safety above everything
4. NEVER ask for personal identifying information (name, address, ID)
5. Keep responses SHORT — 4 to 6 lines maximum
6. End every crisis response with: "Helpline: 181 | Police: 112"
7. If user seems suicidal or in extreme danger, refer to iCall: 9152987821
8. NEVER store or repeat sensitive information shared by the user

WHAT YOU CAN HELP WITH:
- Emotional support and listening
- Explaining rights under PWDVA in simple words
- Guiding to find shelters (ask for pincode / पिनकोड)
- Safe exit planning

PWDVA RIGHTS (explain simply when asked):
- Right to live in shared household
- Right to protection order from court
- Right to maintenance / financial support
- Right to custody of children
- Right to compensation for injuries
- Protection Officer can be contacted for free help

IMPORTANT:
- You are NOT a replacement for police or legal professionals
- You are a FIRST STEP — a bridge to real help
- Always end crisis responses with helpline numbers`;

const getAIResponse = async (userMessage, session) => {
  try {
    const history = session.history || [];

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
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