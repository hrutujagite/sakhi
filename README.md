# 🌸 Sakhi (सखी)

**Sakhi** is a survivor-centered, WhatsApp-based AI chatbot designed to provide immediate safety, legal guidance, and emergency support to domestic violence survivors in India. 

Operating under the philosophy of being a "bridge to real help," Sakhi combines empathetic AI conversation with robust emergency features like Silent SOS, GPS-based shelter finding, and automated FIR drafting.

---

## 🚀 Key Features

### 1. 🛡️ Silent SOS / Stealth Mode
- **Cooking Bot Disguise**: Instantly transforms the chat into a fake recipe bot ("Ruchika's Kitchen") using a secret keyword (e.g., "aloo") or the `ERASE` command.
- **Invisible Emergency**: While the screen shows recipes, the backend silently alerts trusted contacts and finds nearby shelters.
- **Zero Leakage**: Suppresses all emergency-related words (e.g., "SOS", "danger", "shelter") while in disguise.

### 2. 🚨 Emergency Response
- **GPS Shelter Finder**: Identifies the top 3 nearest One Stop Centres (OSC) within 50km using high-precision Haversine distance.
- **Trusted Contact Alerting**: Automatically sends localized WhatsApp alerts with the user's location to trusted contacts.
- **Safety Check-ins**: Automated follow-up messages at 15, 30, and 45-minute intervals, with escalation if the user stops responding.

### 3. ⚖️ Legal & Practical Support
- **FIR Drafting**: Guided 5-question flow that uses Groq AI (LLaMA 3.3 70B) to generate a structured, professional FIR draft.
- **Legal Rights Education**: Interactive sub-menu explaining PWDVA rights (Shared Household, Protection Orders, Maintenance, etc.).
- **Emotional Support**: Multi-lingual AI persona acting as a "trusted older sister" (didi/ताई).

### 4. 🌐 Multilingual Accessibility
- Auto-detects and responds in **English, Hindi, Marathi, and Hinglish**.
- Supports distress keyword detection in **10 Indian languages**.

---

## 🛠️ Technology Stack

- **Backend**: Node.js, Express.js 5
- **Messaging**: Twilio WhatsApp API
- **AI Engine**: Groq Cloud (LLaMA 3.3 70B Versatile)
- **Database**: lowdb (Local JSON-based persistence)
- **Geocoding**: OpenStreetMap Nominatim API
- **Maps**: Google Maps Platform (Dynamic routing)

---

## 📂 Project Structure

```text
sakhi/
├── controllers/          # Core state machine & message handlers
├── routes/               # Webhook & stealth location endpoints
├── utils/                # Emergency, AI, distance, & session utils
├── data/                 # Shelter database (JSON) & session store
├── public/               # Stealth GPS capture web page (wellness-tip)
├── index.js              # Server entry point
└── run-tests.js          # 108-point automated safety validation suite
```

---

## ⚙️ Setup & Installation

### 1. Prerequisites
- Node.js (v18+)
- Twilio Account (with WhatsApp Sandbox)
- Groq API Key
- ngrok (for local testing)

### 2. Installation
```bash
git clone <repository-url>
cd sakhi
npm install
```

### 3. Environment Configuration
Create a `.env` file in the root directory:
```env
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=whatsapp:+14155238886
GROQ_API_KEY=your_groq_key
BASE_URL=your_ngrok_url
```

### 4. Running the App
```bash
# Start the server
node index.js

# In a separate terminal, expose via ngrok
ngrok http 3000
```

### 5. Running Tests
Sakhi includes a comprehensive testing suite to verify all safety-critical states and distance calculations.
```bash
node run-tests.js
```

---

## 🛡️ Safety & Ethical Boundaries
- **Not a Replacement**: Sakhi is a bridge to professional help, not a replacement for police or legal counsel.
- **Privacy First**: AI conversation history is never persisted to disk. Location tokens are single-use and expire quickly.
- **Internet Dependency**: Requires an active internet connection to operate over WhatsApp.

---

*Sakhi is a first step — a bridge to real help. 🌸*
