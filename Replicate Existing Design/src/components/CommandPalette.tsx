import { useState, useEffect, useRef } from "react";
import { Search, X, MessageSquare, FolderOpen, Files, BookOpen, CheckSquare, Package, ClipboardCheck, Cpu, ShieldCheck, Upload, Code, Plus, AlertTriangle, Terminal } from "lucide-react";

type View = "chat" | "projects" | "files" | "knowledge" | "tasks" | "artifacts" | "approvals" | "models" | "security" | "coding-agent" | "error-state";

interface CommandPaletteProps {
  onClose: () => void;
  onNavigate: (view: View) => void;
}

interface Command {
  id: string;
  label: string;
  shortcut?: string;
  icon: React.ElementType;
  action: () => void;
  category: string;
}

export default function CommandPalette({ onClose, onNavigate }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const commands: Command[] = [
    { id: "new-chat", label: "New Chat", icon: Plus, category: "Actions", shortcut: "N", action: () => { onNavigate("chat"); onClose(); } },
    { id: "upload", label: "Upload File", icon: Upload, category: "Actions", action: onClose },
    { id: "sandbox", label: "Run Code Sandbox", icon: Code, category: "Actions", action: onClose },
    { id: "chat", label: "Open Chat", icon: MessageSquare, category: "Navigate", action: () => { onNavigate("chat"); onClose(); } },
    { id: "projects", label: "Open Projects", icon: FolderOpen, category: "Navigate", action: () => { onNavigate("projects"); onClose(); } },
    { id: "files", label: "Open Files", icon: Files, category: "Navigate", action: () => { onNavigate("files"); onClose(); } },
    { id: "knowledge", label: "Search Knowledge", icon: BookOpen, category: "Navigate", action: () => { onNavigate("knowledge"); onClose(); } },
    { id: "tasks", label: "View My Tasks", icon: CheckSquare, category: "Navigate", action: () => { onNavigate("tasks"); onClose(); } },
    { id: "artifacts", label: "Open Artifacts", icon: Package, category: "Navigate", action: () => { onNavigate("artifacts"); onClose(); } },
    { id: "approvals", label: "View Approvals", icon: ClipboardCheck, category: "Navigate", action: () => { onNavigate("approvals"); onClose(); } },
    { id: "coding-agent", label: "Open Coding Agent", icon: Terminal, category: "Navigate", action: () => { onNavigate("coding-agent"); onClose(); } },
    { id: "models", label: "Change Model", icon: Cpu, category: "Navigate", action: () => { onNavigate("models"); onClose(); } },
    { id: "security", label: "Open Security", icon: ShieldCheck, category: "Navigate", action: () => { onNavigate("security"); onClose(); } },
    { id: "error-state", label: "View Error States", icon: AlertTriangle, category: "Navigate", action: () => { onNavigate("error-state"); onClose(); } },
  ];

  const filtered = query
    ? commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()))
    : commands;

  const categories = [...new Set(filtered.map((c) => c.category))];

  const recentSearches = ["P-102 Inspection Report", "CDU-4 Maintenance", "Pump SOP v3.2"];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-start justify-center pt-24" onClick={onClose}>
      <div
        className="w-[560px] bg-[#141E2F] border border-[#253248] rounded-xl shadow-2xl shadow-black/60 overflow-hidden animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#253248]">
          <Search size={15} className="text-[#667386] flex-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search or run a command..."
            className="flex-1 bg-transparent text-[14px] text-[#F5F7FA] placeholder-[#667386] outline-none"
          />
          <button onClick={onClose} className="text-[#667386] hover:text-[#9AA6B5] transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="max-h-[440px] overflow-y-auto">
          {!query && (
            <div className="px-4 pt-3 pb-2">
              <p className="text-[9px] font-semibold tracking-widest text-[#667386] uppercase mb-1.5">Recent</p>
              <div className="space-y-0.5">
                {recentSearches.map((s) => (
                  <button key={s} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-[#182337] transition-colors text-left">
                    <Search size={11} className="text-[#667386]" />
                    <span className="text-[12px] text-[#9AA6B5]">{s}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {categories.map((cat) => (
            <div key={cat} className="px-4 py-2">
              <p className="text-[9px] font-semibold tracking-widest text-[#667386] uppercase mb-1.5">{cat}</p>
              <div className="space-y-0.5">
                {filtered
                  .filter((c) => c.category === cat)
                  .map((cmd) => {
                    const Icon = cmd.icon;
                    return (
                      <button
                        key={cmd.id}
                        onClick={cmd.action}
                        className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-[#182337] transition-colors text-left group"
                      >
                        <Icon size={14} className="text-[#8B5CF6] flex-none" />
                        <span className="flex-1 text-[13px] text-[#F5F7FA]">{cmd.label}</span>
                        {cmd.shortcut && (
                          <kbd className="text-[10px] bg-[#253248] text-[#667386] rounded px-1.5 py-0.5 font-mono">{cmd.shortcut}</kbd>
                        )}
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>

        <div className="px-4 py-2.5 border-t border-[#253248] flex items-center gap-4">
          <span className="text-[10px] text-[#667386] flex items-center gap-1">
            <kbd className="bg-[#253248] text-[#667386] rounded px-1 font-mono">↵</kbd> Select
          </span>
          <span className="text-[10px] text-[#667386] flex items-center gap-1">
            <kbd className="bg-[#253248] text-[#667386] rounded px-1 font-mono">↑↓</kbd> Navigate
          </span>
          <span className="text-[10px] text-[#667386] flex items-center gap-1">
            <kbd className="bg-[#253248] text-[#667386] rounded px-1 font-mono">Esc</kbd> Close
          </span>
        </div>
      </div>
    </div>
  );
}
