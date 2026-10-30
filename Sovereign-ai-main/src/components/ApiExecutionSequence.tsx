import { useEffect, useRef, useState } from "react"

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE || "http://localhost:8000"

const DWELL_MS: Record<string, number> = {
  status: 220,
  plan: 700,
  step_start: 180,
  step_complete: 320,
  result: 650,
  image_stage: 150,
}

const IMAGE_STAGE_MS = 1150
const IMAGE_STEP_MS = 800

const IMAGE_DEMO_STAGES = [
  "Query Received",
  "Processing Image",
  "Understanding Process Diagram",
  "Identifying Equipment & Tags",
  "Mapping Process Flow",
  "Preparing Analysis Plan",
  "Executing Analysis",
  "Generating Response",
]

const IMAGE_DEMO_PLAN = [
  "Identify the industrial process shown in the diagram",
  "Identify major equipment and tagged components",
  "Classify equipment by subsystem",
  "Trace the material/process flow",
  "Explain the function of the major equipment",
  "Summarize the complete process execution",
]

const EXACT_IMAGE_ANSWER = `**Winterization Plant**.

This specialized industrial process removes high-melting-point waxes and solid fats (common in oils such as sunflower, corn, or rice bran) so that the refined oil remains clear at lower temperatures without clouding or precipitating.

### Key Equipment Breakdown (By Legend Designations)

The lower-left legend provides a functional index for all tagged components:   

1. **Vessels & Storage (V-Series):**
   - **\`V701 a,b\` (Crystallization / Dosing Vessels):** Tall jacketed tanks where bleached/deodorized oil is cooled slowly to allow wax molecules to aggregate into solid crystals.   
   - **\`V702\` (Oil Slag Pool):** Collects slops, washings, or residual wax-laden slurry.   
   - **\`V703\` (Wax Vessel):** Receiver tank for the separated liquid/melted wax product.   
   - **\`V704\` (Buffering Storage Tank):** Main output vessel holding the fully dewaxed, clarified oil prior to final storage or packaging.   
   - **\`Filtration Aid Tank\` (bottom left):** Mixes diatomaceous earth or silica filter aid into the oil stream to form a pre-coat layer on the filters, preventing wax from blinding the media.   
2. **Filtration Subsystem (F-Series & L701):**
   - **\`F701 a\u2013d\` (Pressure Leaf / Cake Filters):** A battery of four horizontal/vertical pressure filters running in parallel. They separate the solid wax crystals from the liquid oil.   
   - **\`F702\` (Vent Fan):** Handles off-gas or exhaust from the filtration zone.   
   - **\`L701\` (Dosing Screw):** Metering screw conveyor for adding dry filtration aid into the system.   
3. **Thermal / Energy Recovery Subsystem (E-Series):**
   - **\`E701\`, \`E702\`, \`E703\` (Plate Heat Exchangers / Heat Economizers):**
     - **Economizer (\`E701\`):** Pre-cools incoming warm oil using outgoing cold, dewaxed oil to maximize energy efficiency.   
     - **Coolers (\`E702\`, \`E703\`):** Connected to cooling water/chilled water systems to drop the oil temperature to crystallization levels ($0^\\circ\\text{C}$ to $8^\\circ\\text{C}$).   
4. **Refrigeration Subsystem (C701):**
   - **\`C701\` (Refrigerating Machine / Chiller Unit):** Supplies low-temperature coolant to the heat exchangers and cooling jackets to drive wax precipitation.   
5. **Pumping Network (P-Series):**
   - **\`P701\`, \`P702\` (Oil Conveying Pumps):** Transfer oil through the crystallization tanks and filter feed network.   
   - **\`P703\`, \`P704\` (Circulating & Discharge Pumps):** Move filtered oil through economizers into buffer storage \`V704\`.   
   - **\`P705\`, \`P706\` (Auxiliary / Wax Pumps):** Transfer separated wax waste and byproduct streams.   

### Process Flow Execution

1. **Pre-Cooling & Crystallization:** Warm incoming oil from the deodorization/bleaching section passes through heat exchangers (\`E701\`\u2013\`E703\`) to lower its temperature. Filter aid is introduced via \`L701\`, and the slurry is held in tanks \`V701 a,b\` with gentle agitation to grow stable wax crystals.   
2. **Filtration:** The wax-laden slurry is pumped to the parallel filter battery (\`F701 a\u2013d\`). Solid wax is retained on the filter leaves, while clear oil passes through. Compressed air lines blow down the filter cake during cleaning cycles.   
3. **Heat Recovery & Storage:** The cold, clear oil passes back through heat exchanger \`E701\` to cool incoming feed (reclaiming thermal energy) before discharging into buffer storage tank \`V704\` via pump \`P704\`.   
4. **Wax Collection:** Spent wax is purged into the wax vessel \`V703\` and slag pool \`V702\` for byproduct discharge.`

