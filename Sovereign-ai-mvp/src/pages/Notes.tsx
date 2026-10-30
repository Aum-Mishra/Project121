import { useState } from "react";
import { Plus, Folder, Users, User, ShieldAlert, Bold, Italic, List, CheckSquare, Table as TableIcon, Code, MessageSquare, Sparkles, Share2, Save, Lock, PenLine } from "lucide-react";

const initialNotes = [
  { id: 1, title: "CDU-4 Inspection Observations", preview: "Key findings from the Aug 2026 inspection...", type: "Project", cls: "CONFIDENTIAL", updated: "16 Sep 2026", content: "## CDU-4 Inspection Observations\n\n### Summary\nInspection conducted 14 Aug 2026 on CDU-4 unit. Two critical deviations identified from SOP requirements.\n\n### Key Findings\n1. **P-102 Bearing Vibration** — 8.2 mm/s DE bearing (threshold: 7.1 mm/s)\n2. **Mechanical Seal Leakage** — Confirmed at seal housing, maintenance overdue by 8 days\n\n### Recommended Actions\n- [ ] Initiate emergency work order for P-102 isolation\n- [ ] Schedule mechanical seal replacement" },
  { id: 2, title: "P-102 Maintenance Action Items", preview: "1. Isolate pump immediately 2. Schedule seal...", type: "Project", cls: "CONFIDENTIAL", updated: "15 Sep 2026", content: "## P-102 Maintenance Actions\n\n- Isolate pump from main line.\n- Drain residual fluids.\n- Replace mechanical seals.\n- Test vibration after re-installation." },
  { id: 3, title: "Vendor CX-4 Evaluation Notes", preview: "Initial impressions from technical datasheet...", type: "Shared", cls: "INTERNAL", updated: "12 Sep 2026", content: "## CX-4 Evaluation\n\nThe vendor provided the CX-4 datasheet.\nPros: High efficiency.\nCons: Requires proprietary lubrication." },
  { id: 4, title: "Personal — Career Planning 2027", preview: "Targets for next performance cycle...", type: "Personal", cls: "INTERNAL", updated: "10 Sep 2026", content: "## Career Goals 2027\n\n- Complete Advanced Thermodynamics certification\n- Lead 2 turnaround projects\n- Mentor 1 junior engineer" },
  { id: 5, title: "Furnace Tube Delta-T Interpretation", preview: "Skin temp delta-T trending beyond 12°C at...", type: "Project", cls: "CONFIDENTIAL", updated: "16 Sep 2026", content: "## Furnace Tube Delta-T\n\nSkin temperature spread on radiant coils widened to 14°C over two weeks — review firing pattern and coil coking tendency." },
  { id: 6, title: "Reformer Catalyst Reload Decision", preview: "Aging curve suggests reload window at...", type: "Project", cls: "CONFIDENTIAL", updated: "14 Sep 2026", content: "## Catalyst Reload\n\nActivity factor at 0.82 vs 1.0 new. Reload window projected early 2027. Start PO planning." },
  { id: 7, title: "Personal — Vendor Conference Notes", preview: "Prefer Bid-A FAT witness window...", type: "Personal", cls: "INTERNAL", updated: "11 Sep 2026", content: "## Vendor Conference — CX-4\n\n- Bid-A offered FAT witness early Nov.\n- Bid-B pricing 6% lower but longer lead.\n- Recommend technical gate before commercial close." },
  { id: 8, title: "HR — Leave & Certification Log", preview: "NDT Level II renewal aligned to shift plan...", type: "Personal", cls: "INTERNAL", updated: "9 Sep 2026", content: "## HR Log\n\nNDT Level II cert renewal booked. Align with No-Turnaround window." },
  { id: 9, title: "Pipeline Anomaly 0312 — Field Notes", preview: "CUI suspected at EP-32, coating breakdown...", type: "Shared", cls: "RESTRICTED", updated: "12 Sep 2026", content: "## Anomaly 0312\n\nSuspected CUI at EP-32 flange. UT grid scheduled. Interim: 4-month recheck, band 8.0 mm." },
  { id: 10, title: "Turnaround 2027 — Kick-off Prep", preview: "Long-lead items list for gate review...", type: "Project", cls: "INTERNAL", updated: "13 Sep 2026", content: "## T/A Kick-off\n\nPull seal kits + exchanger gaskets by Dec 2026. Manpower ramp to 120% at month 2." },
];

const typeColors: Record<string, { bg: string; color: string; icon: any }> = {
  Project: { bg: "bg-teal-100", color: "text-teal-700", icon: Folder },
  Shared: { bg: "bg-blue-100", color: "text-blue-700", icon: Users },
  Personal: { bg: "bg-purple-100", color: "text-purple-700", icon: User },
  Restricted: { bg: "bg-rose-100", color: "text-rose-700", icon: ShieldAlert },
};

