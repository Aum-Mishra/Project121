import { useNav } from "../context/NavContext";
import { Search, ExternalLink, MessageCircle, Activity, ChevronRight, Book, Shield, Settings, Users, Database, LayoutTemplate, PenTool } from "lucide-react";

const sections = [
  { title: "Getting Started", icon: Book, items: ["What is KNOVIA AI Workbench?", "Your first project", "Uploading documents", "Starting a task"], page: "workbench" as const },
  { title: "Workbench", icon: LayoutTemplate, items: ["Using Auto Select vs Manual mode", "Understanding execution paths", "Reading evidence sources", "Execution context panel"], page: "workbench" as const },
  { title: "Projects", icon: Users, items: ["Creating a project", "Adding contributors", "Project permissions", "Classification levels"], page: "projects" as const },
  { title: "Knowledge Base & RAG", icon: Database, items: ["How hybrid retrieval works", "BM25 vs Vector Search", "Knowledge collections", "Adding documents to knowledge"], page: "knowledge-base" as const },
  { title: "Documents", icon: Book, items: ["Supported formats", "Ingestion pipeline", "Conflict resolution", "Document versioning"], page: "documents" as const },
  { title: "Agents", icon: Shield, items: ["Available agents and capabilities", "Auto vs Manual agent selection", "Agent permissions", "Approval requirements"], page: "agents" as const },
  { title: "Coding & Sandbox", icon: PenTool, items: ["Opening Coding Workspace", "Running code in sandbox", "Checkpoints and rollback", "Test execution"], page: "coding-workspace" as const },
  { title: "Engineering", icon: Settings, items: ["Engineering analysis workflow", "Drawing generation", "Multimodal inputs", "Review requirements"], page: "engineering-analysis" as const },
  { title: "Security & RBAC", icon: Shield, items: ["Role permissions", "Data classification", "Audit trail", "Approvals workflow"], page: "security-center" as const },
  { title: "System Health", icon: Activity, items: ["Monitoring services", "GPU utilization", "Model status", "Network security"], page: "system-health" as const },
];

export default function HelpCenter() {
  const { navigate } = useNav();

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50">
      <div className="max-w-6xl mx-auto px-8 py-10">
        <div className="mb-10 text-center max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-3">How can we help you?</h1>
          <p className="text-slate-800">Documentation and support for KNOVIA AI Workbench — MRPL Internal</p>
          
          <div className="mt-8 relative group">
            <input
              type="text"
              placeholder="Search help articles, guides, and FAQs..."
              className="w-full pl-12 pr-4 py-4 text-base rounded-xl border border-slate-200 bg-white outline-none shadow-sm transition-all focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-900 group-focus-within:text-teal-500 transition-colors" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <div key={section.title} className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-md transition-all hover:border-teal-200 group">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center text-teal-600 group-hover:bg-teal-600 group-hover:text-white transition-colors">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-semibold text-slate-900">{section.title}</h3>
                </div>
                <div className="space-y-3 mb-6">
                  {section.items.map((item) => (
                    <div key={item} className="flex items-start gap-2 text-sm cursor-pointer group/item">
                      <ChevronRight className="w-4 h-4 text-slate-300 mt-0.5 flex-shrink-0 group-hover/item:text-teal-500 transition-colors" />
                      <span className="text-slate-900 group-hover/item:text-teal-700 transition-colors">{item}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => navigate(section.page)}
                  className="flex items-center gap-1.5 text-sm font-semibold text-teal-600 hover:text-teal-700 transition-colors"
                >
                  View all in {section.title} <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>

        <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-8 sm:p-10 text-white shadow-lg overflow-hidden relative">
          <div className="relative z-10">
            <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
              <MessageCircle className="w-6 h-6 text-teal-400" /> Need Specialized Support?
            </h2>
            <p className="text-slate-300 mb-8 max-w-2xl leading-relaxed">
              Contact the MRPL AI Platform team via the internal ticketing system. All support is handled securely within the MRPL intranet — no external channels are used.
            </p>
            <div className="flex flex-wrap gap-4">
              <button className="px-6 py-3 rounded-xl bg-teal-500 hover:bg-teal-600 text-white font-semibold transition-all shadow-sm active:scale-95">
                Raise an IT Ticket
              </button>
              <button className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/10 font-semibold transition-all active:scale-95 flex items-center gap-2">
                <Activity className="w-4 h-4" /> System Status
              </button>
            </div>
          </div>
          {/* Decorative background elements */}
          <div className="absolute -right-20 -top-40 w-96 h-96 bg-teal-500/20 blur-3xl rounded-full pointer-events-none"></div>
          <div className="absolute right-40 -bottom-40 w-64 h-64 bg-blue-500/20 blur-3xl rounded-full pointer-events-none"></div>
        </div>
      </div>
    </div>
  );
}