type Phase = "processing" | "planning" | "executing" | "completed"

const PHASES: { key: Phase label: string }[] = [
  { key: "processing", label: "Processing" },
  { key: "planning", label: "Planning" },
  { key: "executing", label: "Executing" },
  { key: "completed", label: "Completed" },
]

type DocRowState = {
  key: string
  title: string
  docType: string
  kind: string
  stage: "pending" | "generating" | "validating" | "ready" | "failed"
  error?: string
}

export function normalizePlan(p: any): any[] {
  if (Array.isArray(p)) return p
  if (p && Array.isArray(p.steps)) return p.steps
  return []
}

type ActivePhase = "processing" | "planning" | "executing" | "completed"

const DOC_ICON: Record<string, string> = {
  PDF: "\u{1F4C4}",
  DOCX: "\u{1F4DD}",
  XLSX: "\u{1F4CA}",
  CSV: "\u{1F4CA}",
  ZIP: "\u{1F4E6}",
  code_project: "\u2728",
}

function docIcon(docType: string) {
  return DOC_ICON[docType] || "\u{1F4C4}"
}

const DOC_STYLES: Record<DocRowState["stage"], {
  bg: string
  color: string
  label: string
}> = {
  pending: { bg: "#F1F5F9", color: "#64748B", label: "Queued" },
  generating: { bg: "#F0FDFA", color: "#0F766E", label: "Generating" },
  validating: { bg: "#FFFBEB", color: "#B45309", label: "Validating" },
  ready: { bg: "#F0FDF4", color: "#15803D", label: "Ready" },
  failed: { bg: "#FEF2F2", color: "#B91C1C", label: "Failed" },
}

