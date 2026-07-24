# MDG Disbursements

A digital disbursement–claim application for **Master Drilling**, built to replace the
paper form *FRM-MDS-FIN-0002-E*. It lets any employee capture travelling and other
expense claims, attach photographic proof, have receipts and bank letters read
automatically by AI, and submit them for approval — with the whole claim rendered to a
PDF that mirrors the original company form.

The entire application is a **single, self-contained HTML file**
(`mdg-disbursements.html`). There is no build step and no server required to run the
front end — it opens in any modern browser.

---

## Contents

- [What it does](#what-it-does)
- [Feature overview](#feature-overview)
- [How to run it](#how-to-run-it)
- [Hosting (beta)](#hosting-beta)
- [Configuration](#configuration)
- [How the AI works](#how-the-ai-works)
- [Duplicate detection](#duplicate-detection)
- [Data & persistence](#data--persistence)
- [Themes](#themes)
- [Current limitations](#current-limitations)
- [Roadmap](#roadmap)
- [Technical notes](#technical-notes)

---

## What it does

An employee opens the app, fills in the same information they used to write on the paper
disbursement form, attaches proof (odometer photos for travel, receipts for other
claims, and a bank confirmation letter), and submits it. Each submitted claim is stored,
tracked through a four-stage progress bar, and can be viewed, edited, downloaded as a
PDF, or deleted. Foreign-currency claims are converted to South African Rand (ZAR)
automatically for reporting and payment.

---

## Feature overview

### Requestor
- **Employee name**, **Email**
- **Site** — searchable, type-ahead dropdown constrained to the company's site list
- **Machine** — searchable, type-ahead dropdown constrained to the cost-allocation
  (financial-dimension) list. A note reminds users that a claim not tied to a specific
  site should be allocated to **Overheads**.

### Banking details
- **Account holder**, **Bank** (dropdown of South African banks), **Account number**
- **Proof of account** upload (image or PDF), required before submission
- **AI bank-letter reader** — reads an uploaded confirmation letter and fills in the
  account holder, bank, and account number automatically (guards against transposed
  digits). Uploading a new letter always replaces the previous details.

### Kilometres tab
- Rows of: Date, From, To, Kilometres, **auto-calculated Amount**, and a per-row
  **odometer photo** upload for verification.
- The amount is calculated from a **hidden per-kilometre rate** (set by admins; never
  shown to requestors).

### Other Claims tab
- Rows of: Date, Description, **Currency**, Amount, and a per-row **receipt (Proof)**
  upload.
- **Currencies:** ZAR, USD, EUR, AUD, BRL, PEN. Each row shows the live ZAR equivalent
  and the exchange rate used.
- **AI receipt reader** — reads an uploaded receipt and fills in the date, description,
  amount, and currency.

### Live currency conversion
Daily exchange rates are fetched on load and used to convert every foreign amount to ZAR
(totals are always in ZAR). Sources are tried in order:
1. `open.er-api.com` (primary)
2. `@fawazahmed0/currency-api` via jsDelivr, then its Cloudflare Pages mirror (fallback)
3. Built-in indicative rates (if all live sources are unreachable)

### Previous Claims
- A list of submitted claims (newest first) with reference, date, type, ZAR total, and
  status.
- A **four-stage progress bar** under each claim: *Filled in disbursement → Submitted to
  HOD → Submitted for payment → Disbursement paid*.
- Per-claim actions:
  - **View** — full claim detail in a modal
  - **PDF** — download a PDF laid out to match *FRM-MDS-FIN-0002-E*
  - **Recall** — reopen the claim in the form for editing (progress is preserved;
    submitting updates the same claim rather than creating a duplicate)
  - **Delete** — permanent, with a confirmation warning

### Admin tab
Manage the app's data without touching code (intended to be access-restricted later):
- Add / remove **sites**
- Add / remove **machines** (searchable)
- Update the **kilometre rate**

### PDF export
Generated in the browser (jsPDF + AutoTable) to mirror the paper form: Master Drilling
header and form number, employee/cost-allocation block, numbered Travelling Claim and
Other Claims tables, Summary of Claims, banking details, and the HOD/Employee approval
block. The submission date is printed prominently.

### Settings
- Theme picker (see [Themes](#themes))
- Back to Hub / Logout actions

---

## How to run it

No installation required.

1. Download `mdg-disbursements.html`.
2. Double-click it (or open it) in a modern browser — Chrome, Edge, Firefox, or Safari.

An internet connection is needed for the AI features, live exchange rates, and the PDF
library.

---

## Hosting (beta)

Because the app is a single static file, it can be hosted anywhere that serves static
web pages. For beta testing, **Cloudflare Pages** (a free `*.pages.dev` domain) is a good
fit:

1. Rename the file to **`index.html`** and place it alone in a folder.
2. In the Cloudflare dashboard, go to **Workers & Pages → Create application → Pages →
   Upload assets**.
3. Name the project, drag the folder (or a zip) into the upload frame, and **Deploy**.
4. The app goes live at `your-project.pages.dev`.

**Important for hosted deployments:** the AI features call a backend proxy (see below).
That proxy must be configured to allow requests from the hosting domain (CORS), otherwise
the receipt and bank-letter readers will be blocked by the browser.

---

## Configuration

Most day-to-day configuration is done in the **Admin tab** (sites, machines, kilometre
rate) and persists in the browser.

A few values live in the code near the top of the main `<script>`:

| Setting | Where | Notes |
|---|---|---|
| Kilometre rate | `KM_RATE` | Default fallback rate; normally set via Admin |
| Default sites | `DEFAULT_SITES` | Built-in site list |
| Machine list | `MACHINES` | Cost-allocation (financial-dimension) list |
| Currencies | `CUR` | Currency codes/labels offered on Other Claims |
| AI proxy URL | `AI_PROXY_URL` | Supabase Edge Function endpoint |
| AI proxy key | `AI_PROXY_ANON` | Public Supabase **anon** key (safe for browser use) |
| Config version | `CONFIG_VERSION` | Bump when built-in defaults change, to refresh saved copies |

---

## How the AI works

The receipt reader and bank-letter reader do **not** call an AI provider directly from the
browser. They POST the image (or PDF) plus an instruction to a **Supabase Edge Function
proxy** (`gemini-proxy`), which holds the AI key server-side and returns the extracted
result. This keeps any real secret out of the downloadable file.

- The embedded credential is a **public Supabase anon key**, which is designed to be used
  in browser code and is not a secret.
- For the AI to work on a hosted site, the Edge Function's **CORS allowed origins** must
  include the site's domain.
- If a call fails, the app degrades gracefully — receipts fall back to manual entry, and
  fields such as Bank remain safe dropdown choices.

---

## Duplicate detection

**Receipts (Other Claims) — rejected:**
- *Exact image* — the same receipt file is detected instantly (before the AI is even
  called) and rejected.
- *Re-photographed* — after the AI reads the receipt, a fingerprint of its date, amount,
  currency, and merchant is compared against receipts already captured, and matches are
  rejected.
- Checks span every line on the current claim and every receipt on previously stored
  claims.

**Whole disbursements — rejected:**
- On submit, a signature of the employee, all line items, and the total is compared to
  existing claims. An identical disbursement is blocked.

**Kilometres — flagged (not blocked):**
- Because the same person may legitimately travel the same route more than once, a
  repeated route + distance is only **flagged**, never rejected.
- A disclaimer appears at the bottom of the form, the claim is marked with a red
  exclamation badge (with hover text) in Previous Claims, and the note is carried into
  the detail view and the PDF.
- Flags are recalculated on load, edit, and delete, so they never go stale (e.g. deleting
  the original clears the flag on the remaining claim).

---

## Data & persistence

Claims, admin configuration (sites/machines/rate), and the selected theme are saved in the
browser's **local storage**, so they survive page reloads.

> **This storage is per-browser and per-device.** Different people — or the same person on
> a different computer — do **not** share data yet. Clearing browser data erases it. A
> shared, permanent, multi-user store requires the backend (see Roadmap).

---

## Themes

Four colour schemes, switchable from the account menu or the Settings page, with the
choice remembered on the device:

- **MDG Light**
- **MDG Dark**
- **Rose** (pastel pink)
- **Lavender**

The Master Drilling logo keeps its blue and grey in every theme, and the header icons
(vehicle, cash, raisebore) re-tint to match the active theme.

---

## Current limitations

- **Data is per-device** (local storage), not shared across users — until the backend is
  connected.
- **AI features require the backend proxy** to be reachable and its CORS to allow the
  hosting domain. They will not work when the file is opened with no internet, or if CORS
  is not configured.
- **The PDF library loads from a CDN** (cdnjs); a browser on a network that blocks CDNs
  won't generate PDFs.
- **No authentication yet** — the Admin tab is not access-restricted, and "Back to Hub" /
  "Logout" are placeholders.
- **Approval and payment are visual only** — submitting sets a claim to *Pending HOD*, but
  nothing is routed to a real approver or exported to finance systems yet.

---

## Roadmap

Planned work that turns this prototype into a production system:

1. **Backend storage** — a shared, permanent database (e.g. Supabase) so claims,
   duplicate history, and settings are shared across everyone and every device.
2. **Submit-to-HOD routing** — send each claim to the correct approver based on the
   company org structure.
3. **Access control** — sign-in (e.g. Microsoft Entra ID) and restricting the Admin tab
   to authorised users.
4. **Finance integration** — export approved claims to **D365** and to the banking
   portal for payment, advancing the progress bar automatically.
5. **Official OANDA rates** — swap the free FX feed for Master Drilling's OANDA Exchange
   Rates API.

---

## Technical notes

- **Single file:** `mdg-disbursements.html` (HTML + CSS + JavaScript inline).
- **External libraries (from cdnjs):** jsPDF and jsPDF-AutoTable, used only for PDF
  generation.
- **AI proxy:** Supabase Edge Function `gemini-proxy`.
- **Exchange rates:** `open.er-api.com`, with `@fawazahmed0/currency-api` (jsDelivr /
  Cloudflare Pages) as fallback.
- **Hashing:** `cyrb53` (fast, non-cryptographic) for receipt image fingerprints.
- **Storage keys:** `mdg-theme`, `mdg-config`, `mdg-claims`.
- **PDF layout:** modelled on *FRM-MDS-FIN-0002-E, Rev. 00*.

---

*Internal tool for Master Drilling — Finance department.*
