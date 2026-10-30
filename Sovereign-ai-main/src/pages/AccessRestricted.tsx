import { useNav } from "../context/NavContext";
import { personas } from "../data/roles";

export default function AccessRestricted({ pageLabel }: { pageLabel: string }) {
  const { role, navigate } = useNav();
  const persona = personas.find((p) => p.id === role) ?? personas[0];

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "var(--color-bg-secondary)" }}>
      <div className="max-w-xl mx-auto px-8 py-24">
        <div className="bg-white rounded-2xl shadow-sm border p-10 text-center" style={{ borderColor: "var(--color-border)" }}>
          <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-6" style={{ background: "#FEF2F2", border: "1px solid #FECACA" }}>
            <svg width="30" height="30" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="7" width="12" height="7" rx="1.5" stroke="#B91C1C" strokeWidth="1.2" />
              <path d="M5.5 7V4.5a2.5 2.5 0 0 1 5 0V7" stroke="#B91C1C" strokeWidth="1.2" />
              <circle cx="8" cy="10.5" r="1.1" fill="#B91C1C" />
            </svg>
          </div>

          <h1 className="text-2xl font-semibold mb-2" style={{ color: "var(--color-text-primary)" }}>
            Access Restricted
          </h1>
          <p className="text-sm mb-6" style={{ color: "var(--color-text-muted)" }}>
            Your current role does not have permission to open <span className="font-medium" style={{ color: "var(--color-text-primary)" }}>{pageLabel}</span>.
          </p>

          <div className="grid grid-cols-1 gap-3 text-left mb-8">
            <div className="flex items-center justify-between px-4 py-3 rounded-lg border" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-subtle)" }}>
              <span className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Current role</span>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-md" style={{ background: persona.colorBg, color: persona.color, border: `1px solid ${persona.borderColor}` }}>
                {persona.label} — {persona.title}
              </span>
            </div>
            <div className="flex items-center justify-between px-4 py-3 rounded-lg border" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-subtle)" }}>
              <span className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Required permission</span>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-md" style={{ background: "#FEF2F2", color: "#B91C1C", border: "1px solid #FECACA" }}>
                Administrator / elevated clearance
              </span>
            </div>
          </div>

          <button
            onClick={() => navigate("dashboard")}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-white transition-colors"
            style={{ background: "var(--color-teal)" }}
          >
            Return to Dashboard →
          </button>
        </div>
      </div>
    </div>
  );
}