// Deterministic demo answers for open (non-demo) workbench queries.
// Intents are routed by keyword so every query in the walkthrough gets a
// project-consistent, query-specific plan + answer rather than a generic loop.

export type GenericPath = "fast" | "knowledge" | "complex";
export type GenericComplexity = "simple" | "medium" | "complex";

export type GenericFinding = { label: string; value: string; status: "good" | "warning" | "critical" };

export type GenericAnswer = {
  intent: string;
  agent: string;
  path: GenericPath;
  complexity: GenericComplexity;
  verdict: string;
  answer: string;
  findings: GenericFinding[];
  plan: string[];
  steps: string[];
  verified: string[];
  sources: string[];
  files?: string[];
  approval?: { action: string; artifact: string; due?: string };
};

type Intent = {
  keys: string[];
  answer: GenericAnswer;
};

const model = "KNOVIA-1 (Local)";

const INTENTS: Intent[] = [
  {
    keys: ["catalyst", "reformer"],
    answer: {
      intent: "Catalyst & reformer performance",
      agent: "Data Analysis Agent",
      path: "knowledge",
      complexity: "medium",
      verdict: "Reformer activity at 86% of fresh; age 3.2 yr — run to end-2027, monitor ΔP.",
      answer:
        "Catalyst assessment for the reformer:\n\n- **Age:** 3.2 years (design life 5 yr); activity ≈ **86% of fresh**.\n- **Deactivation rate:** ~1.1%/quarter, slightly above plan due to the hotter furnace (zone-3 skin temp above alarm).\n- **Loop ΔP:** 1.55 → 1.69 kg/cm² over 5 months (+9%), trending toward the 1.75 advisory.\n\n**Recommendation:** do not change out now. Run to the end-2027 turnaround and bundle regeneration/change-out there. In the interim, stage the S/C 3.3 trial and decoke the furnace to recover activity headroom.\n\nCross-check with the Reformer Unit Optimization conversation for the 12-case matrix.",
      findings: [
        { label: "Catalyst age", value: "3.2 yr / 5 yr life", status: "warning" },
        { label: "Activity", value: "86% of fresh", status: "warning" },
        { label: "Deactivation rate", value: "≈ 1.1% / quarter", status: "warning" },
        { label: "Loop ΔP", value: "+9% in 5 months", status: "warning" },
      ],
      plan: [
        "Route to Data Analysis Agent",
        "Pull catalyst aging assessment",
        "Compute activity & ΔP trend",
        "Frame change-out economics",
      ],
      steps: [
        "Resolved reformer asset from project context",
        "Retrieved catalyst aging assessment (3.2 yr)",
        "Operationally cross-checked loop ΔP + furnace firing",
        "Scored change-out vs defer-to-TA",
      ],
      verified: ["Evidence found", "Calculation verified", "Permissions valid"],
      sources: ["Catalyst Aging Assessment – Reformer", "Reformer Operating History – Q3"],
      files: ["reformer-cases"],
    },
  },
  {
    keys: ["efficiency", "hydraulic", "head", "npsh"],
    answer: {
      intent: "Pump hydraulic performance",
      agent: "Calculation Agent",
      path: "knowledge",
      complexity: "medium",
      verdict: "Estimated efficiency 71% → 63%; internal-leak signature confirmed.",
      answer:
        "Hydraulic performance of P-102 (CDU-4 feed transfer):\n\n- **Duty point:** 301 m³/h @ 7.9 kg/cm² (design 320 @ 9.2).\n- **Power draw:** 24.3 kW (design 21.5).\n- **Estimated efficiency:** **71% (Jan) → 63% (Aug)** — Δ 8 pts.\n\nLower discharge + lower flow + higher power is the classic internal-recirculation (wear) signature rather than a cavitation or process issue. NPSH margin remains adequate (NPSHA ≈ 5.4 vs NPSHR 5.2 at 300 m³/h).\n\n**Implication:** efficiency loss ≈ 1.1% of pump energy per month at the current slope; recovery is included in the corrective WO (seal + bearing + rotor balance).",
      findings: [
        { label: "Efficiency", value: "71% → 63%", status: "warning" },
        { label: "Power draw", value: "24.3 kW (design 21.5)", status: "warning" },
        { label: "NPSH margin", value: "NPSHA − NPSHR ≈ 0.2 m", status: "good" },
        { label: "Signature", value: "Internal recirculation", status: "critical" },
      ],
      plan: [
        "Extract duty point from trend",
        "Compute hydraulic efficiency",
        "Check NPSH margin",
        "Attribute degradation signature",
      ],
      steps: [
        "Loaded Jan–Aug duty points",
        "Computed hydraulic efficiency series",
        "Verified NPSH margin vs datasheet",
        "Matched signature to wear",
      ],
      verified: ["Evidence found", "Calculation verified", "SOP referenced"],
      sources: ["P-102 Pump Datasheet / Design", "DCS Historian Extract – P-102"],
    },
  },
  {
    keys: ["permit", "ptw", "lockout", "loto", "confined space", "hot work"],
    answer: {
      intent: "Work permit procedure",
      agent: "HSE Agent",
      path: "knowledge",
      complexity: "medium",
      verdict: "PTW + LOTO/confined-space controls confirmed; 3-step isolation for P-102.",
      answer:
        "Safe-work controls for the P-102 corrective scope:\n\n1. **Permit-to-work (PTW):** Corrective WO requires a \u201cMaintenance Work Permit\u201d type \u2014 signed by Operations, validated by HSE.\n2. **Isolation (LOTO):** three-step for P-102 \u2014 close suction & discharge block valves, spade both flanges, depressurise and drain; visual + tag verification.\n3. **Confined-space / hot work:** only if the casing is entered (then gas test + breathing-air watch), otherwise not required for seal/bearing replacement at deck level.\n4. **Energy:** electrical LOTO on the driver; mechanical zero-energy verified by rotor barring check.\n\nAll permit tags are tracked in the audit trail; approvals run through the Approvals page.",
      findings: [
        { label: "PTW type", value: "Maintenance Work Permit", status: "good" },
        { label: "Isolation steps", value: "2 valves + 2 spades", status: "good" },
        { label: "Electrical LOTO", value: "Driver isolated", status: "good" },
        { label: "Entry requirement", value: "Not required (deck work)", status: "good" },
      ],
      plan: [
        "Identify governing HSE procedure",
        "List isolation steps for P-102",
        "Confirm permit & energy requirements",
        "Bind to audit trail",
      ],
      steps: [
        "Selected MRPL PTW procedure",
        "Mapped P-102 isolation to LOTO steps",
        "Checked confined-space applicability",
        "Attached permit tags to WO",
      ],
      verified: ["Evidence found", "HSE reference checked", "Permissions valid"],
      sources: ["MRPL Work Permit Procedure", "Inspection SOP – Pump P-102"],
    },
  },
  {
    keys: ["api 682", "seal plan", "mechanical seal", "flush plan"],
    answer: {
      intent: "Mechanical seal selection",
      agent: "Engineering Agent",
      path: "fast",
      complexity: "simple",
      verdict: "Plan 11 + 62 recommended for P-102 (weep-prone, single seal).",
      answer:
        "For the P-102 weep-prone service the recommended arrangement is **API 682 Plan 11 + 62**:\n\n- **Plan 11** — closed-loop discharge-to-seal flush with restrictive orifice; the standard for this clean transfer duty.\n- **Plan 62** — quench/barrier fluid on the atmospheric side gives a second line of defense and keeps the weep contained to the drain.\n\nRationale: the current weeping seal (observed 18 Aug 2026) showed 4–6 drops/min at the barrier. Plan 11 + 62 lets us monitor seal health via quench flow and contains any residual leak, which Plan 11 alone cannot.\n\nThe replacement seal kit in the correct WO is specified to this plan with a CD4MCu-graded seat.",
      findings: [
        { label: "Recommended", value: "API 682 Plan 11 + 62", status: "good" },
        { label: "Quench fluid", value: "ISO VG 46 (site std)", status: "good" },
        { label: "Leak containment", value: "Barrier-side drain", status: "good" },
      ],
      plan: ["Check current seal plan", "Recommend API 682 arrangement", "Confirm barrier fluid"],
      steps: ["Verified existing seal plan", "Applied API 682 selection logic", "Matched barrier fluid to site standard"],
      verified: ["Evidence found", "Standard referenced"],
      sources: ["API 682 Seal Selection Guide", "Lubricant Standards – MRPL"],
    },
  },
  {
    keys: ["rbi", "risk based inspection", "inspection plan", "interval"],
    answer: {
      intent: "Risk-based inspection planning",
      agent: "Inspection Agent",
      path: "knowledge",
      complexity: "medium",
      verdict: "RBI plan updated: 2 CDU-4 vessels tightened to 3-yr interval; next FFS screening advised.",
      answer:
        "RBI (API 580) update for CDU-4 after the Sep 2026 findings:\n\n- **Overhead drum** \u2014 risk band 2C → **2B** (chloride/corrosion trend) → interval 4 → **3 yr**.\n- **Furnace feed drum** \u2014 2B → **2A** → interval **3 yr**.\n- **Kettle reboiler** \u2014 unchanged 1C (4 yr).\n\n**FFS screening** is advised on the overhead drum before the next run (level 1, corrosion-thinning case). The tightened intervals are already in the integrity tracker and reflected in the 2027 TA inspection forecast.",
      findings: [
        { label: "Overhead drum", value: "2C → 2B · 3 yr", status: "warning" },
        { label: "Furnace feed drum", value: "2B → 2A · 3 yr", status: "warning" },
        { label: "Kettle reboiler", value: "1C · 4 yr (unchanged)", status: "good" },
      ],
      plan: ["Load RBIS plan", "Re-score with new data", "Reset intervals", "Flag FFS cases"],
      steps: ["Loaded RBIS plan – CDU-4", "Re-scored vessels with Sep data", "Applied interval rules", "Queued FFS screening"],
      verified: ["Evidence found", "API 580 referenced", "Permissions valid"],
      sources: ["RBIS Plan – CDU-4", "CDU-4 Inspection Report – Sep 2026"],
      files: ["cdu4-report"],
    },
  },
  {
    keys: ["turnaround", "shutdown plan", "ta plan", "maintenance window"],
    answer: {
      intent: "Turnaround readiness",
      agent: "Project Agent",
      path: "complex",
      complexity: "complex",
      verdict: "TA readiness 69% vs 30 Sep 2027 gate; critical path = furnace + P-102 slot.",
      answer:
        "2027 annual turnaround status:\n\n- **Window:** Oct 2027, 21 days, fit-to-fire **8 Oct 2027**.\n- **Scope:** 1,142 items, **9 high-risk**, budget ₹38 Cr.\n- **Critical path:** reformer furnace (~14 days) and the **P-102 replacement slot (9 days)** converge at fit-to-fire.\n- **Long-lead:** 68 spares; 6 > 30 weeks (order trigger 15 Nov 2026).\n- **Manpower:** peak 1,850 crafts-days/day in week 2.\n- **Readiness:** **69%** vs the 30 Sep 2027 gate.\n\nThe two watch items are the CX-4 pump award (due 18 Sep) and reformer tube delivery.",
      findings: [
        { label: "Window", value: "Oct 2027 · 21 days", status: "good" },
        { label: "Readiness", value: "69% (gate 30 Sep 2027)", status: "warning" },
        { label: "High risk", value: "9 of 1,142 items", status: "critical" },
        { label: "Manpower peak", value: "1,850 crafts-days/day", status: "warning" },
      ],
      plan: [
        "Pull TA readiness dashboard",
        "Identify critical path chain",
        "Synthesize budget & manpower",
        "Flag watch items",
      ],
      steps: [
        "Loaded 2027 TA readiness dashboard",
        "Traced critical path (furnace + P-102)",
        "Aggregated scope, budget, manpower",
        "Flagged pump award + tube delivery",
      ],
      verified: ["Evidence found", "Cross-checked", "Permissions valid"],
      sources: ["2027 TA Readiness Dashboard", "2027 TA Critical Path Schedule", "2027 Long-Lead Spares List"],
      files: ["ta-schedule", "ta-scope"],
    },
  },
  {
    keys: ["budget", "cost", "estimate", "crore", "lakh"],
    answer: {
      intent: "Cost & budget estimation",
      agent: "Procurement Agent",
      path: "knowledge",
      complexity: "medium",
      verdict: "P-102 replacement ≈ ₹1.28 Cr; TA budget ₹38 Cr (headroom ≈ ₹3.2 Cr).",
      answer:
        "Cost position:\n\n- **P-102 replacement (2027 TA):** pump ₹118 L + install ₹10 L + piping/flush ₹6 L ≈ **₹1.28 Cr**, plus ₹35 L provisional contingency.\n- **2027 TA budget:** **₹38 Cr**; committed/forecast ≈ 58% → headroom ≈ **₹3.2 Cr** for scope creep.\n- **Quarterly energy saving (reformer):** ₹6 L/quarter from the preheat recovery lever (no capital).\n\nAll figures are demo estimates consistent with the CX-4 scorecard and TA scope register.",
      findings: [
        { label: "P-102 replacement", value: "≈ ₹1.28 Cr", status: "warning" },
        { label: "TA budget", value: "₹38 Cr · 58% committed", status: "warning" },
        { label: "Headroom", value: "≈ ₹3.2 Cr", status: "good" },
      ],
      plan: ["Collect estimates", "Reconcile to TA budget", "Compute headroom"],
      steps: ["Pulled WO + vendor cost items", "Reconciled to 2027 TA budget", "Computed provisional headroom"],
      verified: ["Evidence found", "Calculation verified"],
      sources: ["P-102 Maintenance Work Order Summary", "2027 TA Scope Register", "CX-4 Vendor Evaluation"],
      files: ["wo-summary", "ta-scope"],
    },
  },
  {
    keys: ["corrosion", "thickness", "ut", "wall loss", "nd", "ndt"],
    answer: {
      intent: "Corrosion & NDT review",
      agent: "Inspection Agent",
      path: "knowledge",
      complexity: "medium",
      verdict: "BOL 8.4 mm vs 8.0 min; casing 8.6 vs 8.2 min — both on shortened intervals.",
      answer:
        "Live corrosion/NDT watch items:\n\n- **CDU-4 crude-cut BOL:** **8.4 mm vs 8.0 mm min** — remaining allowance ≈ 0.4 mm; UT recheck dropped to **6 months**.\n- **P-102 casing:** **8.6 mm vs 8.2 mm min** — ≈ 0.4 mm (= ~7 months at current rate); interval ≤ 6 months.\n- **EP-32 flange (pipeline):** **7.4 mm vs 8.0 mm min** — below minimum; class-2 monitor with 4-month interim recheck and 2027 TA repair.\n\nBoth non-pipeline items have been moved into the 2027 repair scope register.",
      findings: [
        { label: "CDU-4 crude-cut BOL", value: "8.4 vs 8.0 mm", status: "warning" },
        { label: "P-102 casing", value: "8.6 vs 8.2 mm", status: "warning" },
        { label: "EP-32 flange", value: "7.4 vs 8.0 mm", status: "critical" },
      ],
      plan: ["Gather thickness survey", "Compare to minimums", "Set recheck intervals"],
      steps: ["Collected UT surveys", "Compared vs minimum walls", "Reset intervals + scope registers"],
      verified: ["Evidence found", "Calculation verified", "Permissions valid"],
      sources: ["CDU-4 UT Thickness Survey – Sep 2026", "UT Confirmatory Scan – EP-32"],
      files: ["cdu4-report", "pipeline-digest"],
    },
  },
  {
    keys: ["vibration", "fault", "diagnos", "spectrum", "bearing"],
    answer: {
      intent: "Vibration diagnosis",
      agent: "Diagnostic Agent",
      path: "complex",
      complexity: "complex",
      verdict: "1×RPM likely dominant (unbalance/wear); spectrum run recommended to confirm.",
      answer:
        "Vibration diagnosis for P-102:\n\n- **Signature:** DE 5.9 → 8.2 mm/s, near-linear climb (~0.33 mm/s/mo), temperature rising in step → mechanical wear hypothesis.\n- **Expected spectrum:** 1×RPM dominant (unbalance / bearing clearance) with a secondary 2×RPM (coupling) — the climb couples DE vibration with DE temperature, which favors **bearing-wear / clearance growth**.\n- **Ruled out:** cavitation (would be broad-band + noisy), single-date sensor fault (trend is smooth across 8 readings).\n\n**Confirmation:** during the next isolation, run an order-tracked spectrum and a rotor-balance check; both are inside the corrective WO already.\n\nThe same method applies on CDU-4 furnace fans (watch the skin-temp-linked velocity, not just displacement).",
      findings: [
        { label: "Signature", value: "Monotonic climb, +0.33/mo", status: "warning" },
        { label: "Dominant harmonic", value: "1×RPM (expected)", status: "warning" },
        { label: "Cavitation", value: "Ruled out — pattern", status: "good" },
      ],
      plan: ["Analyse trend shape", "Predict spectrum content", "Exclude process causes", "Define confirm test"],
      steps: ["Analysed 8-point trend", "Predicted 1×/2× content", "Eliminated process causes", "Specified spectrum run"],
      verified: ["Evidence found", "Calculation verified", "Permissions valid"],
      sources: ["P-102 Inspection Report (Aug 2026)", "MRPL Equipment Vibration Limits"],
      files: ["trend-csv"],
    },
  },
  {
    keys: ["training", "certification", "career", "skill", "course"],
    answer: {
      intent: "Skill & certification roadmaps",
      agent: "Knowledge Agent",
      path: "fast",
      complexity: "simple",
      verdict: "API 510/570/653 + NDT L2/L3 + API 580 is the fastest reliability-track route.",
      answer:
        "Recommended certification path for inspection & integrity engineers:\n\n1. **API 510 / 570 / 653** — pressure vessels, piping, storage tanks (foundational).\n2. **NDT Level II → III** (UT/RT/MT/PT) — feeds RBI and repair-scope decisions.\n3. **API 580 (RBI)** — turns inspection data into risk-ranked plans.\n4. **ASNT / ISO 9712** — portable NDT credentials.\n5. **NEBOSH / CCPS** — rounds out the HS&E picture for leadership roles.\n\nPractical tip: pair the certifications with turnaround experience — the 2027 TA is a good place to log RBI/scope work.",
      findings: [
        { label: "Core route", value: "API 510/570/653", status: "good" },
        { label: "Differentiator", value: "API 580 + NDT L3", status: "good" },
        { label: "Experience lever", value: "2027 TA scope work", status: "good" },
      ],
      plan: ["Assess current profile", "Recommend certification order", "Suggest experience levers"],
      steps: ["Matched certs to reliability role", "Ordered by impact", "Bound to TA experience"],
      verified: ["Evidence found"],
      sources: ["Industry Certification Guide", "MRPL Engineering Careers"],
    },
  },
];

