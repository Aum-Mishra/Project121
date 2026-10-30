import { useState } from "react";

const collections = [
  { name: "SOPs & Work Instructions", collection: "apexpetro_knowledge", docs: 243, chunks: 12150, dept: "Operations Excellence", cls: "INTERNAL", updated: "16 Sep 2026" },
  { name: "Manuals & Specifications", collection: "apexpetro_knowledge", docs: 189, chunks: 9450, dept: "Engineering", cls: "CONFIDENTIAL", updated: "15 Sep 2026" },
  { name: "HSE & Inspection Procedures", collection: "apexpetro_knowledge", docs: 147, chunks: 7350, dept: "HSE", cls: "CONFIDENTIAL", updated: "14 Sep 2026" },
  { name: "Equipment & Asset Records", collection: "apexpetro_knowledge", docs: 412, chunks: 20600, dept: "Asset Management", cls: "CONFIDENTIAL", updated: "12 Sep 2026" },
  { name: "Vendor & Procurement Data", collection: "apexpetro_knowledge", docs: 98, chunks: 4900, dept: "Procurement", cls: "INTERNAL", updated: "10 Sep 2026" },
  { name: "Historical Maintenance Records", collection: "apexpetro_knowledge", docs: 100, chunks: 5000, dept: "Maintenance", cls: "INTERNAL", updated: "8 Sep 2026" },
  { name: "Policies & Process Safety", collection: "apexpetro_knowledge", docs: 76, chunks: 3800, dept: "Policy", cls: "CONFIDENTIAL", updated: "7 Sep 2026" },
];

const clsColors: Record<string, { bg: string; color: string }> = {
  CONFIDENTIAL: { bg: "#FEF3C7", color: "#92400E" },
  INTERNAL: { bg: "#DBEAFE", color: "#1E40AF" },
};

const docTypes: Record<string, string> = {
  "APEL-SOP-ENG-241": "SOP",
  "APEL-MAN-305": "Manual",
  "APEL-AS-P102-002": "Asset",
  "APEL-INS-P102-2026": "Inspection",
  "APEL-VND-P102-501": "Vendor",
  "APEL-HST-MNT-201": "Historical",
  "APEL-POL-HSE-118": "Policy",
};

const docTypeColor: Record<string, { bg: string; color: string }> = {
  SOP: { bg: "#F5F3FF", color: "#7C3AED" },
  Manual: { bg: "#FFFBEB", color: "#D97706" },
  Asset: { bg: "#EFF6FF", color: "#1D4ED8" },
  Inspection: { bg: "#F0FDFA", color: "#0F766E" },
  Vendor: { bg: "#FDF4FF", color: "#A21CAF" },
  Historical: { bg: "#F1F5F9", color: "#475569" },
  Policy: { bg: "#FEF2F2", color: "#B91C1C" },
};

