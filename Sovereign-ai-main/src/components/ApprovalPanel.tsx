import { useState } from "react";

export type ApprovalInfo = { action: string; artifact: string; due?: string };

export default function ApprovalPanel({ approval, compact = false }: { approval: ApprovalInfo; compact?: boolean }) {
  const [state, setState] = useState<"pending" | "approved" | "rejected">("pending");

  return (
    <div className="rounded-xl p-4 flex flex-col gap-3 animate-approval-pop" style={{ border: "1.5px solid #F59E0B", background: "linear-gradient(135deg, #FEF3C7, #FFE4B5)", boxShadow: "0 2px 14px rgba(245, 158, 11, 0.30)" }}>
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center text-sm text-white" style={{ background: "#F59E0B", color: "#FFFFFF" }}>⚖</span>
        <div className="flex-1">
          <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#B45309" }}>AI Action Required</div>
          <div className="text-[13px] font-semibold mt-0.5" style={{ color: "#431407" }}>{approval.action}</div>
          <div className="text-[11px] mt-0.5" style={{ color: "#92400E" }}>
            Artifact: <span className="font-medium">{approval.artifact}</span>
            {approval.due && <> · Due {approval.due}</>}
          </div>
        </div>
      </div>

      {!compact && (
        <div className="flex items-center gap-2 border-t pt-3" style={{ borderColor: "#FCD34D" }}>
          {state === "pending" ? (
            <>
              <button
                onClick={() => setState("approved")}
                className="text-xs px-5 py-1.5 rounded-md font-semibold text-white transition-colors"
                style={{ background: "#0F766E" }}
              >
                Approve
              </button>
              <button
                onClick={() => setState("rejected")}
                className="text-xs px-5 py-1.5 rounded-md font-semibold transition-colors"
                style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", color: "#475569" }}
              >
                Reject
              </button>
              <span className="text-[10px] ml-auto" style={{ color: "#A16207" }}>
                Logged to the approval audit trail
              </span>
            </>
          ) : state === "approved" ? (
            <span className="text-[10px] font-bold text-green-700 bg-green-50 px-2.5 py-1 rounded border border-green-200 uppercase tracking-wider">
              ✓ Approved — {approval.artifact}
            </span>
          ) : (
            <span className="text-[10px] font-bold text-red-700 bg-red-50 px-2.5 py-1 rounded border border-red-200 uppercase tracking-wider">
              ✕ Rejected — feedback requested
            </span>
          )}
        </div>
      )}
    </div>
  );
}