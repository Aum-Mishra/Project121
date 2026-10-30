import { useState } from "react"
import { useNav } from "../context/NavContext"
import { isHRDoc, isEngineeringPage, hasAccess } from "../data/roles"

const stages = [
  "Upload",
  "Security Scan",
  "Classification",
  "OCR / Parsing",
  "Metadata",
  "Chunking",
  "Embedding",
  "Index",
  "Ready",
]

const documents = [
  {
    name: "CDU-4 Inspection Report Aug 2026",
    type: "PDF",
    size: "4.2 MB",
    dept: "Inspection Eng.",
    cls: "CONFIDENTIAL",
    status: "Ready",
    version: "1.0",
    date: "16 Sep 2026",
    pages: 47,
  },
  {
    name: "Inspection SOP – Pump P-102",
    type: "PDF",
    size: "1.8 MB",
    dept: "Maintenance Eng.",
    cls: "CONFIDENTIAL",
    status: "Ready",
    version: "3.2",
    date: "12 Aug 2026",
    pages: 28,
  },
  {
    name: "MRPL Equipment Vibration Limits",
    type: "PDF",
    size: "0.9 MB",
    dept: "Inspection Eng.",
    cls: "CONFIDENTIAL",
    status: "Ready",
    version: "2.1",
    date: "15 Mar 2026",
    pages: 12,
  },
  {
    name: "Vendor Evaluation Report CX-4",
    type: "DOCX",
    size: "2.1 MB",
    dept: "Procurement",
    cls: "INTERNAL",
    status: "Ready",
    version: "1.3",
    date: "10 Sep 2026",
    pages: 34,
  },
  {
    name: "Pipeline Anomaly Report 2026-08",
    type: "PDF",
    size: "6.7 MB",
    dept: "HSE",
    cls: "RESTRICTED",
    status: "Processing",
    version: "1.0",
    date: "16 Sep 2026",
    pages: 89,
  },
  {
    name: "CDU-4 Maintenance Log 2026",
    type: "XLSX",
    size: "0.4 MB",
    dept: "Operations",
    cls: "INTERNAL",
    status: "Ready",
    version: "—",
    date: "15 Sep 2026",
    pages: null,
  },
  {
    name: "P-102 Inspection Measurements",
    type: "XLSX",
    size: "0.2 MB",
    dept: "Inspection Eng.",
    cls: "CONFIDENTIAL",
    status: "Ready",
    version: "1.0",
    date: "16 Sep 2026",
    pages: null,
  },
  {
    name: "P-102 Vibration Trend Jan–Aug 2026",
    type: "CSV",
    size: "0.01 MB",
    dept: "Inspection Eng.",
    cls: "CONFIDENTIAL",
    status: "Ready",
    version: "—",
    date: "16 Sep 2026",
    pages: null,
  },
  {
    name: "P-102 Engineering Action Memo",
    type: "DOCX",
    size: "0.6 MB",
    dept: "Maintenance Eng.",
    cls: "CONFIDENTIAL",
    status: "Ready",
    version: "0.1",
    date: "16 Sep 2026",
    pages: 3,
  },
  {
    name: "P-102 Maintenance Work Order Summary",
    type: "PDF",
    size: "1.1 MB",
    dept: "Maintenance Eng.",
    cls: "CONFIDENTIAL",
    status: "Ready",
    version: "A",
    date: "16 Sep 2026",
    pages: 6,
  },
]

const statusColors: Record<string, { bg: string color: string }> = {
  Ready: { bg: "#DCFCE7", color: "#15803D" },
  Processing: { bg: "#DBEAFE", color: "#1D4ED8" },
  Failed: { bg: "#FEE2E2", color: "#991B1B" },
}

const clsColors: Record<string, { bg: string color: string }> = {
  CONFIDENTIAL: { bg: "#FEF3C7", color: "#92400E" },
  INTERNAL: { bg: "#DBEAFE", color: "#1E40AF" },
  RESTRICTED: { bg: "#FEE2E2", color: "#991B1B" },
}

