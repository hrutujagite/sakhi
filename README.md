<p align="center">
  <img src="https://img.shields.io/badge/🌸-Sakhi_(सखी)-ff69b4?style=for-the-badge&labelColor=white" alt="Sakhi Logo" />
</p>

<h3 align="center">A Silent Guardian on WhatsApp for Domestic Violence Survivors</h3>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-WhatsApp-25D366?style=flat-square&logo=whatsapp&logoColor=white" />
  <img src="https://img.shields.io/badge/AI-Groq_LLaMA_3.3_70B-orange?style=flat-square" />
  <img src="https://img.shields.io/badge/Languages-4_(EN%20|%20HI%20|%20MR%20|%20Hinglish)-blue?style=flat-square" />
  <img src="https://img.shields.io/badge/Shelters-42_OSCs_Mapped-green?style=flat-square" />
  <img src="https://img.shields.io/badge/Deploy-Render_Ready-purple?style=flat-square" />
</p>

---

## 🔥 The Problem

> **Every 3rd woman in India faces domestic violence.** Most never report it — not because they don't want help, but because **asking for help is itself dangerous.**

Existing solutions require downloading apps, visiting websites, or making phone calls — all of which can be discovered by an abuser. **Sakhi solves this by hiding in plain sight** — inside WhatsApp, the app already on every Indian phone.

---

## 💡 What is Sakhi?

**Sakhi (सखी)** is a survivor-centered, AI-powered WhatsApp chatbot that provides **immediate safety, legal guidance, and emergency support** to domestic violence survivors in India.

She acts as a **trusted older sister (didi/ताई)** — empathetic, multilingual, and always available. When danger strikes, Sakhi can silently transform into a harmless cooking bot while secretly alerting trusted contacts and finding nearby shelters.

### ✨ What Makes Sakhi Different?

| Feature | Traditional Helplines | Safety Apps | **Sakhi** |
|---|---|---|---|
| Requires download | ❌ | ✅ | **❌ Uses WhatsApp** |
| Discoverable by abuser | ⚠️ Call logs visible | ⚠️ App icon visible | **✅ Disguise Mode** |
| Works without internet | ✅ | ❌ | ⚠️ Needs WhatsApp |
| Multilingual | Limited | Rare | **✅ 4 languages auto-detected** |
| Legal guidance | ❌ | ❌ | **✅ AI-powered FIR drafting** |
| GPS shelter finding | ❌ | Some | **✅ Top 3 nearest within 50km** |

---

## 🛡️ Core Features

### 1. 🔒 Stealth Mode / Disguise ("Erase")

> **The killer feature.** When an abuser is nearby, the user types their secret keyword or `ERASE` — and Sakhi instantly becomes a cooking recipe bot.

- Chat floods with innocent recipes (Moong Dal Khichdi, Haldi Doodh, Sprout Salad)
- All emergency content is pushed off-screen
- **Behind the scenes**: Trusted contacts are silently alerted with the user's GPS location
- Recipes are localized — a Marathi user sees Marathi recipes
- Type `SAKHI` or `EXIT` to return

### 2. 🚨 Emergency Response System

A multi-layered emergency pipeline with escalation:

```
User triggers distress → Triage (Yes/No) → Emergency Confirmation → Full Emergency Activation
                                                                          ↓
                                                            ┌─────────────┼─────────────────┐
                                                            ↓             ↓                 ↓
                                                     Alert Contacts   GPS Shelters    Safety Steps
                                                            ↓
                                              Auto Check-ins (15/30/45 min)
                                                            ↓
                                              Re-alert if no response
```

- **GPS Shelter Finder**: Finds the top 3 nearest One Stop Centres within 50km using Haversine distance
- **WhatsApp Location Pin**: Drop a pin → instantly get nearest shelters with Google Maps links
- **Trusted Contact Alerts**: Automatic WhatsApp messages with location to pre-registered contacts
- **Timed Check-ins**: Automated follow-ups at 15, 30, 45 minutes — escalates if user goes silent
- **Distress Detection**: Recognizes distress keywords in **10+ Indian languages**

### 3. ⚖️ Legal Rights & FIR Drafting

- **Interactive Legal Menu**: Explains PWDVA rights — Shared Household (Sec 17), Protection Orders (Sec 18), Maintenance (Sec 20), Custody (Sec 21)
- **AI FIR Drafting**: Guided 5-question flow → LLaMA 3.3 70B generates a structured, ready-to-file FIR draft
- **Free Legal Aid Info**: Directs to DLSA for free advocates

### 4. 🌐 Adaptive Multilingual Experience

Language is detected from the **very first message** — the entire experience adapts:

| User Says | Language Detected | Bot Responds In |
|---|---|---|
| `Hi` / `Hello` | English | English |
| `Namaste` / `madad karo` | Hinglish | Hinglish |
| `नमस्ते` / `मदद करो` | Hindi | Hindi |
| `मला मदत हवी` | Marathi | Marathi |

Every prompt — onboarding, triage, emergency, shelter menus, and even disguise recipes — is fully localized.

---

## 🏗️ Architecture