export default function ApiExecutionSequence({
  query,
  role = "ENGINEER",
  conversationId = "",
  projectId = "",
  chatId = "",
  contributor = "",
  imageDemo = null,
  onDone,
  onCodingRedirect,
}: {
  query: string
  role?: string
  conversationId?: string
  projectId?: string
  chatId?: string
  contributor?: string
  imageDemo?: { preview: string name: string runId: string } | null
  onDone: (data: any) => void
  onCodingRedirect?: (coding: any) => void
}) {
  const [phase, setPhase] = useState<Phase>("processing")
  const [procLines, setProcLines] = useState<string[]>([])
  const [steps, setSteps] = useState<any[]>([])
  const [stepsDone, setStepsDone] = useState<number>(0)
  const [runningStep, setRunningStep] = useState<number | null>(null)
  const [docRows, setDocRows] = useState<DocRowState[]>([])
  const [error, setError] = useState<string | null>(null)
  const [stages, setStages] = useState<{
    label: string
    status: "pending" | "running" | "done"
  }[]>(
    IMAGE_DEMO_STAGES.map((label) => ({ label, status: "pending" as const })),
  )

  const stepsRef = useRef<any[]>([])
  const stepsDoneRef = useRef<number>(0)
  const runningStepRef = useRef<number | null>(null)

  const imageDemoRef = useRef(imageDemo)
  imageDemoRef.current = imageDemo

  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone
  const onRedirectRef = useRef(onCodingRedirect)
  onRedirectRef.current = onCodingRedirect
  const redirectedRef = useRef(false)

  const activeRef = useRef(true)
  const tokenRef = useRef<any>(null)
  const settledRef = useRef(false)
  const lastResultRef = useRef<any>(null)
  const sawResultEvent = useRef(false)

  useEffect(() => {
    // StrictMode double-invokes effects in dev (mount -> cleanup -> mount).
    // Re-arm the guard and give each run its own token so only the CURRENT
    // run may settle the flight; superseded runs become no-ops.
    activeRef.current = true
    sawResultEvent.current = false
    lastResultRef.current = null
    settledRef.current = false
    const token = {}
    tokenRef.current = token
    const controller = new AbortController()

    const events: any[] = []
    let draining = false

    function settle(data: any) {
      if (tokenRef.current !== token || settledRef.current) return
      settledRef.current = true
      if (activeRef.current) onDoneRef.current(data)
    }

    function applyEvent(data: any) {
      if (tokenRef.current !== token || !activeRef.current) return
      if (!data || typeof data !== "object") return

      if (data.type === "status") {
        if (data.message) {
          setProcLines((p) => [...p.slice(-8), String(data.message)])
        }
      } else if (data.type === "image_stage") {
        const idx = typeof data.index === "number" ? data.index : 0
        const status = data.status === "done" ? "done" : "running"
        setStages((prev) =>
          prev.map((s, i) => {
            if (i < idx) return { ...s, status: "done" as const }
            if (i === idx) return { ...s, status: status as const }
            return { ...s, status: "pending" as const }
          }),
        )
      } else if (data.type === "plan") {
        setPhase("planning")
        const p = data.data ?? data.plan ?? data
        const list = normalizePlan(p)
        stepsRef.current = list
        stepsDoneRef.current = 0
        runningStepRef.current = null
        setSteps(list)
        setStepsDone(0)
        setRunningStep(null)
      } else if (data.type === "step_start") {
        setPhase("executing")
        const idx = typeof data.step_index === "number" ? data.step_index : 0
        runningStepRef.current = idx
        setRunningStep(idx)
      } else if (data.type === "step_complete") {
        setPhase("executing")
        const idx = typeof data.step_index === "number" ? data.step_index : 0
        stepsDoneRef.current = Math.max(stepsDoneRef.current, idx + 1)
        runningStepRef.current = null
        setStepsDone(stepsDoneRef.current)
        setRunningStep(null)
      } else if (data.type === "codegen" || data.type === "docgen") {
        const isCode = data.type === "codegen"
        const key = `${data.type}-${data.query_id || data.task_id || data.doc_type || ""}`
        if (phase === "processing" || phase === "planning")
          setPhase("executing")
        if (data.message)
          setProcLines((p) => [...p.slice(-8), String(data.message)])
        setDocRows((prev) => {
          const rest = prev.filter((r) => r.key !== key)
          const st = data.stage
          const title =
            data.title ||
            data.project ||
            (isCode ? "Code project" : data.doc_type || "Document")
          if (st === "start" || st === "generating")
            return [
              ...rest,
              {
                key,
                title,
                docType: isCode ? "code_project" : data.doc_type || "",
                kind: isCode ? "code" : "doc",
                stage: "generating" as const,
              },
            ]
          if (st === "validating" || st === "permission") {
            if (!rest.find((r) => r.key === key))
              return [
                ...rest,
                {
                  key,
                  title,
                  docType: isCode ? "code_project" : data.doc_type || "",
                  kind: isCode ? "code" : "doc",
                  stage: "validating" as const,
                },
              ]
            return rest.map((r) =>
              r.key === key ? { ...r, stage: "validating" as const } : r,
            )
          }
          if (st === "ready" || st === "failed")
            return [
              ...rest,
              {
                key,
                title,
                docType: isCode ? "code_project" : data.doc_type || "",
                kind: isCode ? "code" : "doc",
                stage: st === "ready" ? "ready" as const : "failed" as const,
                error: data.error,
              },
            ]
          return prev
        })
      } else if (
        data.type === "coding_redirect" ||
        (data.type === "codegen" && data.stage === "start")
      ) {
        const coding =
          data.type === "coding_redirect"
            ? data.coding || {}
            : {
                session_id: data.session_id,
                task_id: data.task_id,
                project: data.project,
                title: data.title,
                mode: data.mode,
              }
        if (coding?.session_id && !redirectedRef.current) {
          redirectedRef.current = true
          if (onRedirectRef.current) onRedirectRef.current(coding)
        }
      } else if (data.type === "result") {
        lastResultRef.current = data
        setPhase("completed")
        runningStepRef.current = null
        setRunningStep(null)
        const list = normalizePlan(data.plan)
        if (list.length > 0) {
          stepsRef.current = list
          stepsDoneRef.current = list.length
          setSteps(list)
          setStepsDone(list.length)
        }
        const files = Array.isArray(data.files) ? data.files : []
        if (files.length > 0) {
          setDocRows((prev) => {
            const rest = prev.filter((r) => r.kind !== "file")
            return [
              ...rest,
              ...files.map((f: any) => ({
                key: `file-${f.id || f.name || Math.random()}`,
                title: f.title || f.name || "Artifact",
                docType: f.type || f.format || "",
                kind: "file" as const,
                stage: "ready" as const,
              })),
            ]
          })
        } else if (data.error) {
          setError(String(data.error))
        }
        window.setTimeout(() => settle(data), DWELL_MS.result)
      }
    }

    function push(data: any) {
      events.push(data)
      if (data && data.type === "result") {
        lastResultRef.current = data
        sawResultEvent.current = true
      }
      drain()
    }

    async function drain() {
      if (draining) return
      draining = true
      while (events.length > 0) {
        if (tokenRef.current !== token) break
        const ev = events.shift()
        if (!ev) continue
        await delay(DWELL_MS[ev.type] ?? 0)
        applyEvent(ev)
      }
      draining = false
    }

    // Deterministic, frontend-only image demo flow. The image and its query are
    // NEVER sent anywhere - a controlled state machine replays the eight stages,
    // then the six-step plan, then the exact final answer.
    async function runImageDemo(token: any) {
      for (let k = 0; k < IMAGE_DEMO_STAGES.length; k++) {
        if (tokenRef.current !== token) return
        push({ type: "status", message: `⟳ ${IMAGE_DEMO_STAGES[k]}…` })
        push({ type: "image_stage", index: k, status: "running" })
        await delay(IMAGE_STAGE_MS)
        if (tokenRef.current !== token) return
        push({ type: "status", message: `✓ ${IMAGE_DEMO_STAGES[k]}` })
        push({ type: "image_stage", index: k, status: "done" })
        await delay(240)
      }

      if (tokenRef.current !== token) return
      push({
        type: "status",
        message: "⟳ Image interpreted — preparing the analysis plan…",
      })
      push({ type: "plan", data: IMAGE_DEMO_PLAN })
      await delay(650)

      for (let s = 0; s < IMAGE_DEMO_PLAN.length; s++) {
        if (tokenRef.current !== token) return
        push({ type: "step_start", step_index: s })
        push({ type: "status", message: `⟳ ${IMAGE_DEMO_PLAN[s]}…` })
        await delay(IMAGE_STEP_MS)
        if (tokenRef.current !== token) return
        push({ type: "status", message: `✓ ${IMAGE_DEMO_PLAN[s]}` })
        push({ type: "step_complete", step_index: s })
        await delay(260)
      }

      if (tokenRef.current !== token) return
      push({
        type: "result",
        image_demo: true,
        plan: IMAGE_DEMO_PLAN,
        steps: IMAGE_DEMO_PLAN,
        proc_lines: [],
        intent: "image_analysis",
        complexity: "image",
        answer: EXACT_IMAGE_ANSWER,
        findings: [],
        sources: [],
        files: [],
        charts: [],
        analysis: null,
        approval: null,
        entity: null,
        coding: null,
      })
    }

    async function run() {
      const demo = imageDemoRef.current
      if (demo) {
        await runImageDemo(token)
        return
      }
      try {
        const res = await fetch(`${API_BASE}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query,
            role,
            conversation_id: conversationId || undefined,
            project_id: projectId || undefined,
            chat_id: chatId || undefined,
            contributor: contributor || undefined,
          }),
          signal: controller.signal,
          cache: "no-store",
        })

        if (!res.ok || !res.body) {
          settle({
            error: res.ok ? "Empty response" : `Backend error ${res.status}`,
            answer:
              "The backend did not return a stream. Please check that the API server is running.",
          })
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        while (true) {
          if (tokenRef.current !== token) return
          const { done, value } = await reader.read()
          if (done) {
            if (value) buffer += decoder.decode(value, { stream: false })
            break
          }

          buffer += decoder.decode(value, { stream: true })
          const parts = buffer.split("\n\n")
          buffer = parts.pop() || ""

          for (const p of parts) {
            const line = p.trim()
            if (line.startsWith("data: ")) {
              try {
                push(JSON.parse(line.slice(6)))
              } catch (e) {
                console.error("SSE parse error:", e, "Payload:", line)
              }
            }
          }
        }

        const tail = buffer.trim()
        if (tokenRef.current === token && tail.startsWith("data: ")) {
          try {
            push(JSON.parse(tail.slice(6)))
          } catch (e) {
            console.error("SSE tail parse error:", e, "Payload:", tail)
          }
        }

        // Stream ended. Only synthesize a fallback if NO result event ever arrived.
        if (tokenRef.current === token && !sawResultEvent.current) {
          settle({
            error: "Backend closed the stream without a result",
            answer: "No response generated.",
          })
        }
      } catch (err: any) {
        if (tokenRef.current !== token) return
        if (controller.signal.aborted) return
        settle({
          error: String(err?.message || err),
          answer: "Failed to connect to backend.",
        })
      }
    }

    run()

    return () => {
      controller.abort()
      if (tokenRef.current === token) tokenRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const planDone =
    steps.length > 0 && stepsDone >= steps.length && runningStep === null
  const phaseIdx = PHASES.findIndex((p) => p.key === phase)
  const active = phase !== "completed"
  const live = runningStep !== null ? 1 : 0

  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-md overflow-hidden w-full font-sans">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b"
        style={{
          borderColor: "#E2E8F0",
          background: "linear-gradient(to right, #F8FAFC, #FFFFFF)",
        }}
      >
        <div className="flex items-center gap-2.5">
          <span
            className={`relative w-2.5 h-2.5 ${
              active ? "bg-teal-500" : "bg-green-500"
            } rounded-full`}
            style={{
              boxShadow: active
                ? "0 0 0 4px rgba(20,184,166,0.15)"
                : "0 0 0 4px rgba(34,197,94,0.15)",
            }}
          >
            {active && (
              <span className="absolute inset-0 rounded-full animate-ping bg-teal-400 opacity-60"></span>
            )}
          </span>
          <div className="leading-tight">
            <div className="text-[13px] font-bold" style={{ color: "#0F172A" }}>
              KNOVIA AI
            </div>
            <div className="text-[10px] font-medium text-slate-400">
              MRPL Workbench · local inference
            </div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {PHASES.map((p, i) => (
            <span
              key={p.key}
              className="hidden sm:inline-flex text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-widest border items-center gap-1"
              style={
                phase === p.key
                  ? {
                      background: "#CCFBF1",
                      color: "#0F766E",
                      borderColor: "#99F6E4",
                    }
                  : phaseIdx > i
                    ? {
                        background: "#F0FDF4",
                        color: "#15803D",
                        borderColor: "#BBF7D0",
                      }
                    : {
                        background: "#FFFFFF",
                        color: "#CBD5E1",
                        borderColor: "#E2E8F0",
                      }
              }
            >
              {phaseIdx > i ? "\u2713" : ""} {p.label}
            </span>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Query */}
        <div className="text-[12px] leading-relaxed">
          <span className="text-slate-400 font-medium">Query — </span>
          <span className="text-slate-700 font-medium">{query}</span>
        </div>

        {/* Image input (image-demo only) */}
        {imageDemo && (
          <>
            <div
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 border"
              style={{ background: "#F8FAFC", borderColor: "#E2E8F0" }}
            >
              <div
                className="rounded-lg overflow-hidden border flex-shrink-0"
                style={{ borderColor: "#E2E8F0", background: "#FFFFFF" }}
              >
                <img
                  src={imageDemo.preview}
                  alt={imageDemo.name}
                  className="block h-12 w-16 object-cover"
                />
              </div>
              <div className="min-w-0">
                <div
                  className="text-[10px] font-bold uppercase tracking-widest"
                  style={{ color: "#0F766E" }}
                >
                  Image Input
                </div>
                <div
                  className="text-[11px] font-medium truncate"
                  style={{ color: "#334155" }}
                >
                  {imageDemo.name}
                </div>
              </div>
              <span
                className="ml-auto text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex-shrink-0"
                style={{
                  background: "#F0FDFA",
                  color: "#0F766E",
                  border: "1px solid #99F6E4",
                }}
              >
                {active ? "Processing" : "Processed"}
              </span>
            </div>

            {/* Deterministic image processing stages */}
            <div
              className="rounded-xl border overflow-hidden"
              style={{ borderColor: "#E2E8F0" }}
            >
              <div
                className="flex items-center justify-between px-4 py-2.5"
                style={{
                  background: "#F8FAFC",
                  borderBottom: "1px solid #F1F5F9",
                }}
              >
                <div
                  className="text-[11px] font-bold uppercase tracking-widest"
                  style={{ color: "#0F172A" }}
                >
                  Image Processing Stages
                </div>
                <div
                  className="text-[10px] font-bold tabular-nums"
                  style={{ color: "#64748B" }}
                >
                  {stages.filter((s) => s.status === "done").length}/
                  {stages.length}
                </div>
              </div>
              <div className="divide-y divide-slate-100">
                {stages.map((s, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2">
                    <span
                      className="text-[10px] font-bold tabular-nums shrink-0"
                      style={{ color: "#94A3B8", width: 28 }}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span
                      className="flex-1 min-w-0 text-[12px] font-medium leading-snug break-words"
                      style={{
                        color:
                          s.status === "pending"
                            ? "#94A3B8"
                            : s.status === "running"
                              ? "#0F766E"
                              : "#1E293B",
                      }}
                    >
                      {s.label}
                    </span>
                    {s.status === "running" && (
                      <span
                        className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-teal-700 flex-shrink-0"
                        style={{
                          background: "#F0FDFA",
                          padding: "2px 8px",
                          borderRadius: 999,
                          border: "1px solid #99F6E4",
                        }}
                      >
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse"></span>
                        Running
                      </span>
                    )}
                    {s.status === "done" && (
                      <span
                        className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-green-700 flex-shrink-0"
                        style={{
                          background: "#F0FDF4",
                          padding: "2px 8px",
                          borderRadius: 999,
                          border: "1px solid #BBF7D0",
                        }}
                      >
                        <span className="text-[11px]">{"\u2713"}</span>{" "}
                        Completed
                      </span>
                    )}
                    {s.status === "pending" && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex-shrink-0">
                        Pending
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Live console */}
        {procLines.length > 0 && (
          <div
            className="rounded-xl px-3.5 py-3 shadow-sm border font-mono text-[11px] leading-relaxed space-y-1 overflow-hidden"
            style={{ background: "#FAFAFA", border: "1px solid #E2E8F0" }}
          >
            {procLines.map((l, i) => (
              <div
                key={i}
                className="flex gap-2 whitespace-nowrap overflow-hidden text-ellipsis"
                style={{
                  color: l.includes("\u2717")
                    ? "#F87171"
                    : l.startsWith("\u2713")
                      ? "#15803D"
                      : "#334155",
                }}
              >
                <span className="text-slate-400 select-none">{"\u203A"}</span>
                <span>{l}</span>
              </div>
            ))}
            {active && (
              <div className="flex items-center gap-1.5 text-teal-600 mt-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse"></span>
                <span>
                  {phase === "processing"
                    ? "Processing…"
                    : phase === "planning"
                      ? "Planning…"
                      : phase === "executing"
                        ? live > 0
                          ? `Executing step…`
                          : "Executing…"
                        : ""}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Execution plan */}
        {steps.length > 0 && (
          <div
            className="rounded-xl border overflow-hidden"
            style={{ borderColor: "#E2E8F0" }}
          >
            <div
              className="flex items-center justify-between px-4 py-2.5"
              style={{
                background: "#F8FAFC",
                borderBottom: "1px solid #F1F5F9",
              }}
            >
              <div className="text-[11px] font-bold uppercase tracking-widest text-slate-600">
                Execution Plan
              </div>
              <div className="flex items-center gap-2">
                {planDone && (
                  <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-green-50 text-green-700 border border-green-200">
                    \u2713 Plan completed
                  </span>
                )}
                <span
                  className="text-[10px] font-bold tabular-nums"
                  style={{ color: "#64748B" }}
                >
                  {stepsDone}/{steps.length}
                </span>
              </div>
            </div>
            <div
              className="divide-y divide-slate-100 max-h-64 overflow-y-auto"
              style={{ background: "#FFFFFF" }}
            >
              {steps.map((_, i) => {
                const state =
                  i < stepsDone
                    ? "done"
                    : i === runningStep
                      ? "running"
                      : "pending"
                return (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                    <span
                      className="w-6 h-6 rounded-full border flex items-center justify-center text-[10px] font-bold tabular-nums shrink-0"
                      style={
                        state === "done"
                          ? {
                              background: "#F0FDF4",
                              borderColor: "#86EFAC",
                              color: "#15803D",
                            }
                          : state === "running"
                            ? {
                                background: "#F0FDFA",
                                borderColor: "#5EEAD4",
                                color: "#0F766E",
                              }
                            : {
                                borderColor: "#E2E8F0",
                                color: "#94A3B8",
                                background: "#FFFFFF",
                              }
                      }
                    >
                      {state === "done"
                        ? "\u2713"
                        : String(i + 1).padStart(2, "0")}
                    </span>
                    <span
                      className="flex-1 min-w-0 text-[12px] font-medium leading-snug break-words"
                      style={{
                        color:
                          state === "pending"
                            ? "#94A3B8"
                            : state === "running"
                              ? "#0F766E"
                              : "#1E293B",
                      }}
                    >
                      {typeof steps[i] === "string"
                        ? steps[i]
                        : steps[i]?.title ||
                          steps[i]?.summary ||
                          `Step ${i + 1}`}
                    </span>
                    {state === "running" && (
                      <span
                        className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-teal-700"
                        style={{
                          background: "#F0FDFA",
                          padding: "2px 8px",
                          borderRadius: 999,
                          border: "1px solid #99F6E4",
                        }}
                      >
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse"></span>
                        Running
                      </span>
                    )}
                    {state === "pending" && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Pending
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Files & Artifacts */}
        {docRows.length > 0 && (
          <div
            className="rounded-xl border overflow-hidden"
            style={{ borderColor: "#E2E8F0" }}
          >
            <div
              className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-slate-600"
              style={{
                background: "#F8FAFC",
                borderBottom: "1px solid #F1F5F9",
              }}
            >
              Files &amp; Artifacts
            </div>
            <div className="divide-y divide-slate-100">
              {docRows.map((r, i) => {
                const s = DOC_STYLES[r.stage]
                return (
                  <div
                    key={r.key || i}
                    className="flex items-center gap-3 px-4 py-2.5"
                  >
                    <span
                      className="w-8 h-8 rounded-lg border flex items-center justify-center text-sm flex-shrink-0"
                      style={{ borderColor: "#E2E8F0", background: "#F8FAFC" }}
                    >
                      {docIcon(r.docType)}
                    </span>
                    <span
                      className="flex-1 min-w-0 text-[12px] font-semibold truncate"
                      style={{ color: "#334155" }}
                    >
                      {r.title}
                    </span>
                    <span
                      className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border"
                      style={{
                        background: s.bg,
                        color: s.color,
                        borderColor: s.border ?? s.bg,
                      }}
                    >
                      {r.stage === "failed" && r.error ? "Error" : s.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            className="rounded-xl px-4 py-3 border text-[12px] font-medium"
            style={{
              background: "#FEF2F2",
              borderColor: "#FECACA",
              color: "#B91C1C",
            }}
          >
            <span className="font-bold mr-1.5">\u26A0\uFE0F</span>
            {error}
          </div>
        )}

        {/* Answer ready */}
        {phase === "completed" && !error && (
          <div
            className="flex items-center justify-between rounded-xl px-4 py-3 border"
            style={{ background: "#F0FDF4", borderColor: "#BBF7D0" }}
          >
            <span className="flex items-center gap-2 text-[12px] font-semibold text-green-700">
              <span className="w-4 h-4 flex items-center justify-center rounded-full bg-green-500 text-white text-[10px] font-bold">
                \u2713
              </span>
              Plan completed — generating final answer
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-green-600">
              Finalizing…
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

export function StaticExecutionSequence({
  query,
  plan,
  procLines,
  stepsDone,
}: {
  query: string
  plan: any
  procLines: string[]
  stepsDone: number
}) {
  const steps = normalizePlan(plan)
  const done = stepsDone ?? 0
  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-md overflow-hidden w-full font-sans">
      <div
        className="flex items-center gap-3 px-4 py-3 border-b"
        style={{
          borderColor: "#E2E8F0",
          background: "linear-gradient(to right, #F8FAFC, #FFFFFF)",
        }}
      >
        <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>
        <div className="leading-tight">
          <div className="text-[13px] font-bold" style={{ color: "#0F172A" }}>
            KNOVIA AI
          </div>
          <div className="text-[10px] font-medium text-slate-400">
            Execution completed
          </div>
        </div>
      </div>
      <div className="p-4 space-y-4">
        {query && (
          <div className="text-[12px]">
            <span className="text-slate-400 font-medium">Query — </span>
            <span className="text-slate-700 font-medium">{query}</span>
          </div>
        )}
        {procLines && procLines.length > 0 && (
          <div
            className="rounded-xl px-3.5 py-3 shadow-inner font-mono text-[11px] space-y-1"
            style={{ background: "#0F172A", border: "1px solid #1E293B" }}
          >
            {procLines.slice(-6).map((l, i) => (
              <div
                key={i}
                className="whitespace-nowrap overflow-hidden text-ellipsis"
                style={{ color: l.startsWith("✓") ? "#4ADE80" : "#7DD3FC" }}
              >
                {l}
              </div>
            ))}
          </div>
        )}
        {steps.length > 0 && (
          <div
            className="rounded-xl border overflow-hidden"
            style={{ borderColor: "#E2E8F0" }}
          >
            <div
              className="flex items-center justify-between px-4 py-2.5"
              style={{
                background: "#F8FAFC",
                borderBottom: "1px solid #F1F5F9",
              }}
            >
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-600">
                Execution Plan
              </span>
              <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-green-50 text-green-700 border border-green-200">
                \u2713 Completed
              </span>
            </div>
            <div className="divide-y divide-slate-100">
              {steps.map((s, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <span
                    className="w-6 h-6 rounded-full border flex items-center justify-center text-[10px] font-bold shrink-0"
                    style={
                      i < done
                        ? {
                            background: "#F0FDF4",
                            borderColor: "#86EFAC",
                            color: "#15803D",
                          }
                        : { borderColor: "#E2E8F0", color: "#94A3B8" }
                    }
                  >
                    {i < done ? "\u2713" : String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    className="flex-1 min-w-0 text-[12px] font-medium leading-snug break-words"
                    style={{ color: i < done ? "#1E293B" : "#94A3B8" }}
                  >
                    {typeof s === "string"
                      ? s
                      : s?.title || s?.summary || `Step ${i + 1}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}
