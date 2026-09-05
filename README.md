<p align="center">
  <h1 align="center">⚡ RevoX — Agentic Recovery Intelligence</h1>
  <p align="center">
    <strong>An Autonomous, Policy-Bound AI Finance Agent for Razorpay Merchants</strong>
  </p>
  <p align="center">
    Built for the <a href="https://razorpay.com/buildathon">Razorpay Buildathon 2026</a>.
  </p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16.3-black?logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Prisma-5.22-2D3748?logo=prisma" alt="Prisma" />
  <img src="https://img.shields.io/badge/Razorpay-API-0C2451?logo=razorpay" alt="Razorpay" />
  <img src="https://img.shields.io/badge/Twilio-Voice-F22F46?logo=twilio&logoColor=white" alt="Twilio" />
  <img src="https://img.shields.io/badge/Tests-39_Passing-2EA44F" alt="Tests" />
</p>

---

## 🧠 What is RevoX?

Merchants lose revenue every single day — not because their product failed, but because **the money never made it through.** A customer adds items to cart and disappears mid-checkout. A recurring subscription silently fails because the card expired. A UPI mandate gets declined twice and nobody follows up. An invoice sits overdue for weeks with zero intervention.

The tools that exist today can sometimes *detect* these problems — but that's where they stop. What happens next is manual chaos: finance teams scrambling through spreadsheets, support teams blasting generic SMS reminders at 11 PM, and nobody checking whether that customer already disputed the charge or opted out of communication.

**RevoX is an autonomous AI agent that closes the gap between knowing revenue is at risk and actually recovering it.** It detects the problem, figures out the root cause, evaluates whether reaching out is even appropriate, picks the least-intrusive recovery action, and executes it — **all without human handoff.**

> *One click. 120 records ingested. At-risk revenue identified. Recovery actions scored, filtered through 8 policy gates, and executed — with a complete audit trail.*

Built over many sleepless nights — debugging voice webhooks at 3 AM, wiring real-time call responses to a React dashboard, and making every integration work end-to-end. Every feature here is live, not a mockup.

---

## 📸 Prototype

### Batch Command Center — Cash Bridge & Forward Forecaster
<img width="1897" height="907" alt="image" src="https://github.com/user-attachments/assets/1f2bd20f-7869-4c92-9545-f1f3ff4720e0" />


### Cash Integrity Queue — Prioritized Recovery Actions
<img width="1901" height="907" alt="image" src="https://github.com/user-attachments/assets/c7277bd0-eeb2-49f7-b662-77757041fb2f" />
<img width="1917" height="907" alt="image" src="https://github.com/user-attachments/assets/b379d37e-45a3-413e-a48b-ee2181cf099a" />
<img width="1895" height="911" alt="image" src="https://github.com/user-attachments/assets/683bd877-e195-4c0f-b6e1-3ce9f3394d51" />

### Evidence Case File — Full Audit Trail
<img width="1900" height="907" alt="image" src="https://github.com/user-attachments/assets/ce8bf2d4-5f95-499e-a067-e42fec391cf3" />

### Recovery Panel — Live Voice Call & Payment Link
<img width="1900" height="906" alt="image" src="https://github.com/user-attachments/assets/7e10ff78-6c37-4130-bee2-72086944a61f" />
<img width="1916" height="907" alt="image" src="https://github.com/user-attachments/assets/24ba940e-8d5a-4a08-8778-a52140258fbe" />
<img width="1610" height="972" alt="Screenshot 2026-09-05 125626" src="https://github.com/user-attachments/assets/5fce8927-9ae6-4e09-957d-6bdd09f8c3ec" />

---

## ✨ Key Features

### 🔁 Autonomous Closed-Loop Agent
Unlike tools that stop at flagging a problem, RevoX autonomously **diagnoses** the root cause (abandoned checkout? expired card? failed mandate?), **decides** whether contacting the customer is even appropriate, **selects** the least-intrusive action, and **executes** it — all in one pipeline.

### 🔍 5-Tier Reconciliation Engine
Deterministic matching across 5 tiers of increasing intelligence:

| Tier | Method | Confidence |
|------|--------|-----------|
| **A** | Exact ID match (payment_id / UTR) | 1.00 |
| **B** | Composite match (amount + timestamp + customer) | 0.95 |
| **C** | Grouped settlement math (Gross − MDR − GST ± Adj) | 0.90 |
| **C.5** | TDS line-item validation (Section 194O/194Q) | 0.90 |
| **D** | AI-assisted candidate match | 0.70–0.85 |
| **E** | Honest exception (routes to human review) | — |

> The agent knows when to act — and when to **abstain**.

### 🛡️ 8-Gate "Do Not Recover" Policy Firewall
Before any action touches a customer, it must pass **8 strict gates**:

```
Cash State → Dispute/Refund → Contact Cap → Quiet Hours → Opt-Out → Hard Decline → Active PTP → Rail Switch
```

If any gate blocks, the agent explains exactly why — no black-box decisioning.

### 📞 Live Hinglish Voice Recovery (Twilio)
Real outbound phone calls in bilingual Hindi-English with anti-scam safeguards:
- **Press 1** → Agent generates a Razorpay payment link instantly
- **Press 2** → Agent captures a Promise-to-Pay and pauses all dunning
- **Press 9** → Opt-out recorded, customer permanently suppressed
- Dashboard updates in **real-time** via DTMF webhook detection

### 🤝 Promise-to-Pay State Machine
When a customer says *"I'll pay Friday"*, the agent:
1. Captures the promise as structured financial state
2. Auto-pauses all recovery actions
3. Waits until promised date + 1 grace day
4. Either closes the case or resumes escalation autonomously

### 💳 Live Razorpay Payment Links (Test Mode)
Real `https://rzp.io/...` payment links generated via Razorpay API. When a customer completes payment, the webhook triggers instant re-reconciliation and case closure.

### 🤖 AI Settlement Q&A
Ask natural-language questions like *"Why did settlement set_883 differ by ₹340?"* and get **math-grounded explanations** with calculation chips. The LLM is strictly bounded — it cannot alter monetary figures or override policy decisions.

### 📊 Forward Cash Forecaster
Projects bank inflows across **7, 14, and 30 days** combining:
- Settled cash + Weighted PTP promises + Recovery pipeline + Pending settlements
- **Low / Base / High** scenario ranges

### 📈 Evaluation Metrics
- **Precision Rate** ≥ 98% on automated matches
- **Honesty Rate** — measures deliberate abstentions
- **Firewall Effectiveness** — blocked communications count & ₹ value
- **Traceability Coverage** — 100% of cases have evidence chains

---

## 🏗️ Architecture

