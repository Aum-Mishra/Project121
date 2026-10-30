import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";

export default function SecurityWatermarkOverlay() {
  const [captureNotice, setCaptureNotice] = useState<boolean>(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "PrintScreen" || (e.ctrlKey && e.key === "p")) {
        setCaptureNotice(true);
        setTimeout(() => setCaptureNotice(false), 4000);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      {/* Forensic Diagonal Watermark Overlay (Transparent & Click-through) */}
      <div
        className="fixed inset-0 pointer-events-none z-10 select-none overflow-hidden opacity-[0.025]"
        aria-hidden="true"
        style={{ pointerEvents: "none" }}
      >
        <div className="absolute inset-0 flex flex-wrap gap-24 p-8 -rotate-12 scale-125 pointer-events-none" style={{ pointerEvents: "none" }}>
          {Array.from({ length: 40 }).map((_, i) => (
            <div key={i} className="text-[10.5px] font-mono tracking-widest text-white whitespace-nowrap pointer-events-none" style={{ pointerEvents: "none" }}>
              CONFIDENTIAL · ARJUN MEHTA · APEXPETRO JAMNAGAR · AIRGAP-ENFORCED
            </div>
          ))}
        </div>
      </div>

      {/* Screen Capture Audit Notice Toast */}
      {captureNotice && (
        <div className="fixed bottom-4 right-4 z-50 bg-[#1E1215] border border-[#EF4444]/60 text-white px-4 py-2.5 rounded-lg shadow-2xl flex items-center gap-2.5 animate-fade-up font-mono text-[11px]">
          <ShieldAlert size={16} className="text-[#EF4444]" />
          <div>
            <p className="font-bold text-[#FCA5A5]">Security Protocol Active</p>
            <p className="text-[#94A3B8] text-[10px]">Screen capture attempt flagged and logged to cryptographic audit ledger.</p>
          </div>
        </div>
      )}
    </>
  );
}

