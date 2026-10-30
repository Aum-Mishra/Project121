import { useState } from "react";
import { Search, Bell, ChevronRight, X, Shield, Check } from "lucide-react";

type View = "chat"|"projects"|"files"|"knowledge"|"tasks"|"artifacts"|"approvals"|"models"|"security"|"audit"|"system-health";

interface TopBarProps {
  view: View;
  onCommandPalette: () => void;
  onSecurityClick?: () => void;
}

const CRUMBS: Record<string, string[]> = {
  chat:            ["Workbench", "P-102 Equipment Integrity Review"],
  projects:        ["Projects"],
  files:           ["Files"],
  knowledge:       ["Knowledge"],
  tasks:           ["Tasks"],
  artifacts:       ["Artifacts"],
  approvals:       ["Approvals"],
  models:          ["Models"],
  security:        ["Governance", "Security & Observability"],
  audit:           ["Governance", "Audit Trail"],
  "system-health": ["Operations", "System Health"],
  profile:         ["Profile"],
  "error-state":   ["Error"],
};

const NOTIFS = [
  { text: "Approval required for P-102 Integrity Review", time: "2m", dot: "bg-[#F59E0B]" },
  { text: "Document indexing completed", time: "8m", dot: "bg-[#22C55E]" },
  { text: "Risk assessment verified", time: "15m", dot: "bg-[#22C55E]" },
  { text: "Artifact generated: Approval_Note_P-102", time: "18m", dot: "bg-[#3B82F6]" },
];

function SecurityPopover({ onClose, onViewDetails }: { onClose: () => void; onViewDetails: () => void }) {
  return (
    <div className="absolute right-0 top-[calc(100%+8px)] w-64 bg-[#141E2F] border border-[#253248] rounded-[8px] shadow-2xl shadow-black/50 z-50 animate-fade-up overflow-hidden">
      <div className="px-4 pt-3.5 pb-2">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Shield size={13} className="text-[#14B8A6]"/>
            <span className="text-[12px] font-semibold text-[#F5F7FA]">Secure Environment</span>
          </div>
          <button onClick={onClose} className="text-[#667386] hover:text-[#F5F7FA] transition-colors"><X size={13}/></button>
        </div>
        {["Local inference active","Company-isolated data","External APIs blocked","Sandbox isolated"].map(item => (
          <div key={item} className="flex items-center gap-2 py-1">
            <Check size={11} className="text-[#14B8A6] flex-none"/>
            <p className="text-[11.5px] text-[#9AA6B5]">{item}</p>
          </div>
        ))}
      </div>
      <div className="border-t border-[#253248] px-4 py-2.5">
        <button onClick={() => { onViewDetails(); onClose(); }} className="text-[11px] text-[#8B5CF6] hover:text-[#A78BFA] flex items-center gap-1 transition-colors">
          View security details <ChevronRight size={10}/>
        </button>
      </div>
    </div>
  );
}

export default function TopBar({ view, onCommandPalette, onSecurityClick }: TopBarProps) {
  const [secOpen, setSecOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const crumbs = CRUMBS[view] || [view ? String(view) : "Workbench"];

  return (
    <header className="h-12 flex items-center border-b border-[#1a2740] bg-[#0F1726] px-4 gap-3">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0 text-[12.5px]">
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight size={11} className="text-[#3a4a60]"/>}
            <span className={i === crumbs.length - 1 ? "text-[#F5F7FA] font-medium truncate" : "text-[#667386]"}>{c}</span>
          </span>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {/* Search */}
        <button
          onClick={onCommandPalette}
          className="flex items-center gap-2 h-7 px-2.5 rounded-[6px] bg-[#141E2F] border border-[#253248] text-[#667386] hover:text-[#9AA6B5] hover:border-[#2e3e57] transition-all text-[11px]"
        >
          <Search size={11}/>
          <span className="text-[10px] hidden sm:block text-[#3a4a60]">Search</span>
          <kbd className="hidden sm:block text-[9px] bg-[#253248] rounded px-1 font-mono text-[#3a4a60]">⌘K</kbd>
        </button>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => { setNotifOpen(!notifOpen); setSecOpen(false); }}
            className="relative w-7 h-7 rounded-[6px] flex items-center justify-center text-[#667386] hover:text-[#9AA6B5] hover:bg-[#141E2F] transition-all"
          >
            <Bell size={13}/>
            <span className="absolute top-[5px] right-[5px] w-[5px] h-[5px] rounded-full bg-[#F59E0B]"/>
          </button>
          {notifOpen && (
            <div className="absolute right-0 top-[calc(100%+8px)] w-76 bg-[#141E2F] border border-[#253248] rounded-[8px] shadow-2xl shadow-black/50 z-50 animate-fade-up overflow-hidden" style={{width:"300px"}}>
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#253248]">
                <p className="text-[11.5px] font-semibold text-[#F5F7FA]">Notifications</p>
                <button onClick={() => setNotifOpen(false)}><X size={12} className="text-[#667386] hover:text-[#F5F7FA]"/></button>
              </div>
              {NOTIFS.map((n, i) => (
                <div key={i} className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-[#182337] cursor-pointer border-b border-[#1a2740] last:border-0 transition-colors">
                  <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-none ${n.dot}`}/>
                  <div>
                    <p className="text-[11.5px] text-[#F5F7FA] leading-snug">{n.text}</p>
                    <p className="text-[10px] text-[#667386] mt-0.5">{n.time} ago</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Security badge */}
        <div className="relative">
          <button
            onClick={() => { setSecOpen(!secOpen); setNotifOpen(false); }}
            className="flex items-center gap-1.5 h-7 px-2.5 rounded-[6px] bg-[#0A1A18] border border-[#14B8A6]/20 text-[#14B8A6] hover:bg-[#14B8A6]/10 hover:border-[#14B8A6]/35 transition-all"
          >
            <span className="w-[5px] h-[5px] rounded-full bg-[#14B8A6] animate-pulse-dot"/>
            <span className="text-[9.5px] font-semibold tracking-[0.1em]">LOCAL ONLY</span>
          </button>
          {secOpen && (
            <SecurityPopover
              onClose={() => setSecOpen(false)}
              onViewDetails={() => { onSecurityClick?.(); }}
            />
          )}
        </div>

        {/* Avatar */}
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#6D28D9] flex items-center justify-center text-white text-[9.5px] font-semibold cursor-pointer hover:ring-2 hover:ring-[#8B5CF6]/30 transition-all ml-1">
          AM
        </div>
      </div>
    </header>
  );
}