```
┌─────────────────┐      ┌──────────────────────────┐      ┌─────────────────────┐
│ Ingested Data   │ ───► │ 5-Tier Reconciliation    │ ───► │ Diagnosis Engine    │
│ • Orders        │      │ Engine                   │      │ (14+ Discrepancy    │
│ • Gateway Txns  │      │ (Exact → Composite →     │      │  Codes)             │
│ • Settlements   │      │  Grouped → TDS → AI)     │      └──────────┬──────────┘
│ • Bank Credits  │      └──────────────────────────┘                 │
└─────────────────┘                                                   ▼
                                                       ┌──────────────────────────┐
┌─────────────────────┐    ┌───────────────────┐       │ Do Not Recover Firewall  │
│ Recovery Execution  │◄───│ Action Scorer     │◄──────│ (8 Policy Gates)         │
│ • Razorpay Links    │    │ (Expected Net     │       └──────────────────────────┘
│ • Twilio Voice      │    │  Value Ranking)   │
│ • PTP Tracker       │    └───────────────────┘
│ • Audit Trail       │
└─────────────────────┘
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js 18+**
- Razorpay Test Mode API keys ([Get here](https://dashboard.razorpay.com))
- Gemini API key ([Get here](https://aistudio.google.com/apikey))
- Twilio credentials (optional — for live voice calls)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/revox.git
cd revox

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API keys

# Setup database & seed with 120 synthetic records
npx prisma db push
npm run db:seed

# Start the development server
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)** and click **▶ Run Engine** to begin.

### Running Tests
```bash
# Run all 39 automated tests (safety, engine, firewall, HMAC)
npm run test
```

---

## 🔌 Live Integrations

| Integration | Purpose | Status |
|------------|---------|--------|
| **Razorpay Test Mode** | Payment link creation, webhook verification (HMAC SHA-256) | ✅ Connected |
| **Google Gemini 2.5 Flash** | Settlement Q&A with anti-hallucination guardrails | ✅ Connected |
| **Twilio Voice** | Real outbound Hinglish calls with DTMF detection | ✅ Connected |
| **Cloudflare Tunnel** | Public URL for webhook delivery | ✅ Connected |

---

## 📁 Project Structure

```
cic/
├── prisma/
│   ├── schema.prisma          # Complete data model (18+ tables)
│   ├── seed.ts                # 120-record synthetic enterprise dataset
│   └── ground-truth.ts        # Verification data for test accuracy
├── src/
│   ├── app/
│   │   ├── page.tsx           # Batch Command Center (Cash Bridge + Forecaster)
│   │   ├── queue/             # Cash Integrity Queue (prioritized actions)
│   │   ├── cases/[id]/        # Evidence Case File (audit trail + Gemini Q&A)
│   │   ├── recover/[id]/      # Recovery Panel (voice + payment + PTP)
│   │   ├── metrics/           # Evaluation Metrics Dashboard
│   │   ├── settings/          # Policy Editor & Integration Status
│   │   └── api/               # 17 API routes (reconcile, voice, webhook, etc.)
│   ├── lib/
│   │   ├── engine/
│   │   │   ├── reconciler.ts  # 5-tier reconciliation orchestrator
│   │   │   ├── tier-a.ts      # Exact ID matching
│   │   │   ├── tier-b.ts      # Composite matching
│   │   │   ├── tier-c.ts      # Grouped settlement math
│   │   │   ├── tier-c5.ts     # TDS line-item validation
│   │   │   ├── tier-d.ts      # AI-assisted candidate matching
│   │   │   ├── tier-e.ts      # Honest exception routing
│   │   │   ├── firewall.ts    # 8-gate Do Not Recover policy engine
│   │   │   ├── scorer.ts      # Expected Net Value action ranking
│   │   │   ├── diagnosis.ts   # 14+ discrepancy taxonomy
│   │   │   ├── playbooks.ts   # Recovery playbook execution
│   │   │   ├── ptp.ts         # Promise-to-Pay state machine
│   │   │   └── __tests__/     # 39 automated safety & engine tests
│   │   └── integrations/
│   │       ├── razorpay.ts    # Razorpay API (links, webhooks, HMAC)
│   │       ├── voice.ts       # Twilio voice + TwiML generation
│   │       └── llm.ts         # Gemini AI with anti-hallucination bounds
│   └── components/
│       └── Sidebar.tsx        # Navigation sidebar
├── .env.example               # Environment template
├── package.json
└── tsconfig.json
```

---

## 🧪 Safety Guarantees

| Principle | How We Enforce It |
|-----------|------------------|
| **No Float Math** | All currency stored and calculated in integer paise (₹ × 100) |
| **No LLM Hallucinations** | Deterministic engine always overrides AI text; bounded outputs |
| **Fail-Closed Security** | Missing data or tax uncertainty → routes to Human Review |
| **Zero Customer Spam** | Twilio calls only whitelisted test numbers; 8-gate policy firewall |
| **Full Auditability** | Every calculation, decision, and webhook stored in immutable audit trail |

---

## 🛠️ Tech Stack

- **Frontend**: Next.js 16.3, React 19, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Prisma ORM
- **Database**: SQLite (portable, zero-config)
- **AI**: Google Gemini 2.5 Flash (For Settlement Q&A Only)
- **Payments**: Razorpay Test Mode API
- **Voice**: Twilio Programmable Voice
- **Testing**: 39 custom test cases (tsx runner)

---

<p align="center">
  Built with ❤️ and many sleepless nights
</p>