const DEFAULT: GenericAnswer = {
  intent: "Cross-domain query",
  agent: "Research Agent",
  path: "knowledge",
  complexity: "medium",
  verdict: "Query routed to Research Agent; synthesised answer from project documents and general knowledge.",
  answer:
    "I've reviewed your request against the current project context, the uploaded documents, and general refinery knowledge.\n\nHere is how the KNOVIA pipeline handled it:\n1. **Plan** — your question was decomposed and routed to the Research Agent.\n2. **Retrieve** — relevant passages were pulled from the project knowledge base.\n3. **Check** — the draft answer was cross-checked for consistency with SOP/limits where applicable.\n4. **Answer** — the consolidated response is presented below, with source references.\n\nFor a deeper, project-specific result, try a question tied to one of the active projects (P-102 health, CDU-4 deviations, CX-4 vendor decision, reformer yield, EP-32 CUI, or the 2027 turnaround).",
  findings: [
    { label: "Route", value: "Research Agent", status: "good" },
    { label: "Knowledge base", value: "1.2K chunks searched", status: "good" },
    { label: "Verification", value: "Cross-checked", status: "good" },
  ],
  plan: ["Decompose query", "Route to best agent", "Retrieve relevant passages", "Verify the draft"],
  steps: ["Parsed intent", "Selected Research Agent", "Searched knowledge base", "Synthesised + checked answer"],
  verified: ["Evidence found", "Cross-checked", "Permissions valid"],
  sources: ["Project Knowledge Base", "General Refinery Practice"],
};

export const answerForQuery = (text: string): GenericAnswer => {
  const t = text.toLowerCase();
  let best: Intent | null = null;
  for (const intent of INTENTS) {
    if (intent.keys.some((k) => t.includes(k))) {
      best = intent;
      break;
    }
  }
  if (!best) return { ...DEFAULT, answer: DEFAULT.answer.replace("your request", `“${text}”`) };
  return best.answer;
};

export const queryPath = (text: string): GenericPath => answerForQuery(text).path;