export default function KnowledgeBase() {
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = () => {
    if (!query.trim()) return;
    setIsSearching(true);
    setSearched(false);
    setTimeout(() => {
      setIsSearching(false);
      setSearched(true);
    }, 1200);
  };

  const searchResults = [
    { doc: "APEL-SOP-ENG-241", name: "P-102 Centrifugal Pump — Operating Manual", section: "Section 4.2: Vibration Thresholds", snippet: "Bearing vibration at DE must not exceed 7.1 mm/s (peak). If exceeded beyond 9.0 mm/s, trip the unit manually...", method: "BM25 + Vector", score: 0.94, ver: "3.2", dept: "Maintenance Eng.", cls: "CONFIDENTIAL" },
    { doc: "APEL-INS-P102-2026", name: "P-102 Inspection Report FY 2026", section: "P-102 Aug Inspection", snippet: "Bearing vibration DE: 8.2 mm/s — recorded 14 Aug 2026. Seal leakage observed at mechanical seal housing...", method: "Vector", score: 0.87, ver: "1.0", dept: "Inspection Eng.", cls: "CONFIDENTIAL" },
    { doc: "APEL-AS-P102-002", name: "P-102 Detailed Equipment Datasheet", section: "Table 3: Operating Limits", snippet: "Design pressure 40 bar, normal 38 bar — max allowable working pressure confirmed by relief scenario RV-102...", method: "BM25", score: 0.82, ver: "4.2", dept: "Process Eng.", cls: "CONFIDENTIAL" },
  ];

  const resultsFor = query.trim() || "P-102 vibration threshold";

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "var(--color-bg-secondary)" }}>
      <div className="max-w-6xl mx-auto px-8 py-8">
        <div className="mb-6">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>Company Knowledge</h1>
            <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: "#F0FDFA", color: "var(--color-teal)", fontSize: 10 }}>APEXPETRO</span>
          </div>
          <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>Search ApexPetro's documents, SOPs, inspection records, and data. All retrieval is local.</p>
          <div className="flex flex-wrap items-center gap-2 mt-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
            <span className="px-2 py-1 rounded font-mono" style={{ background: "var(--color-surface-subtle)", color: "var(--color-text-secondary)", fontSize: 11 }}>Qdrant collection: apexpetro_knowledge</span>
            <span className="px-2 py-1 rounded font-mono" style={{ background: "var(--color-surface-subtle)", color: "var(--color-text-secondary)", fontSize: 11 }}>chat docs: apexpetro_chat_documents</span>
            <span className="px-2 py-1 rounded font-medium" style={{ background: "#F0FDFA", color: "var(--color-teal)", fontSize: 11 }}>1,265 sources · no internet egress</span>
          </div>
        </div>

        {/* Search */}
        <div className="bg-white rounded border p-5 mb-6" style={{ borderColor: "var(--color-border)" }}>
          <div className="font-semibold text-sm mb-3" style={{ color: "var(--color-text-primary)" }}>Hybrid Knowledge Search</div>
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search ApexPetro documents, SOPs, and inspection records..."
              className="flex-1 px-4 py-2.5 text-sm rounded border outline-none"
              style={{ borderColor: "var(--color-border)", fontSize: 13 }}
            />
            <button
              onClick={handleSearch}
              disabled={isSearching}
              className="px-5 py-2.5 rounded text-sm font-medium text-white flex items-center gap-2 disabled:opacity-70 transition-colors"
              style={{ background: "var(--color-teal)" }}
            >
              {isSearching ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : "Search"}
            </button>
          </div>
          <div className="flex items-center gap-4 mt-3">
            <div className="flex items-center gap-2 text-xs flex-wrap" style={{ color: "var(--color-text-muted)" }}>
              <span className="px-2 py-0.5 rounded" style={{ background: "#F0FDFA", color: "var(--color-teal)" }}>BM25 Keyword</span>
              +
              <span className="px-2 py-0.5 rounded" style={{ background: "#EFF6FF", color: "var(--color-blue)" }}>Vector Semantic</span>
              +
              <span className="px-2 py-0.5 rounded" style={{ background: "#F5F3FF", color: "#7C3AED" }}>PostgreSQL Structured</span>
              →
              <span className="px-2 py-0.5 rounded" style={{ background: "var(--color-surface-subtle)", color: "var(--color-text-secondary)" }}>Reranker</span>
              →
              <span className="px-2 py-0.5 rounded" style={{ background: "var(--color-surface-subtle)", color: "var(--color-text-secondary)" }}>Evidence</span>
              →
              <span className="px-2 py-0.5 rounded" style={{ background: "var(--color-surface-subtle)", color: "var(--color-text-secondary)" }}>Answer</span>
            </div>
          </div>
        </div>

        {/* Search Results */}
        {searched && (
          <div className="mb-6">
            <div className="font-semibold text-sm mb-3" style={{ color: "var(--color-text-primary)" }}>
              Retrieval Results — 3 sources
              <span className="ml-2 text-xs font-normal" style={{ color: "var(--color-text-muted)" }}>Query: "{resultsFor}"</span>
            </div>
            <div className="space-y-3">
              {searchResults.map((r, i) => {
                const dtype = docTypes[r.doc] || "Document";
                const dc = docTypeColor[dtype] || { bg: "#F1F5F9", color: "#475569" };
                return (
                  <div key={i} className="bg-white rounded border px-5 py-4" style={{ borderColor: "var(--color-border)" }}>
                    <div className="flex items-start gap-3">
                      <span className="text-xs font-bold mt-0.5" style={{ color: "var(--color-teal)", minWidth: 20 }}>#{i + 1}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>{r.name}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: dc.bg, color: dc.color, fontSize: 10 }}>{dtype}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: "#F0FDFA", color: "var(--color-teal)", fontSize: 10 }}>{r.method}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: clsColors[r.cls].bg, color: clsColors[r.cls].color, fontSize: 10 }}>{r.cls}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>{r.doc}</span>
                          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>· {r.section}</span>
                          {r.ver !== "—" && <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>· v{r.ver}</span>}
                          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>· {r.dept}</span>
                          <span className="text-xs font-medium" style={{ color: "var(--color-teal)" }}>Score: {r.score}</span>
                        </div>
                        <p className="text-sm mt-2" style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>{r.snippet}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Collections */}
        <div>
          <div className="font-semibold text-sm mb-3" style={{ color: "var(--color-text-primary)" }}>Knowledge Collections</div>
          <div className="bg-white rounded border overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
            <div className="px-5 py-2.5 border-b flex items-center gap-2" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-subtle)" }}>
              <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: "#F0FDFA", color: "var(--color-teal)", fontSize: 11 }}>apexpetro_knowledge</span>
              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>single Qdrant collection · company-scoped on company_id = "apexpetro"</span>
            </div>
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                  {["Collection", "Department", "Documents", "Knowledge Chunks", "Updated", "Classification"].map((h) => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold" style={{ color: "var(--color-text-muted)", background: "var(--color-surface-subtle)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {collections.map((col, i) => (
                  <tr key={i} className="hover:bg-slate-50 cursor-pointer" style={{ borderBottom: i < collections.length - 1 ? "1px solid var(--color-border)" : "none" }}>
                    <td className="px-5 py-3.5 font-medium text-sm" style={{ color: "var(--color-text-primary)", fontSize: 13 }}>{col.name}</td>
                    <td className="px-5 py-3.5 text-xs" style={{ color: "var(--color-text-secondary)" }}>{col.dept}</td>
                    <td className="px-5 py-3.5 text-sm font-medium" style={{ color: "var(--color-teal)" }}>{col.docs}</td>
                    <td className="px-5 py-3.5 text-sm font-medium" style={{ color: "var(--color-blue)" }}>{col.chunks.toLocaleString()}</td>
                    <td className="px-5 py-3.5 text-xs" style={{ color: "var(--color-text-muted)" }}>{col.updated}</td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: clsColors[col.cls].bg, color: clsColors[col.cls].color, fontSize: 10 }}>{col.cls}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs mt-3" style={{ color: "var(--color-text-muted)" }}>
            Document IDs follow the APEL-* convention (e.g. APEL-SOP-ENG-241, APEL-INS-P102-2026, APEL-AS-P102-002). Chat-uploaded files are isolated in a separate collection (<strong>apexpetro_chat_documents</strong>) scoped by user + conversation.
          </p>
        </div>
      </div>
    </div>
  );
}