```
┌──────────────┐     Webhook     ┌───────────────────┐     Groq API     ┌─────────────┐
│   WhatsApp   │ ──────────────→ │   Express.js      │ ───────────────→ │  LLaMA 3.3  │
│   (Twilio)   │ ←────────────── │   State Machine   │ ←─────────────── │  70B (AI)   │
└──────────────┘     TwiML       │                   │                  └─────────────┘
                                 │  ┌─────────────┐  │
       ┌─────────────────────────│──│ Emergency    │  │
       │  Outbound Alerts        │  │ Engine       │  │
       │  (Trusted Contacts)     │  └─────────────┘  │
       │                         │  ┌─────────────┐  │
       │                         │  │ Shelter      │──│──→ Haversine GPS (42 OSCs)
       │                         │  │ Finder       │  │
       │                         │  └─────────────┘  │
       │                         │  ┌─────────────┐  │
       │                         │  │ Disguise     │  │
       │                         │  │ Mode         │  │
       │                         │  └─────────────┘  │
       │                         └───────────────────┘
       ↓
  Trusted Contact
  receives SOS alert
  with GPS location
```

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Runtime** | Node.js + Express.js 5 | Server & webhook handler |
| **Messaging** | Twilio WhatsApp API | Two-way WhatsApp communication |
| **AI Engine** | Groq Cloud (LLaMA 3.3 70B) | Empathetic conversation + FIR drafting |
| **Geolocation** | Haversine Formula + GPS | Nearest shelter calculation (<50km) |
| **Persistence** | lowdb (JSON) | Session state & shelter database |
| **Deployment** | Render.com | Production hosting (render.yaml included) |
| **Tunnel** | ngrok | Local development & testing |

---

## 📂 Project Structure

```
sakhi/
├── controllers/
│   └── messageController.js    # Core state machine (654 lines) — routes all user interactions
├── routes/
│   ├── webhook.js              # Twilio webhook endpoint
│   └── location.js             # Stealth GPS capture page (disguised as "Daily Wellness Tip")
├── utils/
│   ├── emergencyMode.js        # Emergency engine, disguise mode, check-in timers, contact alerts
│   ├── shelterFinder.js        # GPS-based shelter search (Haversine), district fallback
│   ├── groq.js                 # AI conversation & FIR draft generation
│   ├── distance.js             # Haversine distance formula
│   ├── locationToken.js        # Single-use token system for GPS capture
│   └── sessions.js             # Session persistence with auto-save
├── data/
│   ├── shelters.json           # 42 One Stop Centres across Maharashtra
│   └── sessions.json           # User session store
├── tests/                      # Automated test suite
├── index.js                    # Server entry point
└── render.yaml                 # One-click Render deployment config
```

---

## ⚡ Quick Start

### Prerequisites
- Node.js v18+
- Twilio Account ([console.twilio.com](https://console.twilio.com))
- Groq API Key ([console.groq.com](https://console.groq.com))

### Setup
```bash
# Clone & install
git clone https://github.com/hrutujagite/sakhi.git
cd sakhi
npm install

# Configure environment
cp .env.example .env
# Fill in your Twilio & Groq credentials

# Start the server
npm start

# In a separate terminal, expose via ngrok
ngrok http 3000
```

### Connect to WhatsApp
1. Copy your ngrok URL
2. Go to **Twilio Console → Messaging → WhatsApp Sandbox → Settings**
3. Set webhook to: `https://<ngrok-url>/webhook`
4. Send the `join <code>` message from your phone
5. Say **"Hi"** — Sakhi will greet you! 🌸

---

## 🧪 Testing

Sakhi includes a comprehensive automated test suite that validates all safety-critical flows **without consuming Twilio credits**:

```bash
# Run full test suite
npm test

# Individual flow tests
node test_triage.js            # Triage & emergency activation
node test_erase.js             # Disguise mode activation
node test_emergency_options.js # All emergency quick-reply branches
node test_chat.js              # Full end-to-end conversation flow
```

---

## 🔒 Safety & Privacy

| Principle | Implementation |
|---|---|
| **Zero Trace** | AI conversation history is never persisted to disk |
| **Single-Use Tokens** | GPS capture links expire immediately after use |
| **Stealth GPS** | Location capture page disguised as a "Daily Wellness Tip" |
| **No App Required** | Runs entirely inside WhatsApp — nothing to download or hide |
| **Localized Disguise** | Cooking recipes match the user's language for maximum believability |

---

## 🌍 Impact & Scope

- **42 One Stop Centres** mapped across Maharashtra with GPS coordinates
- **4 fully supported languages** with auto-detection
- **10+ language** distress keyword recognition
- **24/7 availability** — no human operators needed
- **Zero cost to survivors** — works on any phone with WhatsApp

### Future Roadmap
- 🗺️ Expand shelter database to all Indian states
- 📱 Voice message support for low-literacy users
- 🔗 Integration with NCW (National Commission for Women) portal
- 📊 Anonymous analytics dashboard for NGOs

---

## 👥 Team

Built with ❤️ for the **hackathon** by a team passionate about using technology to protect the vulnerable.

---

## 📜 License

ISC License

---

<p align="center">
  <strong>Sakhi is not a replacement for professional help.<br>She is a bridge — the first step to safety. 🌸</strong>
</p>

<p align="center">
  <em>Helpline: 181 (Women Helpline) | Police: 112 | NCW: 7827-170-170</em>
</p>