export default function Documents() {
  const { role } = useNav()
  const canUpload = role === "admin"
  const [uploading, setUploading] = useState(false)
  const [uploadStage, setUploadStage] = useState(0)
  const [selectedDoc, setSelectedDoc] = useState<number | null>(null)
  const [viewingDoc, setViewingDoc] = useState<typeof documents[0] | null>(null)

  const simulateUpload = () => {
    setUploading(true)
    setUploadStage(0)
    const interval = setInterval(() => {
      setUploadStage((s) => {
        if (s >= stages.length - 1) {
          clearInterval(interval)
          setTimeout(() => setUploading(false), 1000)
          return s
        }
        return s + 1
      })
    }, 600)
  }

  const handleDownload = (doc: typeof documents[0]) => {
    let content = ""
    let mime = ""
    let ext = ""
    let blob: Blob

    if (doc.type === "XLSX" || doc.type === "CSV") {
      content =
        "Date,Vibration_Level,Status\\n2026-09-15,6.5,Normal\\n2026-09-16,8.2,Critical\\n"
      mime = "text/csv"
      ext = "csv"
      blob = new Blob([content], { type: mime })
    } else if (doc.type === "PDF") {
      // A minimal valid PDF file base64 string
      const pdfBase64 =
        "JVBERi0xLjQKJcOkw7zDtsOfCjIgMCBvYmoKPDwvTGVuZ3RoIDMgMCBSL0ZpbHRlci9GbGF0ZURlY29kZT4+CnN0cmVhbQp4nDP093QwNE1MTC4JLElNS8xL1QdyIHRuYm6qQW5iXkoqiB2XWlKUmZtYoeCsoKMAV24E1AEAE78QhQplbmRzdHJlYW0KZW5kb2JqCjMgMCBvYmoKNTkKZW5kb2JqCjQgMCBvYmoKPDwvVHlwZS9QYWdlL01lZGlhQm94WzAgMCA1OTUuMjggODQxLjg5XS9SZXNvdXJjZXM8PC9Gb250PDwvRjEgNSAwIFI+Pj4+L0NvbnRlbnRzIDIgMCBSL1BhcmVudCA2IDAgUj4+CmVuZG9iago1IDAgb2JqCjw8L1R5cGUvRm9udC9TdWJ0eXBlL1R5cGUxL0Jhc2VGb250L0hlbHZldGljYT4+CmVuZG9iago2IDAgb2JqCjw8L1R5cGUvUGFnZXMvQ291bnQgMS9LaWRzWzQgMCBSXT4+CmVuZG9iago3IDAgb2JqCjw8L1R5cGUvQ2F0YWxvZy9QYWdlcyA2IDAgUj4+CmVuZG9iagoxIDAgb2JqCjw8L1Byb2R1Y2VyKGR1bW15KS9DcmVhdGlvbkRhdGUoRDoyMDI2MDkxNjE3MDkwMCk+PgplbmRvYmoKeHJlZgowIDgKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwNDA0IDAwMDAwIG4gCjAwMDAwMDAwMTkgMDAwMDAgbiAKMDAwMDAwMDExNyAwMDAwMCBuIAowMDAwMDAwMTM2IDAwMDAwIG4gCjAwMDAwMDAyNjAgMDAwMDAgbiAKMDAwMDAwMDM0OCAwMDAwMCBuIAowMDAwMDAwNDA0IDAwMDAwIG4gCnRyYWlsZXIKPDwvU2l6ZSA4L1Jvb3QgNyAwIFIvSW5mbyAxIDAgUj4+CnN0YXJ0eHJlZgo0OTQKJSVFT0YK"
      const byteCharacters = atob(pdfBase64)
      const byteNumbers = new Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
      }
      const byteArray = new Uint8Array(byteNumbers)
      blob = new Blob([byteArray], { type: "application/pdf" })
      ext = "pdf"
    } else {
      content =
        "Mock document content for: " +
        doc.name +
        "\\n\\nClassification: " +
        doc.cls +
        "\\nVersion: " +
        doc.version +
        "\\nDate: " +
        doc.date
      mime = "text/plain"
      ext = doc.type.toLowerCase()
      blob = new Blob([content], { type: mime })
    }

    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${doc.name.replace(/\\s+/g, "_")}.${ext}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div
      className="flex-1 overflow-y-auto"
      style={{ background: "var(--color-bg-secondary)" }}
    >
      <div className="max-w-6xl mx-auto px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1
              className="text-xl font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              Documents
            </h1>
            <p
              className="text-sm mt-0.5"
              style={{ color: "var(--color-text-muted)" }}
            >
              Document intelligence — upload, process, and query MRPL documents
            </p>
          </div>
          <button
            onClick={simulateUpload}
            disabled={!canUpload}
            title={
              canUpload ? undefined : "Upload is restricted to administrators"
            }
            className="text-sm px-4 py-2 rounded font-medium text-white disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "var(--color-teal)" }}
          >
            ↑ Upload Document
          </button>
        </div>

        {/* Upload Progress */}
        {uploading && (
          <div
            className="mb-6 bg-white rounded border p-5"
            style={{ borderColor: "var(--color-teal)", borderWidth: 1.5 }}
          >
            <div className="flex items-center justify-between mb-4">
              <div
                className="font-medium text-sm"
                style={{ color: "var(--color-text-primary)" }}
              >
                Processing: CDU-4 Inspection Report.pdf
              </div>
              <span
                className="text-xs px-2 py-0.5 rounded font-medium"
                style={{ background: "#DBEAFE", color: "#1D4ED8" }}
              >
                Ingesting...
              </span>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              {stages.map((stage, i) => (
                <div
                  key={stage}
                  className="flex items-center gap-2 flex-shrink-0"
                >
                  <div className="flex flex-col items-center gap-1">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border-2"
                      style={{
                        borderColor:
                          i <= uploadStage
                            ? "var(--color-teal)"
                            : "var(--color-border)",
                        background:
                          i < uploadStage
                            ? "var(--color-teal)"
                            : i === uploadStage
                              ? "#F0FDFA"
                              : "white",
                        color:
                          i < uploadStage
                            ? "white"
                            : i === uploadStage
                              ? "var(--color-teal)"
                              : "var(--color-text-muted)",
                      }}
                    >
                      {i < uploadStage ? "✓" : i + 1}
                    </div>
                    <span
                      className="text-xs text-center"
                      style={{
                        color:
                          i <= uploadStage
                            ? "var(--color-teal)"
                            : "var(--color-text-muted)",
                        fontSize: 10,
                        width: 60,
                      }}
                    >
                      {stage}
                    </span>
                  </div>
                  {i < stages.length - 1 && (
                    <div
                      className="h-0.5 w-6 mb-4 flex-shrink-0"
                      style={{
                        background:
                          i < uploadStage
                            ? "var(--color-teal)"
                            : "var(--color-border)",
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Conflict Detection Alert */}
        <div
          className="mb-6 bg-white rounded border p-4"
          style={{ borderColor: "#D97706", borderWidth: 1.5 }}
        >
          <div className="flex items-start gap-3">
            <span className="text-base mt-0.5">⚠️</span>
            <div className="flex-1">
              <div
                className="font-semibold text-sm"
                style={{ color: "var(--color-text-primary)" }}
              >
                Source Conflict Detected
              </div>
              <div
                className="text-xs mt-1"
                style={{ color: "var(--color-text-secondary)" }}
              >
                3 documents contain conflicting operating limits for Pump P-102
                seal pressure.
              </div>
              <div className="flex items-center gap-3 mt-3">
                {[
                  {
                    doc: "SOP P-102",
                    ver: "3.2",
                    status: "Approved",
                    date: "2026",
                  },
                  {
                    doc: "SOP P-102",
                    ver: "2.8",
                    status: "Superseded",
                    date: "2025",
                  },
                  {
                    doc: "Rev Memo",
                    ver: "3.1",
                    status: "Draft",
                    date: "2026",
                  },
                ].map((d) => (
                  <div
                    key={d.ver}
                    className="flex-1 px-3 py-2 rounded border text-xs"
                    style={{
                      borderColor: "var(--color-border)",
                      background: "var(--color-surface-subtle)",
                    }}
                  >
                    <div
                      className="font-medium"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {d.doc} v{d.ver}
                    </div>
                    <div style={{ color: "var(--color-text-muted)" }}>
                      {d.status} · {d.date}
                    </div>
                  </div>
                ))}
                <div className="flex flex-col gap-1">
                  <button
                    className="text-xs px-2 py-1 rounded font-medium"
                    style={{ background: "var(--color-teal)", color: "white" }}
                  >
                    Use v3.2
                  </button>
                  <button
                    className="text-xs px-2 py-1 rounded border"
                    style={{
                      borderColor: "var(--color-border)",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    Use All
                  </button>
                  <button
                    className="text-xs px-2 py-1 rounded border"
                    style={{
                      borderColor: "var(--color-border)",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    Ask Me
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Documents Table */}
        <div
          className="bg-white rounded border overflow-hidden"
          style={{ borderColor: "var(--color-border)" }}
        >
          <div
            className="flex items-center gap-3 px-5 py-3 border-b"
            style={{ borderColor: "var(--color-border)" }}
          >
            <input
              type="text"
              placeholder="Search documents..."
              className="flex-1 max-w-xs px-3 py-1.5 text-sm rounded border outline-none"
              style={{ borderColor: "var(--color-border)", fontSize: 13 }}
            />
            <select
              className="text-xs border rounded px-2 py-1.5 outline-none"
              style={{
                borderColor: "var(--color-border)",
                color: "var(--color-text-secondary)",
              }}
            >
              <option>All Types</option>
              <option>PDF</option>
              <option>DOCX</option>
              <option>XLSX</option>
            </select>
            <select
              className="text-xs border rounded px-2 py-1.5 outline-none"
              style={{
                borderColor: "var(--color-border)",
                color: "var(--color-text-secondary)",
              }}
            >
              <option>All Status</option>
              <option>Ready</option>
              <option>Processing</option>
            </select>
          </div>
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                {[
                  "Document",
                  "Type",
                  "Department",
                  "Version",
                  "Date",
                  "Status",
                  "Classification",
                  "",
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left px-5 py-3 text-xs font-semibold"
                    style={{
                      color: "var(--color-text-muted)",
                      background: "var(--color-surface-subtle)",
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {documents.map((doc, i) => (
                <tr
                  key={i}
                  className="hover:bg-slate-50 cursor-pointer transition-colors"
                  style={{
                    borderBottom:
                      i < documents.length - 1
                        ? "1px solid var(--color-border)"
                        : "none",
                  }}
                  onClick={() => setSelectedDoc(i === selectedDoc ? null : i)}
                >
                  <td className="px-5 py-3.5">
                    <div
                      className="font-medium text-sm"
                      style={{
                        color: "var(--color-text-primary)",
                        fontSize: 13,
                      }}
                    >
                      {doc.name}
                    </div>
                    <div
                      className="text-xs"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {doc.size}
                      {doc.pages ? ` · ${doc.pages} pages` : ""}
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className="text-xs font-mono px-1.5 py-0.5 rounded"
                      style={{
                        background: "var(--color-surface-subtle)",
                        color: "var(--color-text-secondary)",
                        fontSize: 11,
                      }}
                    >
                      {doc.type}
                    </span>
                  </td>
                  <td
                    className="px-5 py-3.5 text-xs"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    {doc.dept}
                  </td>
                  <td
                    className="px-5 py-3.5 text-xs"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    v{doc.version}
                  </td>
                  <td
                    className="px-5 py-3.5 text-xs"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {doc.date}
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className="text-xs px-2 py-0.5 rounded font-medium"
                      style={{
                        background: statusColors[doc.status]?.bg,
                        color: statusColors[doc.status]?.color,
                        fontSize: 11,
                      }}
                    >
                      {doc.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className="text-xs px-1.5 py-0.5 rounded font-medium"
                      style={{
                        background: clsColors[doc.cls]?.bg,
                        color: clsColors[doc.cls]?.color,
                        fontSize: 10,
                      }}
                    >
                      {doc.cls}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setViewingDoc(doc)
                        }}
                        className="text-xs px-2 py-1 rounded border hover:bg-slate-100 transition-colors"
                        style={{
                          borderColor: "var(--color-border)",
                          color: "var(--color-text-muted)",
                          fontSize: 11,
                        }}
                      >
                        View
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDownload(doc)
                        }}
                        className="text-xs px-2 py-1 rounded border hover:bg-slate-100 transition-colors"
                        style={{
                          borderColor: "var(--color-border)",
                          color: "var(--color-text-muted)",
                          fontSize: 11,
                        }}
                      >
                        Download
                      </button>
                      <button
                        className="text-xs px-2 py-1 rounded border hover:bg-slate-100 transition-colors"
                        style={{
                          borderColor: "var(--color-border)",
                          color: "var(--color-text-muted)",
                          fontSize: 11,
                        }}
                      >
                        Query
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {viewingDoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-8"
          style={{
            background: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
          }}
        >
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-full flex flex-col overflow-hidden">
            <div
              className="flex items-center justify-between px-6 py-4 border-b"
              style={{
                borderColor: "var(--color-border)",
                background: "var(--color-surface-subtle)",
              }}
            >
              <div>
                <h2
                  className="text-lg font-semibold"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {viewingDoc.name}
                </h2>
                <div
                  className="text-xs mt-1 space-x-2"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  <span className="font-mono px-1.5 py-0.5 rounded bg-white border">
                    {viewingDoc.type}
                  </span>
                  <span>Version {viewingDoc.version}</span>
                  <span>{viewingDoc.date}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleDownload(viewingDoc)}
                  className="text-sm px-4 py-2 rounded font-medium border hover:bg-slate-50"
                  style={{
                    borderColor: "var(--color-border)",
                    color: "var(--color-text-primary)",
                  }}
                >
                  Download
                </button>
                <button
                  onClick={() => setViewingDoc(null)}
                  className="text-sm px-4 py-2 rounded font-medium text-white"
                  style={{ background: "var(--color-teal)" }}
                >
                  Close
                </button>
              </div>
            </div>
            <div
              className="flex-1 overflow-auto p-8"
              style={{ background: "#FAFAFA" }}
            >
              <div
                className="bg-white mx-auto shadow-sm border p-12 min-h-full max-w-2xl text-sm"
                style={{
                  borderColor: "var(--color-border)",
                  color: "var(--color-text-primary)",
                }}
              >
                {viewingDoc.type === "XLSX" || viewingDoc.type === "CSV" ? (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b bg-slate-50">
                        <th className="p-2">Date</th>
                        <th className="p-2">Vibration_Level</th>
                        <th className="p-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b">
                        <td className="p-2">2026-09-15</td>
                        <td className="p-2">6.5</td>
                        <td className="p-2">Normal</td>
                      </tr>
                      <tr className="border-b">
                        <td className="p-2">2026-09-16</td>
                        <td className="p-2">8.2</td>
                        <td className="p-2 text-red-600 font-medium">
                          Critical
                        </td>
                      </tr>
                    </tbody>
                  </table>
                ) : (
                  <div className="space-y-4">
                    <h1 className="text-2xl font-bold mb-6 text-center">
                      {viewingDoc.name}
                    </h1>
                    <p className="font-semibold text-lg border-b pb-2">
                      1. Executive Summary
                    </p>
                    <p>
                      This is a mock representation of the {viewingDoc.type}{" "}
                      document content. The document contains technical
                      specifications and inspection metrics recorded on{" "}
                      {viewingDoc.date}.
                    </p>
                    <p className="font-semibold text-lg border-b pb-2 mt-6">
                      2. Classification Details
                    </p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>Department: {viewingDoc.dept}</li>
                      <li>Security Level: {viewingDoc.cls}</li>
                      <li>Pages: {viewingDoc.pages || "N/A"}</li>
                    </ul>
                    <p className="mt-8 text-xs text-gray-700 text-center uppercase">
                      -- End of Document --
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
