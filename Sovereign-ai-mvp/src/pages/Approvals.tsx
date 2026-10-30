import { useState, useEffect } from "react";
import { AlertTriangle, Check, X, Shield, Download } from "lucide-react";
import { api, Approval } from "../services/securityDemo";

const riskFor = (status: string) => {
  const s = (status || "").toLowerCase();
  if (s.includes("approv")) return { risk: "LOW", riskColor: "text-[#22C55E]", riskBg: "bg-[#22C55E]/10 border-[#22C55E]/20" };
  if (s.includes("reject")) return { risk: "HIGH", riskColor: "text-[#EF4444]", riskBg: "bg-[#EF4444]/10 border-[#EF4444]/20" };
  return { risk: "MEDIUM", riskColor: "text-[#F59E0B]", riskBg: "bg-[#F59E0B]/10 border-[#F59E0B]/20" };
};

function StatusBadge({ status }: { status: string }) {
  const s = (status || "").toLowerCase();
  if (s.includes("approv")) return <Check size={14} className="text-[#22C55E]" />;
  if (s.includes("reject") || s.includes("den")) return <X size={14} className="text-[#EF4444]" />;
  return <AlertTriangle size={14} className="text-[#F59E0B]" />;
}

function ApprovalCard({ approval, onAct, busy }: {
  approval: Approval;
  onAct: (id: string, action: "approve" | "reject", comments: string) => void;
  busy: boolean;
}) {
  const [comments, setComments] = useState("");
  const pending = !(approval.status || "").toLowerCase().includes("approv") && !(approval.status || "").toLowerCase().includes("reject");
  const { risk, riskColor, riskBg } = riskFor(approval.status);
  const requestedAt = new Date(approval.requested_at).toLocaleString();
  const reviewer = approval.reviewed_by_name;
  const requester = approval.requested_by_name || `User #${approval.requested_by}`;

  return (
    <div className={`rounded-xl border overflow-hidden transition-all ${pending ? "bg-[var(--color-surface-subtle)] border-[#F59E0B]/30" : "bg-[var(--color-surface-subtle)] border-[var(--color-border-strong)]"}`}>
      <div className={`px-5 py-3 border-b flex items-center gap-3 ${pending ? "border-[#F59E0B]/20 bg-[#F59E0B]/4" : "border-[var(--color-border-strong)]"}`}>
        <StatusBadge status={approval.status} />
        <p className={`text-[12px] font-semibold ${pending ? "text-[#F59E0B]" : "text-[#22C55E]"}`}>
          {pending ? "Human Review Required" : approval.status}
        </p>
        <span className="ml-auto text-[10px] text-[var(--color-border-strong)]">{requestedAt}</span>
      </div>

      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="text-[15px] font-semibold text-[var(--color-text-primary)]">Approval {approval.approval_id}</h3>
            <p className="text-[11px] text-[var(--color-border-strong)] mt-0.5">
              {approval.artifact_name ? `Linked artifact: ${approval.artifact_name}` : "Linked to an AI-generated artifact"}
            </p>
          </div>
          <span className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-lg border ${riskBg} ${riskColor}`}>
            {risk} RISK
          </span>
        </div>

        <div className="grid grid-cols-4 gap-3 mb-4">
          {[
            { label: "Requested By", value: requester, color: "text-[var(--color-text-muted)]" },
            { label: "Requested", value: new Date(approval.requested_at).toLocaleDateString(), color: "text-[var(--color-text-muted)]" },
            { label: "Reviewed", value: approval.reviewed_at ? new Date(approval.reviewed_at).toLocaleDateString() : "—", color: "text-[var(--color-text-muted)]" },
            { label: "Reviewed By", value: pending ? "—" : (reviewer || "—"), color: reviewer ? "text-[#22C55E]" : "text-[var(--color-text-muted)]" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-lg bg-[var(--color-surface-subtle)] border border-[var(--color-border-strong)] p-2.5">
              <p className="text-[9px] text-[var(--color-border-strong)] mb-1">{label}</p>
              <p className={`text-[11px] font-semibold ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        <div className={`rounded-lg p-3.5 mb-4 ${pending ? "bg-[#F59E0B]/6 border border-[#F59E0B]/20" : "bg-[var(--color-surface-subtle)] border border-[var(--color-border-strong)]"}`}>
          <p className="text-[10px] text-[var(--color-border-strong)] mb-1 font-semibold uppercase tracking-wide">Comments</p>
          <p className="text-[13px] text-[var(--color-text-primary)] italic leading-relaxed">{approval.comments || "No comments provided."}</p>
          <p className="text-[10px] text-[var(--color-border-strong)] mt-2">AI-generated · Requires authorized human review</p>
        </div>

        {pending && (
          <div className="flex items-center gap-2 flex-wrap">
            <input
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              disabled={busy}
              placeholder="Review comment (optional)…"
              className="flex-1 min-w-[180px] h-9 rounded-lg bg-[var(--color-surface-subtle)] border border-[var(--color-border-strong)] px-3 text-[12px] text-[var(--color-text-primary)] placeholder-[var(--color-border-strong)] outline-none focus:border-[#8B5CF6]/40 disabled:opacity-50"
            />
            <button
              onClick={() => onAct(approval.approval_id, "approve", comments)}
              disabled={busy}
              className="h-9 px-3.5 rounded-lg bg-[#22C55E]/15 border border-[#22C55E]/30 text-[#22C55E] text-[12px] font-semibold hover:bg-[#22C55E]/25 transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              <Check size={13} /> Approve
            </button>
            <button
              onClick={() => onAct(approval.approval_id, "reject", comments)}
              disabled={busy}
              className="h-9 px-3.5 rounded-lg bg-[#EF4444]/15 border border-[#EF4444]/30 text-[#EF4444] text-[12px] font-semibold hover:bg-[#EF4444]/25 transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              <X size={13} /> Reject
            </button>
            {approval.download_url && (
              <a
                href={approval.download_url}
                className="h-9 px-3 rounded-lg bg-[var(--color-surface-subtle)] border border-[var(--color-border-strong)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border)] transition-all flex items-center gap-1.5 text-[12px]"
                title="Download linked artifact"
              >
                <Download size={12} />
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Approvals() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    try {
      const data = await api.approvals.list();
      setApprovals(data.approvals || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load approvals");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.approvals.list();
        if (!active) return;
        setApprovals(data.approvals || []);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Failed to load approvals");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  async function handleAct(id: string, action: "approve" | "reject", comments: string) {
    setActionError(null);
    setBusyId(id);
    try {
      const updated = action === "approve"
        ? await api.approvals.approve(id, comments || undefined)
        : await api.approvals.reject(id, comments || undefined);
      setApprovals((prev) => prev.map((a) => (a.approval_id === id ? updated : a)));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to update approval");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const pending = approvals.filter(a => !(a.status || "").toLowerCase().includes("approv") && !(a.status || "").toLowerCase().includes("reject"));
  const completed = approvals.filter(a => (a.status || "").toLowerCase().includes("approv") || (a.status || "").toLowerCase().includes("reject"));

  return (
    <div className="h-full overflow-y-auto bg-[var(--color-bg-secondary)]">
      <div className="max-w-3xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[22px] font-semibold text-[var(--color-text-primary)]">Approvals</h1>
            <p className="text-[12px] text-[var(--color-border-strong)] mt-0.5">AI-generated recommendations requiring human decision</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setLoading(true); setError(null); load(); }}
              className="h-8 px-3 rounded-lg bg-[var(--color-surface-subtle)] border border-[var(--color-border-strong)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] text-[12px] font-medium transition-all"
            >
              Refresh
            </button>
            <span className="text-[11px] font-semibold text-[#F59E0B] bg-[#F59E0B]/10 border border-[#F59E0B]/25 px-2.5 py-1 rounded-full">
              {pending.length} pending
            </span>
          </div>
        </div>

        {error && (
          <div className="rounded-xl bg-[#7F1D1D]/15 border border-[#7F1D1D]/40 px-4 py-3 flex items-center justify-between gap-2.5 mb-4">
            <div className="flex items-start gap-2.5">
              <AlertTriangle size={14} className="text-[#FCA5A5] flex-none mt-0.5" />
              <p className="text-[12.5px] text-[#FCA5A5]">{error}</p>
            </div>
            <button
              onClick={() => { setLoading(true); setError(null); load(); }}
              className="px-3 py-1 bg-[#EF4444]/20 border border-[#EF4444]/40 text-[#FCA5A5] text-[11px] font-semibold rounded-lg hover:bg-[#EF4444]/30 transition-all flex-none"
            >
              Retry Session
            </button>
          </div>
        )}

        {actionError && (
          <div className="rounded-xl bg-[#7F1D1D]/15 border border-[#7F1D1D]/40 px-4 py-3 flex items-start gap-2.5 mb-4">
            <X size={14} className="text-[#FCA5A5] flex-none mt-0.5" />
            <p className="text-[12.5px] text-[#FCA5A5]">{actionError}</p>
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            {[0, 1].map((i) => (
              <div key={i} className="rounded-xl bg-[var(--color-surface-subtle)] border border-[var(--color-border-strong)] p-5 animate-pulse">
                <div className="h-3 w-1/3 bg-[var(--color-border-strong)] rounded mb-2" />
                <div className="h-2.5 w-2/3 bg-[var(--color-border)] rounded" />
              </div>
            ))}
          </div>
        ) : approvals.length === 0 ? (
          <div className="text-center py-16">
            <Check size={32} className="text-[var(--color-border-strong)] mx-auto mb-3" />
            <p className="text-[14px] text-[var(--color-border-strong)]">No approvals yet.</p>
            <p className="text-[12px] text-[var(--color-border-strong)] mt-1">AI-generated recommendations will appear here for your review.</p>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {pending.map((ap) => (
                <ApprovalCard key={ap.id} approval={ap} onAct={handleAct} busy={busyId === ap.approval_id} />
              ))}
            </div>

            {completed.length > 0 && (
              <div className="mt-8">
                <p className="text-[11px] font-semibold text-[var(--color-border-strong)] uppercase tracking-widest mb-3">Completed</p>
                <div className="space-y-3">
                  {completed.map((ap) => (
                    <ApprovalCard key={ap.id} approval={ap} onAct={handleAct} busy={false} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
