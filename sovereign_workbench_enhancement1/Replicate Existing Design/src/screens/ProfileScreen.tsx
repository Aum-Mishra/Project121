import { useEffect, useState } from "react";
import { ChevronLeft, ShieldCheck, Key, Bell, Cpu, HardDrive, Clock, LogOut, ChevronRight } from "lucide-react";
import { api } from "../services/api";

interface ProfileScreenProps { onBack: () => void; }

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("");
}

export default function ProfileScreen({ onBack }: ProfileScreenProps) {
  const [me, setMe] = useState<{ user_id: number; full_name: string; email: string; role: string; company_id: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await api.auth.me();
        if (active) setMe(data as any);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Failed to load profile");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const role = (me?.role || "").toLowerCase();
  const isReviewer = role.includes("engineer") || role.includes("manager") || role.includes("reviewer");
  const canSubmitApprovals = isReviewer;
  const canManageKB = role.includes("admin");
  const canConfigureModels = role.includes("admin");

  const fullName = me?.full_name || "Loading…";
  const email = me?.email || "";

  if (loading) {
    return (
      <div className="h-full bg-[#080D18] flex items-center justify-center">
        <p className="text-[12px] text-[#667386]">Loading profile…</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-[#080D18]">
      <div className="max-w-2xl mx-auto px-6 py-6">
        <button onClick={onBack} className="flex items-center gap-1.5 text-[11px] text-[#667386] hover:text-[#9AA6B5] transition-colors mb-6">
          <ChevronLeft size={13}/> Back
        </button>

        {error && (
          <div className="rounded-[8px] bg-[#7F1D1D]/15 border border-[#7F1D1D]/40 px-4 py-3 text-[12px] text-[#FCA5A5] mb-4">
            {error}
          </div>
        )}

        <div className="rounded-[8px] bg-[#0F1726] border border-[#253248] px-6 py-6 mb-4 flex items-center gap-5">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#6D28D9] flex items-center justify-center text-white text-[22px] font-semibold shadow-xl shadow-[#8B5CF6]/20 flex-none">
            {initials(fullName)}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-[20px] font-semibold text-[#F5F7FA]">{fullName}</h1>
            <p className="text-[13px] text-[#9AA6B5] mt-0.5">{me?.role || ""}</p>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-[10px] font-semibold text-[#14B8A6] bg-[#14B8A6]/10 border border-[#14B8A6]/20 px-2 py-0.5 rounded-[4px]">ACTIVE</span>
              <span className="text-[10.5px] text-[#667386]">{email}</span>
            </div>
          </div>
        </div>

        <div className="rounded-[8px] bg-[#0F1726] border border-[#253248] px-5 py-4 mb-4">
          <p className="text-[9px] font-semibold tracking-[0.14em] text-[#3a4a60] uppercase mb-3">Account</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { k: "Full Name",     v: fullName },
              { k: "Email",         v: email },
              { k: "Role",          v: me?.role || "—", color: "text-[#8B5CF6]" },
              { k: "Company",       v: "ApexPetro Energy Limited" },
              { k: "Environment",   v: "Local — Sovereign AI Workbench", color: "text-[#14B8A6]" },
            ].map(({ k, v, color }) => (
              <div key={k}>
                <p className="text-[10px] text-[#667386]">{k}</p>
                <p className={`text-[12px] font-medium mt-0.5 ${color || "text-[#F5F7FA]"}`}>{v}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[8px] bg-[#0F1726] border border-[#253248] px-5 py-4 mb-4">
          <p className="text-[9px] font-semibold tracking-[0.14em] text-[#3a4a60] uppercase mb-3">Access & Permissions</p>
          <div className="space-y-2">
            {[
              { label: "View CONFIDENTIAL documents",        granted: true },
              { label: "Run AI analysis on inspection data", granted: true },
              { label: "Execute secure code sandbox",        granted: true },
              { label: "Submit approvals",                   granted: canSubmitApprovals },
              { label: "Manage knowledge base",              granted: canManageKB },
              { label: "Configure system models",            granted: canConfigureModels },
            ].map(({ label, granted }) => (
              <div key={label} className="flex items-center justify-between py-1.5 border-b border-[#1a2740] last:border-0">
                <p className="text-[12px] text-[#9AA6B5]">{label}</p>
                {granted ? (
                  <span className="text-[9.5px] font-semibold text-[#22C55E] bg-[#22C55E]/10 px-2 py-0.5 rounded-[4px]">Granted</span>
                ) : (
                  <span className="text-[9.5px] font-semibold text-[#667386] bg-[#253248] px-2 py-0.5 rounded-[4px]">Restricted</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[8px] bg-[#0F1726] border border-[#253248] overflow-hidden mb-4">
          <p className="text-[9px] font-semibold tracking-[0.14em] text-[#3a4a60] uppercase px-5 pt-4 pb-3">Preferences</p>
          {[
            { icon: Bell,        label: "Notifications",       desc: "Approvals, task completions, alerts"  },
            { icon: Key,         label: "API Keys",             desc: "Manage local integration keys"        },
            { icon: ShieldCheck, label: "Security settings",    desc: "2FA, session timeout, audit log"      },
          ].map(({ icon: Icon, label, desc }) => (
            <button key={label} className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-[#141E2F] border-t border-[#1a2740] first:border-0 transition-colors group">
              <div className="w-8 h-8 rounded-[6px] bg-[#141E2F] group-hover:bg-[#182337] flex items-center justify-center flex-none transition-colors">
                <Icon size={14} className="text-[#667386] group-hover:text-[#9AA6B5] transition-colors"/>
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-[12.5px] font-medium text-[#F5F7FA]">{label}</p>
                <p className="text-[10.5px] text-[#667386]">{desc}</p>
              </div>
              <ChevronRight size={12} className="text-[#3a4a60] group-hover:text-[#667386] flex-none transition-colors"/>
            </button>
          ))}
        </div>

        <div className="rounded-[8px] bg-[#0F1726] border border-[#253248] px-5 py-4 mb-4">
          <p className="text-[9px] font-semibold tracking-[0.14em] text-[#3a4a60] uppercase mb-3">Local Environment</p>
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { icon: Cpu,      label: "GPU",     value: "GTX 1660 Ti", sub: "On-prem hardware", color: "text-[#8B5CF6]" },
              { icon: HardDrive, label: "Models", value: "Qwen2.5 · BGE-M3", sub: "Local Ollama", color: "text-[#14B8A6]" },
              { icon: Clock,     label: "Stack",  value: "Qdrant RAG", sub: "Local Vector DB", color: "text-[#9AA6B5]" },
            ].map(({ icon: Icon, label, value, sub, color }) => (
              <div key={label} className="rounded-[6px] bg-[#141E2F] border border-[#253248] p-3">
                <Icon size={13} className={`${color} mb-2`}/>
                <p className="text-[9px] text-[#667386] uppercase tracking-wide">{label}</p>
                <p className="text-[12px] font-medium text-[#F5F7FA] mt-0.5">{value}</p>
                <p className="text-[10px] text-[#667386] mt-0.5">{sub}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#1a2740]">
            <span className="w-[5px] h-[5px] rounded-full bg-[#14B8A6] animate-pulse-dot"/>
            <p className="text-[10.5px] text-[#14B8A6]">All processing is local. No data transmitted externally.</p>
          </div>
        </div>

        <button className="w-full flex items-center justify-center gap-2 h-10 rounded-[6px] border border-[#EF4444]/25 text-[#EF4444] text-[12.5px] font-medium hover:bg-[#EF4444]/8 transition-all">
          <LogOut size={14}/> Sign Out
        </button>
      </div>
    </div>
  );
}