export default function Notes() {
  const [notesList, setNotesList] = useState(initialNotes);
  const [activeNote, setActiveNote] = useState(1);
  const [filter, setFilter] = useState("All");

  const filtered = notesList.filter((n) => filter === "All" || n.type === filter);
  const activeNoteData = notesList.find(n => n.id === activeNote) || notesList[0];

  const handleContentChange = (newContent: string) => {
    setNotesList(prev => prev.map(n => n.id === activeNote ? { ...n, content: newContent, updated: "Just now" } : n));
  };

  return (
    <div className="flex h-full bg-slate-50">
      {/* Sidebar */}
      <div className="w-80 border-r border-slate-200 bg-white flex-shrink-0 flex flex-col">
        <div className="px-5 py-5 border-b border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-lg font-bold tracking-tight text-slate-900">Notes</h1>
            <button className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg font-semibold text-white bg-teal-600 hover:bg-teal-700 shadow-sm transition-all active:scale-95">
              <Plus className="w-3.5 h-3.5" /> New Note
            </button>
          </div>
          <div className="flex gap-1 bg-slate-100/80 p-1 rounded-lg">
            {["All", "Project", "Shared", "Personal"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex-1 text-[11px] py-1.5 rounded-md transition-all font-semibold ${
                  filter === f
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-800 hover:text-slate-700 hover:bg-slate-200/50"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
          {filtered.map((note) => {
            const Icon = typeColors[note.type]?.icon || PenLine;
            return (
              <button
                key={note.id}
                onClick={() => setActiveNote(note.id)}
                className={`w-full text-left px-5 py-4 transition-all relative ${
                  activeNote === note.id ? "bg-teal-50/50" : "hover:bg-slate-50"
                }`}
              >
                {activeNote === note.id && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-teal-500"></div>
                )}
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <span className={`font-semibold text-sm line-clamp-1 ${activeNote === note.id ? "text-teal-900" : "text-slate-900"}`}>
                    {note.title}
                  </span>
                </div>
                <div className="text-xs line-clamp-2 mb-3 text-slate-800 leading-relaxed">
                  {note.preview}
                </div>
                <div className="flex items-center justify-between">
                  <span className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-md font-bold ${typeColors[note.type]?.bg} ${typeColors[note.type]?.color}`}>
                    <Icon className="w-3 h-3" /> {note.type}
                  </span>
                  <span className="text-[11px] font-medium text-slate-900">{note.updated}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 flex flex-col overflow-hidden bg-white">
        {/* Toolbar */}
        <div className="border-b border-slate-200 px-6 py-3 flex flex-wrap items-center gap-4 flex-shrink-0 bg-white">
          <div className="flex items-center gap-1 border-r border-slate-200 pr-4">
            <button className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-800 hover:bg-slate-100 hover:text-slate-900 transition-colors" title="Heading 1"><span className="font-bold text-xs">H1</span></button>
            <button className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-800 hover:bg-slate-100 hover:text-slate-900 transition-colors" title="Heading 2"><span className="font-bold text-xs">H2</span></button>
            <button className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-800 hover:bg-slate-100 hover:text-slate-900 transition-colors" title="Bold"><Bold className="w-4 h-4" /></button>
            <button className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-800 hover:bg-slate-100 hover:text-slate-900 transition-colors" title="Italic"><Italic className="w-4 h-4" /></button>
            <button className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-800 hover:bg-slate-100 hover:text-slate-900 transition-colors" title="List"><List className="w-4 h-4" /></button>
            <button className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-800 hover:bg-slate-100 hover:text-slate-900 transition-colors" title="Checklist"><CheckSquare className="w-4 h-4" /></button>
          </div>
          <div className="flex items-center gap-1 border-r border-slate-200 pr-4">
            <button className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg text-slate-900 hover:bg-slate-100 hover:text-slate-900 transition-colors"><TableIcon className="w-3.5 h-3.5" /> Table</button>
            <button className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg text-slate-900 hover:bg-slate-100 hover:text-slate-900 transition-colors"><Code className="w-3.5 h-3.5" /> Code</button>
            <button className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg text-slate-900 hover:bg-slate-100 hover:text-slate-900 transition-colors"><MessageSquare className="w-3.5 h-3.5" /> Callout</button>
          </div>
          {/* AI actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {["Summarize", "Rewrite", "Extract Actions", "→ Task", "→ Report"].map((btn) => (
              <button key={btn} className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-full font-bold text-teal-700 bg-teal-50 border border-teal-200 hover:bg-teal-100 transition-colors shadow-sm">
                <Sparkles className="w-3 h-3 text-teal-500" /> {btn}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-3">
            <button className="flex items-center gap-2 text-xs px-4 py-2 rounded-lg font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 transition-colors shadow-sm">
              <Share2 className="w-3.5 h-3.5" /> Share
            </button>
            <button className="flex items-center gap-2 text-xs px-4 py-2 rounded-lg font-semibold text-white bg-teal-600 hover:bg-teal-700 transition-all shadow-sm active:scale-95">
              <Save className="w-3.5 h-3.5" /> Save
            </button>
          </div>
        </div>

        {/* Note Content */}
        <div className="flex-1 overflow-y-auto px-8 sm:px-16 py-12">
          <div className="max-w-3xl mx-auto">
            <div className="flex flex-wrap items-center gap-3 mb-8">
              <span className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-md font-bold bg-teal-100 text-teal-800 uppercase tracking-wider">
                <Folder className="w-3 h-3" /> Project
              </span>
              <span className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-md font-bold bg-amber-100 text-amber-800 border border-amber-200 uppercase tracking-wider">
                <Lock className="w-3 h-3" /> {activeNoteData.cls}
              </span>
              <span className="text-xs font-medium text-slate-900">Updated {activeNoteData.updated}</span>
            </div>
            
            <textarea 
              value={activeNoteData.content}
              onChange={(e) => handleContentChange(e.target.value)}
              className="w-full h-[600px] text-slate-800 outline-none resize-none bg-transparent leading-relaxed text-sm md:text-base font-mono"
              placeholder="Start writing your note here..."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
