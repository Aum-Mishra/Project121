import { useState, useEffect } from "react";
import { FileText, FileSpreadsheet, Package, Eye, Download, ChevronRight, AlertTriangle, X, Layers } from "lucide-react";
import { api, Artifact } from "../services/api";

const tabs = ["All", "Documents", "Spreadsheets", "Presentations", "Code", "Reports"];

function tabFor(type: string): string {
  const t = (type || "").toLowerCase();
  if (t.includes("sheet") || t.includes("xl") || t.includes("csv")) return "Spreadsheets";
  if (t.includes("present") || t.includes("ppt")) return "Presentations";
  if (t.includes("report")) return "Reports";
  if (t.includes("code") || t.includes("py") || t.includes("script")) return "Code";
  return "Documents";
}

function iconFor(type: string) {
  const t = (type || "").toLowerCase();
  if (t.includes("sheet") || t.includes("xl") || t.includes("csv")) return FileSpreadsheet;
  if (t.includes("code") || t.includes("py")) return Package;
  return FileText;
}

function extFor(name: string, type: string): string {
  const idx = name.lastIndexOf(".");
  if (idx >= 0) return name.slice(idx + 1).toUpperCase();
  return (type || "DOC").toUpperCase();
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Other";
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const then = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((today.getTime() - then.getTime()) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString([], { weekday: "long" });
  return d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

function PreviewModal({ artifact, onClose }: { artifact: Artifact; onClose: () => void }) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api.artifacts.preview(artifact.artifact_id)
      .then((p) => { if (active) setContent(p.content || p.raw || ""); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : "Preview failed"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [artifact.artifact_id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative w-full max-w-3xl max-h-[85vh] flex flex-col rounded-xl bg-[#0F1726] border border-[#253248] shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex-none flex items-center gap-3 px-5 py-3.5 border-b border-[#253248]">
          <div className="w-8 h-8 rounded-lg bg-[#8B5CF6]/15 flex items-center justify-center flex-none">
            <FileText size={14} className="text-[#8B5CF6]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13.5px] font-semibold text-[#F5F7FA] truncate">{artifact.name}</p>
            <p className="text-[10.5px] text-[#667386]">{artifact.artifact_type} · v{artifact.version}{artifact.parent_artifact_id ? " · versioned" : ""}</p>
          </div>
          <a
            href={api.artifacts.downloadUrl(artifact.artifact_id)}
            className="flex-none h-8 px-3 rounded-md text-[11.5px] font-medium text-[#8B5CF6] border border-[#8B5CF6]/25 hover:bg-[#8B5CF6]/10 transition-all flex items-center gap-1.5"
          >
            <Download size={12} /> Download
          </a>
          <button onClick={onClose} className="w-8 h-8 rounded-md flex items-center justify-center text-[#667386] hover:text-[#F5F7FA] hover:bg-[#141E2F] transition-all">
            <X size={14} />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-5">
          {loading ? (
            <div className="space-y-2 animate-pulse">
              <div className="h-3 w-2/3 bg-[#253248] rounded" />
              <div className="h-3 w-1/2 bg-[#1a2740] rounded" />
              <div className="h-3 w-3/4 bg-[#253248] rounded" />
            </div>
          ) : error ? (
            <div className="rounded-lg bg-[#7F1D1D]/15 border border-[#7F1D1D]/40 px-4 py-3 flex items-start gap-2.5">
              <AlertTriangle size={14} className="text-[#FCA5A5] flex-none mt-0.5" />
              <p className="text-[12.5px] text-[#FCA5A5]">{error}</p>
            </div>
          ) : (
            <pre className="text-[12.5px] text-[#D7DEE8] leading-relaxed whitespace-pre-wrap font-mono">
              {content || "(No previewable content — download to view.)"}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

function DiffModal({ artifactIdA, artifactIdB, onClose }: { artifactIdA: string; artifactIdB: string; onClose: () => void }) {
  const [diffData, setDiffData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api.artifacts.diff(artifactIdA, artifactIdB)
      .then((d) => { if (active) setDiffData(d); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : "Failed to load diff"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [artifactIdA, artifactIdB]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative w-full max-w-4xl max-h-[85vh] flex flex-col rounded-xl bg-[#0F1726] border border-[#253248] shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex-none flex items-center justify-between px-5 py-3.5 border-b border-[#253248]">
          <div className="flex items-center gap-2">
            <Layers size={16} className="text-[#14B8A6]" />
            <h3 className="text-[14px] font-semibold text-[#F5F7FA]">Artifact Version Diff Comparison</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-md flex items-center justify-center text-[#667386] hover:text-[#F5F7FA] hover:bg-[#141E2F] transition-all">
            <X size={14} />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-5">
          {loading ? (
            <div className="space-y-2 animate-pulse">
              <div className="h-3 w-2/3 bg-[#253248] rounded" />
              <div className="h-3 w-1/2 bg-[#1a2740] rounded" />
            </div>
          ) : error ? (
            <div className="rounded-lg bg-[#7F1D1D]/15 border border-[#7F1D1D]/40 px-4 py-3 flex items-start gap-2.5">
              <AlertTriangle size={14} className="text-[#FCA5A5] flex-none mt-0.5" />
              <p className="text-[12.5px] text-[#FCA5A5]">{error}</p>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-4 text-[12px] mb-3 font-mono">
                <span className="text-[#14B8A6]">+{diffData?.lines_added || 0} additions</span>
                <span className="text-[#EF4444]">-{diffData?.lines_removed || 0} deletions</span>
              </div>
              <pre className="text-[12px] font-mono bg-[#080D18] p-4 rounded-lg border border-[#1a2740] text-[#CBD5E1] overflow-x-auto whitespace-pre leading-relaxed">
                {diffData?.unified_diff || "No text differences detected between versions."}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ArtifactsScreen() {
  const [activeTab, setActiveTab] = useState("All");
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [diffPair, setDiffPair] = useState<{ a: string; b: string } | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Artifact | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.artifacts.list();
        if (!active) return;
        setArtifacts(data.artifacts || []);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Failed to load artifacts");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const statusText = (status: string) => (status || "Unknown").charAt(0).toUpperCase() + (status || "unknown").slice(1);
  const statusColor = (status: string) => {
    const s = (status || "").toLowerCase();
    if (s.includes("verified") || s.includes("approv") || s.includes("ready")) return "text-[#22C55E]";
    if (s.includes("pending") || s.includes("await")) return "text-[#F59E0B]";
    return "text-[#9AA6B5]";
  };

  const filtered = activeTab === "All" ? artifacts : artifacts.filter(a => tabFor(a.artifact_type) === activeTab);

  const groups: { label: string; items: Artifact[] }[] = [];
  const seen = new Set<string>();
  for (const a of filtered) {
    const label = dayLabel(a.created_at);
    if (!seen.has(label)) {
      seen.add(label);
      groups.push({ label, items: [] });
    }
    groups[groups.length - 1].items.push(a);
  }

  return (
    <div className="h-full overflow-y-auto bg-[#080D18]">
      <div className="max-w-4xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-[22px] font-semibold text-[#F5F7FA]">Artifacts</h1>
            <p className="text-[12px] text-[#667386] mt-0.5">AI-generated deliverables · ApexPetro Energy Limited</p>
          </div>
        </div>

        <div className="flex items-center gap-1 mb-5 border-b border-[#253248] pb-0">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`h-9 px-3.5 text-[12px] font-medium border-b-2 transition-all -mb-px ${
                activeTab === tab
                  ? "text-[#8B5CF6] border-[#8B5CF6]"
                  : "text-[#667386] border-transparent hover:text-[#9AA6B5]"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {error && (
          <div className="rounded-xl bg-[#7F1D1D]/15 border border-[#7F1D1D]/40 px-4 py-3 flex items-start gap-2.5 mb-4">
            <AlertTriangle size={14} className="text-[#FCA5A5] flex-none mt-0.5" />
            <p className="text-[12.5px] text-[#FCA5A5]">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="space-y-2.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-xl bg-[#0F1726] border border-[#253248] p-5 animate-pulse">
                <div className="h-3 w-1/3 bg-[#253248] rounded mb-2" />
                <div className="h-2.5 w-2/3 bg-[#1a2740] rounded" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Package size={32} className="text-[#253248] mx-auto mb-3" />
            <p className="text-[14px] text-[#667386]">No {activeTab.toLowerCase()} yet.</p>
            <p className="text-[12px] text-[#667386] mt-1">Generated deliverables will appear here.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <div key={group.label}>
                <div className="flex items-center gap-2 mb-2.5">
                  <p className="text-[10px] font-semibold tracking-[0.12em] text-[#3a4a60] uppercase">{group.label}</p>
                  <span className="text-[9px] text-[#667386]">· {group.items.length}</span>
                  <div className="flex-1 h-px bg-[#1a2740]" />
                </div>
                <div className="space-y-2.5">
                  {group.items.map((art) => {
                    const Icon = iconFor(art.artifact_type);
                    return (
                      <div key={art.id} className="rounded-xl bg-[#0F1726] border border-[#253248] hover:border-[#2e3e57] transition-all group">
                        <div className="flex items-center gap-4 px-5 py-4">
                          <div className="w-10 h-10 rounded-xl bg-[#8B5CF6]/15 flex items-center justify-center flex-none">
                            <Icon size={18} className="text-[#8B5CF6]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-[13px] font-semibold text-[#F5F7FA]">{art.name}</p>
                              <span className="text-[9px] font-bold bg-[#253248] text-[#9AA6B5] px-1.5 py-0.5 rounded">{extFor(art.name, art.artifact_type)}</span>
                              {(art.version ?? 1) > 1 && (
                                <span className="flex items-center gap-1 text-[9px] font-semibold text-[#14B8A6] bg-[#14B8A6]/10 px-1.5 py-0.5 rounded">
                                  <Layers size={9} /> v{art.version}
                                </span>
                              )}
                              <span className="text-[9px] font-semibold text-[#F59E0B] bg-[#F59E0B]/8 px-1.5 py-0.5 rounded">{art.classification}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <p className="text-[11px] text-[#667386]">{art.artifact_type}</p>
                              <span className="text-[#253248]">·</span>
                              <p className="text-[11px] text-[#667386]">{new Date(art.created_at).toLocaleString()}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-none">
                            <span className={`text-[11px] font-medium ${statusColor(art.status)}`}>{statusText(art.status)}</span>
                            <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => setPreview(art)}
                                className="h-7 px-2.5 rounded-md text-[11px] text-[#9AA6B5] bg-[#141E2F] border border-[#253248] hover:text-[#F5F7FA] hover:border-[#2e3e57] transition-all flex items-center gap-1.5"
                              >
                                <Eye size={11} /> Preview
                              </button>
                              {art.parent_artifact_id && (
                                <button
                                  onClick={() => setDiffPair({ a: art.parent_artifact_id!, b: art.artifact_id })}
                                  className="h-7 px-2.5 rounded-md text-[11px] text-[#14B8A6] bg-[#141E2F] border border-[#14B8A6]/30 hover:bg-[#14B8A6]/10 transition-all flex items-center gap-1.5"
                                >
                                  <Layers size={11} /> Diff
                                </button>
                              )}
                              <a
                                href={api.artifacts.downloadUrl(art.artifact_id)}
                                className="h-7 px-2.5 rounded-md text-[11px] text-[#8B5CF6] border border-[#8B5CF6]/25 hover:bg-[#8B5CF6]/10 transition-all flex items-center gap-1.5"
                              >
                                <Download size={11} /> Download
                              </a>
                            </div>
                          </div>
                          <ChevronRight size={14} className="text-[#253248] group-hover:text-[#667386] transition-colors flex-none" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {preview && <PreviewModal artifact={preview} onClose={() => setPreview(null)} />}
      {diffPair && <DiffModal artifactIdA={diffPair.a} artifactIdB={diffPair.b} onClose={() => setDiffPair(null)} />}
    </div>
  );
}