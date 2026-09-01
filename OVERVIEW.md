# Cash Integrity Controller (CIC) — Complete Project Overview

> **An Explainable, Policy-Bound AI Finance-Operations Agent for Razorpay Merchants**  
> Built for the Razorpay Buildathon (Combining Track 3: AI Revenue Recovery & Track 4: AI Finance Controller).

---

## 📑 Table of Contents
1. [What is Cash Integrity Controller?](#1-what-is-cash-integrity-controller)
2. [How to Run the Project (Quickstart)](#2-how-to-run-the-project-quickstart)
3. [Core Architecture & How Analysis Works](#3-core-architecture--how-analysis-works)
   - [5-Tier Reconciliation Engine](#31-5-tier-reconciliation-engine)
   - [Do Not Recover Firewall (Policy Engine)](#32-do-not-recover-firewall-policy-engine)
   - [Transparent Action Scorer](#33-transparent-action-scorer)
   - [Promise-to-Pay (PTP) State Machine](#34-promise-to-pay-ptp-state-machine)
   - [Dynamic Forward Cash Forecaster](#35-dynamic-forward-cash-forecaster)
4. [Live Integrations (Connected in .env)](#4-live-integrations-connected-in-env)
   - [Razorpay Test Mode Integration](#41-razorpay-test-mode-integration)
   - [Google Gemini AI Integration](#42-google-gemini-ai-integration)
   - [Twilio Hinglish Voice Recovery](#43-twilio-hinglish-voice-recovery)
5. [Complete Screen-by-Screen Feature Guide](#5-complete-screen-by-screen-feature-guide)
   - [Screen 1: Batch Command Center (`/`)](#screen-1-batch-command-center-)
   - [Screen 2: Cash Integrity Queue (`/queue`)](#screen-2-cash-integrity-queue-queue)
   - [Screen 3: Evidence Case File (`/cases/[id]`)](#screen-3-evidence-case-file-casesid)
   - [Screen 4: Recovery & Outcome Panel (`/recover/[id]`)](#screen-4-recovery--outcome-panel-recoverid)
   - [Screen 5: Policy & Demo Settings (`/settings`)](#screen-5-policy--demo-settings-settings)
   - [Screen 6: Evaluation Metrics Dashboard (`/metrics`)](#screen-6-evaluation-metrics-dashboard-metrics)
6. [Winning Demo Script (6-Minute Walkthrough)](#6-winning-demo-script-6-minute-walkthrough)
7. [Guarantees & Safety Safeguards](#7-guarantees--safety-safeguards)

---

## 1. What is Cash Integrity Controller?

When customers buy online, money doesn't instantly appear in the merchant's bank account. It flows through gateways, payment attempts, settlements, deduction fees, GST, adjustments, chargebacks, and TDS.

**The Problem:**
- Finance teams struggle to know: *Did every captured rupee actually reach the bank?*
- Recovery systems blindly spam customers with SMS/calls even when the transaction is already settling, disputed, or refunded.

**The Solution:**
**CIC is an autonomous, policy-bound finance agent** that closes the loop between **Finance Reconciliation** and **Customer Recovery**:
1. **Reconciles** 100% of payment attempts, invoices, gateway settlements, and bank statement credits using deterministic integer-math.
2. **Diagnoses** exactly why discrepancies occur across 14+ tax and failure categories.
3. **Applies a "Do Not Recover" Firewall** to block inappropriate customer communication (e.g. during quiet hours, active disputes, or settlement lags).
4. **Executes Least-Intrusive Recovery** (Payment Links, Retries, Consent-aware Voice Calls, PTP management) via real Razorpay Test Mode and Twilio.
5. **Explains Every Decision** via an Evidence Graph, Audit Trail, and Gemini AI-grounded Settlement Q&A.

---

## 2. How to Run the Project (Quickstart)

### Prerequisites
- Node.js 18+ installed

### Step-by-Step Launch

```bash
# 1. Navigate to the cic project directory
cd f:/Razorpay/cic

# 2. Install dependencies (if not already installed)
npm install

# 3. Setup SQLite database & push schema
npx prisma db push

# 4. Seed with 120 synthetic enterprise records
npm run db:seed

# 5. Start the development server
npm run dev
```

Open your browser at **[http://localhost:3000](http://localhost:3000)**.

### Running Automated Tests
We have 39 automated safety & engine tests verifying integer arithmetic, firewall gates, HMAC signatures, and AI deterministic bounds:
```bash
npm run test
```

---

## 3. Core Architecture & How Analysis Works

```text
┌─────────────────┐      ┌──────────────────────────────┐      ┌───────────────────────────┐
│ Ingested Data   │ ───► │ 5-Tier Reconciliation Engine │ ───► │ Diagnosis Taxonomy        │
│ • Orders        │      │ (Exact, Composite, Grouped,  │      │ (14+ Discrepancy Codes)   │
│ • Gateway Txns  │      │  TDS Section 393, AI Candid) │      └─────────────┬─────────────┘
│ • Settlements   │      └──────────────────────────────┘                    │
│ • Bank Credits  │                                                          ▼
└─────────────────┘                                            ┌───────────────────────────┐
                                                               │ Do Not Recover Firewall   │
┌───────────────────────────┐      ┌─────────────────────┐     │ (Blocks Inappropriate Comms│
│ Execution & Attribution   │ ◄─── │ Transparent Scorer  │ ◄── │  Settlement lag, disputes)│
│ • Razorpay Test Links     │      │ (Expected Net Value)│     └───────────────────────────┘
│ • Twilio Outbound Voice   │      └─────────────────────┘
│ • Promise-to-Pay Tracker  │
└───────────────────────────┘
```

### 3.1 5-Tier Reconciliation Engine
Reconciliation uses **strictly integer paise** (no floating-point math errors) and processes in 5 deterministic tiers:
- **Tier A (Exact ID Match - Score 1.0)**: Matches via unique Razorpay `payment_id` or bank UTR reference.
- **Tier B (Composite Match - Score 0.95)**: Matches using `amount + timestamp window + masked customer email/phone`.
- **Tier C (Grouped Settlement Math - Score 0.90)**: Verifies multi-transaction settlement batches:
  $$\text{Net Bank Credit} = \text{Gross Payment} - \text{MDR Fee} - \text{GST (18\%)} \pm \text{Adjustments}$$
- **Tier C.5 (TDS Line-Item Match - Score 0.90)**: Validates statutory tax withholdings (e.g. 1%, 2%, 10% under Income-tax Section 393/194Q) backed by declared PAN and invoice evidence.
- **Tier D (AI-Assisted Candidate Match - Score 0.70-0.85)**: Proposes probable matches for merchant aliases with explicit human review flags.
- **Tier E (Honest Exception)**: If data is ambiguous, CIC **fails safe** into `finance_review` or `unresolved` rather than guessing.

### 3.2 Do Not Recover Firewall (Policy Engine)
Before any recovery action is allowed, the case must pass 8 strict firewall gates:
1. **Cash State Gate**: Hard blocks any case marked `waiting_for_settlement`, `risk_hold`, `finance_review`, or `closed`.
2. **Dispute / Refund Gate**: Blocks contact if a refund or chargeback exists.
3. **Contact Cap Gate**: Enforces max 3 touches across all channels in a 14-day window.
4. **Quiet Hours Gate**: Strictly blocks communication between 19:00 and 10:00 local time.
5. **Opt-Out Gate**: Immediately suppresses contact if customer replied with opt-out / STOP.
6. **Hard Decline Gate**: Prevents futile retries on expired cards, invalid accounts, or revoked mandates.
7. **Active PTP Gate**: Pauses standard dunning while an active Promise-to-Pay promise is pending.
8. **Rail Switch Gate**: UPI Autopay failures propose consented eNACH journeys only after 2+ consecutive failures.

### 3.3 Transparent Action Scorer
Ranks allowed actions based on expected financial value:
$$\text{Expected Net Value} = (\text{Outstanding Amount} \times P(\text{Success})) - \text{Action Cost} - \text{Customer Friction Cost}$$

### 3.4 Promise-to-Pay (PTP) State Machine
- When a customer promises to pay (e.g. *"Main Friday ko pay kar dunga"*):
- CIC pauses all automated reminders until the promised date + 1 grace day.
- If paid $\rightarrow$ Case marked `matched` and closed.
- If breached $\rightarrow$ Resumes at the next policy escalation step with full audit history.

### 3.5 Dynamic Forward Cash Forecaster
Projects expected bank cash inflows across **7, 14, and 30 days**:
$$\text{Projected Cash}(t) = \text{Settled Bank Cash} + \sum(\text{PTP} \times P(\text{Kept})) + \sum(\text{Recoveries} \times P(\text{Success})) + \sum(\text{Pending Settlements})$$
Includes **Low, Base, and High** scenarios based on empirical probability bands.

---

## 4. Live Integrations (Connected in .env)

### 4.1 Razorpay Test Mode Integration
- **Direct API Link Creation**: Calls `POST /v1/payment_links` with server-side Test Mode keys (`rzp_test_...`).
- **Webhook Ingestion**: Verified via HMAC SHA-256 (`x-razorpay-signature`) and deduplicated via `x-razorpay-event-id`.
- **Automatic Re-Reconciliation**: When a customer completes a test payment, the webhook triggers instant case closure and updates the cash bridge.

### 4.2 Google Gemini AI Integration
- **Model**: Google Gemini 2.5 Flash.
- **Settlement Q&A Inspector**: Provides conversational explanations for discrepancies, grounded in deterministic math facts.
- **Strict Anti-Hallucination Guardrail**: LLM cannot alter monetary figures or approve policy overrides. If LLM outputs contradictory numbers, CIC falls back to verified templates.

### 4.3 Twilio Hinglish Voice Recovery
- **Real Phone Calls**: Dials the developer's verified number (`+919266862941`).
- **Bilingual Hinglish Script**: Speaks clear payment assistance with explicit scam safeguards:
  > *"Namaste, main CIC Demo Merchant ki payment assistance team se bol raha hoon... Hum kabhi OTP, UPI PIN, card number ya bank details nahi maangenge. Payment link ke liye 1 dabaiye, Friday tak promise ke liye 2..."*
- **Interactive DTMF**: Key 1 sends link, Key 2 captures PTP, Key 9 handles opt-out.
- **Browser Voice Simulator**: Works out-of-the-box using the Web SpeechSynthesis API even without Twilio.

---

## 5. Complete Screen-by-Screen Feature Guide

### Screen 1: Batch Command Center (`/`)
- **Run Engine Button**: Initiates 5-tier reconciliation across the 120-record batch.
- **Cash Bridge Waterfall**: Visual breakdown of Expected Invoiced $\rightarrow$ Gateway Captured $\rightarrow$ Settled to Bank $\rightarrow$ Deductions $\rightarrow$ Recoverable Exceptions $\rightarrow$ Blocked Cash.
- **Forward Cash Forecaster**: 7 / 14 / 30-day projection cards showing Settled Cash, Weighted PTP, Weighted Pipeline, and Low/Base/High ranges.
- **Live Integration Chips**: Real-time badges for `DEMO MODE`, `RAZORPAY TEST MODE`, `GEMINI AI`, and `TWILIO TEST CALL`.

### Screen 2: Cash Integrity Queue (`/queue`)
- **Prioritized Action Queue**: All discrepancy cases sorted by expected recovery value.
- **Dynamic Filters**: Filter by Cash State (`recoverable`, `waiting_for_settlement`, `finance_review`, `risk_hold`, `matched_with_tds`), Diagnosis Code, and Channels.
- **"Safe Actions Only" Toggle**: Instantly filters to cases where recovery is legally and policy-approved.
- **Action Previews**: Shows next best action, expected net recovery, and confidence score.

### Screen 3: Evidence Case File (`/cases/[id]`)
- **Full Evidence Chain**: Visual links connecting Customer $\rightarrow$ Invoice $\rightarrow$ Payment Attempt $\rightarrow$ Settlement $\rightarrow$ Bank Credit.
- **Exact Calculation Breakdown**: Transparent arithmetic showing Gross, MDR Fee, GST, Adjustments, and Residuals.
- **Settlement Q&A Conversational Inspector**: Ask questions in natural English/Hinglish (powered by Gemini) with calculation chips and source evidence links.
- **"What Would Change My Mind" Panel**: Outlines exact conditions needed to unblock or alter case classification.
- **Immutable Audit Trail**: Chronological event log of all engine evaluations and webhook receipts.
- **Human Review Actions**: Finance managers can Approve, Reject, or Override state with mandatory audit reasoning.

### Screen 4: Recovery & Outcome Panel (`/recover/[id]`)
- **Playbook Step Engine**: Step-by-step recovery workflow (Playbook A: Instant Retry, B: Link Recovery, C: Voice/PTP, D: Consented Rail Switch).
- **Allowed vs Blocked Comparison**: Side-by-side view showing why one action is chosen and why others were blocked by the Firewall.
- **Live Razorpay Payment Link Generator**: Generates clickable `https://rzp.io/...` test links.
- **Hinglish Voice Recovery Console**: Start real Twilio phone calls or browser speech audio with interactive response simulation.
- **Promise-to-Pay (PTP) Tracker**: Capture custom promise dates, auto-pause dunning, and simulate promise fulfillment or breach.

### Screen 5: Policy & Demo Settings (`/settings`)
- **Policy Version Viewer & Editor**: Live configuration of quiet hours, contact touch caps, retry windows, risk thresholds, and high-value approval limits.
- **Integration Toggles**: View status of Razorpay, Twilio, Gemini, and Cloudflare tunnel endpoints.
- **Safe Reset & Reseed**: One-click database wipe and synthetic batch reseed.

### Screen 6: Evaluation Metrics Dashboard (`/metrics`)
- **Precision Rate**: $\ge 98\%$ accuracy on automated matches.
- **Honesty Rate**: Measures deliberate abstentions on ambiguous data.
- **Traceability Coverage**: $100\%$ of cases have verifiable evidence chains.
- **Firewall Effectiveness**: Total number and rupee amount of inappropriate communications blocked.
- **Estimated Net Recovery**: Recovered amounts vs operational costs.

---

## 6. Winning Demo Script (6-Minute Walkthrough)

Follow these steps for an unforgettable hackathon presentation:

1. **The Ingestion & Cash Bridge (1 min)**:
   - Open Command Center (`/`). Click **"▶ Run Engine"**.
   - Show the **Cash Bridge**: *"We started with ₹25.8 Lakhs expected. ₹19.4L is settled in the bank. But ₹3.2L is stuck. Let's see why."*
   - Highlight the **Forward Forecaster**: Show how Day-14 cash separates settled cash from weighted PTP.

2. **Grounded Settlement Q&A (1 min)**:
   - Open Case File for `set_883`. Show the ₹340 discrepancy.
   - In Settlement Q&A, ask: *"Why did settlement set_883 differ by ₹340?"*
   - Show Gemini's verified explanation with calculation chips proving MDR and GST breakdown.

3. **Tax & Integrity Abstention (1 min)**:
   - Open a `matched_with_tds` case to prove section 393/194Q compliance.
   - Open the ₹50,000 short-settlement case: Prove that CIC **abstains** and routes to `finance_review` instead of chasing the customer.

4. **Live Razorpay Test Recovery (1.5 min)**:
   - Open an abandoned checkout or failed payment case in Queue.
   - Show why Payment Link is allowed while direct debits are blocked.
   - Click **"Execute Payment Link"** $\rightarrow$ Show the real generated `https://rzp.io/...` Razorpay link.

5. **Live Hinglish Voice Call & PTP (1.5 min)**:
   - Click **"📞 Start Voice Call"** $\rightarrow$ Show the live Twilio outbound call to your phone.
   - Demonstrate the customer promising Friday payment $\rightarrow$ Capture PTP $\rightarrow$ Show dunning automatically paused on the dashboard.

---

## 7. Guarantees & Safety Safeguards

| Principle | Implementation |
|---|---|
| **No Float Math** | All currency is stored and calculated in integer **paise** ($\text{INR} \times 100$). |
| **No LLM Hallucinations** | Deterministic calculations always override AI text. LLMs only format plain-English explanations. |
| **Fail-Closed Security** | Missing data, tax uncertainty, or expired mandates always route to Human Review (`finance_review`). |
| **Safe Defaults** | Zero real customer spam. Twilio calls only whitelisted test numbers. |
| **Audit Immutability** | Every calculation, decision, and webhook receipt is permanently stored in the `AuditEvent` table. |

---

*Cash Integrity Controller — Built with Next.js 16, TypeScript, Prisma, SQLite, Razorpay Test API, Google Gemini, and Twilio.*
