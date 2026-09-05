<p align="center">
  <h1 align="center">⚡ RevoX — Agentic Recovery Intelligence</h1>
  <p align="center">
    <strong>An Autonomous, Policy-Bound AI Finance Agent for Razorpay Merchants</strong>
  </p>
  <p align="center">
    Built for the <a href="https://razorpay.com/buildathon">Razorpay Buildathon 2026</a> · Track 3 (AI Revenue Recovery) + Track 4 (AI Finance Controller)
  </p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16.3-black?logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Prisma-5.22-2D3748?logo=prisma" alt="Prisma" />
  <img src="https://img.shields.io/badge/Razorpay-Test_Mode-0C2451?logo=razorpay" alt="Razorpay" />
  <img src="https://img.shields.io/badge/Gemini_AI-2.5_Flash-4285F4?logo=google&logoColor=white" alt="Gemini" />
  <img src="https://img.shields.io/badge/Twilio-Voice-F22F46?logo=twilio&logoColor=white" alt="Twilio" />
  <img src="https://img.shields.io/badge/Tests-39_Passing-2EA44F" alt="Tests" />
</p>

---

## 🧠 What is RevoX?

Every time a customer pays online, the money doesn't just land in the merchant's bank — it flows through gateways, settlements, MDR deductions, GST, TDS, chargebacks, and adjustments. Merchants are left asking one painful question: **"Did every captured rupee actually reach my bank?"**

Today, **reconciliation** and **recovery** live in two disconnected worlds. Detection happens — but then what? Finance teams investigate manually, support teams blindly blast SMS reminders, and nobody checks if that customer already has a pending refund.

**RevoX closes this entire loop.** It is an autonomous AI finance agent that goes from raw transaction data → discrepancy detection → diagnosis → policy evaluation → recovery execution — **without human handoff**.

> *One click. 120 records reconciled. Discrepancies diagnosed. Recovery actions scored, filtered through 8 policy gates, and executed — with a complete audit trail.*

This project was built over many sleepless nights — debugging Twilio webhooks at 3 AM, hunting floating-point ghosts in settlement math, and wiring real-time DTMF detection to a React dashboard. Every feature works end-to-end, not just in theory.

---

## 🎥 Demo

<!-- ADD YOUR DEMO VIDEO LINK HERE -->
<!-- [![Watch the Demo](link-to-thumbnail)](link-to-video) -->

---

## 📸 Screenshots

<!-- ADD YOUR SCREENSHOTS BELOW — replace the placeholder paths with your actual image paths -->

### Batch Command Center — Cash Bridge & Forward Forecaster
<!-- ![Command Center](screenshots/command-center.png) -->
`📸 Add screenshot here`

### Cash Integrity Queue — Prioritized Recovery Actions
<!-- ![Queue](screenshots/queue.png) -->
`📸 Add screenshot here`

### Evidence Case File — Full Audit Trail & Gemini AI Q&A
<!-- ![Case File](screenshots/case-file.png) -->
`📸 Add screenshot here`

### Recovery Panel — Live Voice Call & Payment Link
<!-- ![Recovery Panel](screenshots/recovery-panel.png) -->
`📸 Add screenshot here`

### Evaluation Metrics Dashboard
<!-- ![Metrics](screenshots/metrics.png) -->
`📸 Add screenshot here`

---

## ✨ Key Features

### 🔁 Autonomous Closed-Loop Agent
Unlike tools that stop at detection, RevoX autonomously **diagnoses** why a discrepancy exists, **decides** whether recovery is appropriate, **selects** the optimal action, and **executes** it — all in one pipeline.

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

### 🤖 Gemini AI Settlement Q&A
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
| **Cloudflare Tunnel** | Public URL for webhook delivery to localhost | ✅ Connected |

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
- **AI**: Google Gemini 2.5 Flash
- **Payments**: Razorpay Test Mode API
- **Voice**: Twilio Programmable Voice
- **Testing**: 39 custom test cases (tsx runner)

---

<p align="center">
  Built with ❤️ and many sleepless nights for the Razorpay Buildathon 2026
</p>
