import React from "react";
import { useState } from "react";
import { chartById, ChartDef, DemoChartId } from "../data/demoCore";

const W = 560;
const H = 260;
const PAD = { l: 46, r: 14, t: 14, b: 34 };

function niceCeil(v: number) {
  if (v <= 0) return 10;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
}

function LineChart({ def }: { def: ChartDef }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const xs = def.series[0].points.map((p) => p.x);
  const all = def.series.flatMap((s) => s.points.map((p) => p.y));
  const extra = [def.threshold?.value, def.alarm?.value, def.minWall?.value, def.series.flatMap((s) => s.points.map((p) => p.y))].flatMap((v) => v === undefined ? [] : [v]);
  const maxV = niceCeil(Math.max(...all, ...extra, 1)) * 1.05;
  const minV = Math.min(...all, ...extra, 0) * 0.9;
  const fmtV = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const xAt = (i: number) => PAD.l + (i / Math.max(xs.length - 1, 1)) * plotW;
  const yAt = (v: number) => PAD.t + ((maxV - v) / (maxV - minV)) * plotH;

  const gridLines = [0.2, 0.4, 0.6, 0.8, 1].map((f) => {
    const v = minV + (maxV - minV) * f;
    return { y: PAD.t + (1 - f) * plotH, v };
  });
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

  return (
    <div className="rounded-xl border bg-white p-4" style={{ borderColor: "#E2E8F0" }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[13px] font-semibold" style={{ color: "#0F172A" }}>{def.title}</span>
        <span className="text-[10px] px-2 py-0.5 rounded font-medium" style={{ background: "#F1F5F9", color: "#64748B" }}>Unit: {def.unit}</span>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={def.title}>
        {gridLines.map((g, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={W - PAD.r} y1={g.y} y2={g.y} stroke="#E2E8F0" strokeWidth="1" />
            <text x={PAD.l - 6} y={g.y + 3} textAnchor="end" style={{ fontSize: 9, fill: "#94A3B8" }}>{fmt(g.v)}</text>
          </g>
        ))}
        {xs.map((label, i) => (
          <text key={label} x={xAt(i)} y={H - 10} textAnchor="middle" style={{ fontSize: 9, fill: "#64748B" }}>{label}</text>
        ))}
        {[def.threshold, def.alarm, def.minWall].map((line, i) =>
          line ? (
            <line key={i} x1={PAD.l} x2={W - PAD.r} y1={yAt(line.value)} y2={yAt(line.value)}
              stroke={i === 0 ? "#E11D48" : i === 1 ? "#D97706" : "#7C3AED"} strokeWidth="1.2"
              strokeDasharray="5 4" />
          ) : null
        )}
        {def.anomalyPoints && def.anomalyPoints.map((a, i) => {
          const idx = xs.indexOf(a.x);
          if (idx < 0) return null;
          return (
            <g key={i}>
              <rect x={xAt(idx) - 14} y={PAD.t} width={28} height={plotH} fill="#FEE2E2" opacity="0.35" />
              <circle cx={xAt(idx)} cy={yAt(def.series[0].points[idx].y)} r="4.5" fill="#E11D48" stroke="#fff" strokeWidth="1.5" />
            </g>
          );
        })}
        {def.series.map((s) => (
          <polyline
            key={s.id}
            points={s.points.map((p, i) => `${xAt(i)},${yAt(p.y)}`).join(" ")}
            fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
          />
        ))}
        {def.series.map((s, si) =>
          s.points.map((p, i) => {
            const last = i === s.points.length - 1;
            const y = yAt(p.y);
            const isHover = hoverIndex === i;
            return (
              <g key={`${s.id}-${i}`} onMouseEnter={() => setHoverIndex(i)} onMouseLeave={() => setHoverIndex(null)} className="cursor-pointer">
                <circle cx={xAt(i)} cy={y} r={isHover ? "6" : "4"} fill={s.color} stroke="#fff" strokeWidth="1.5" />
                {isHover && (
                  <g>
                    <rect x={xAt(i) - 30} y={y - 35} width="60" height="28" rx="4" fill="#fff" stroke={s.color} strokeWidth="1" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.1))" />
                    <text x={xAt(i)} y={y - 23} textAnchor="middle" style={{ fontSize: 9, fontWeight: 600, fill: "#0F172A" }}>{p.x}</text>
                    <text x={xAt(i)} y={y - 12} textAnchor="middle" style={{ fontSize: 9, fontWeight: 600, fill: s.color }}>{s.name}: {p.y}</text>
                  </g>
                )}
                {!isHover && (
                  <text
                    x={xAt(i)}
                    y={si === 0 || !last ? y - 10 : y + 16}
                    textAnchor="middle"
                    style={{ fontSize: 9 }}
                    fill={si === 0 ? "#64748B" : s.color}
                    fontWeight={last ? 600 : 400}
                    pointerEvents="none"
                  >
                    {fmtV(p.y)}
                    {last && <tspan fill={s.color}> ▼</tspan>}
                  </text>
                )}
              </g>
            );
          })
        )}
      </svg>
      <div className="flex flex-wrap items-center gap-3 mt-2">
        {def.series.map((s) => (
          <span key={s.id} className="flex items-center gap-1.5 text-[11px]" style={{ color: "#475569" }}>
            <span className="w-3 h-[3px] rounded-full inline-block" style={{ background: s.color }} />
            {s.name} <span className="text-slate-900">({s.unit})</span>
          </span>
        ))}
        {def.threshold && (
          <span className="flex items-center gap-1.5 text-[11px]" style={{ color: "#E11D48" }}>
            <span className="w-3 border-t-2 border-dashed inline-block" style={{ borderColor: "#E11D48" }} />
            {def.threshold.label}
          </span>
        )}
        {def.alarm && (
          <span className="flex items-center gap-1.5 text-[11px]" style={{ color: "#D97706" }}>
            <span className="w-3 border-t-2 border-dashed inline-block" style={{ borderColor: "#D97706" }} />
            {def.alarm.label}
          </span>
        )}
        {def.minWall && (
          <span className="flex items-center gap-1.5 text-[11px]" style={{ color: "#7C3AED" }}>
            <span className="w-3 border-t-2 border-dashed inline-block" style={{ borderColor: "#7C3AED" }} />
            {def.minWall.label}
          </span>
        )}
      
    </div>
      <div className="flex items-start gap-2 mt-3 rounded-lg px-3 py-2 text-[11px]" style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", color: "#475569" }}>
        <span className="mt-0.5">ℹ️</span>
        <div>
          <div>{def.insight}</div>
          <div className="mt-0.5 flex items-center gap-2 text-[10px]" style={{ color: "#94A3B8" }}>
            <span>{def.xLabel} → {def.yLabel}</span>
            <span>{def.series.length > 1 ? `· ${def.series.length} series` : "· 1 series"}</span>
            <span>· Data: demo set</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function GroupedBarChart({ def }: { def: ChartDef }) {
  const [hoverBar, setHoverBar] = useState<{i: number, si: number} | null>(null);
  const xs = def.series[0].points.map((p) => p.x);
  const all = def.series.flatMap((s) => s.points.map((p) => p.y));
  const maxV = niceCeil(Math.max(...all, 1)) * 1.08;
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const groupW = plotW / xs.length;
  const barW = Math.min(groupW / (def.series.length + 0.6), 26);
  const yAt = (v: number) => PAD.t + ((maxV - v) / maxV) * plotH;

  return (
    <div className="rounded-xl border bg-white p-4" style={{ borderColor: "#E2E8F0" }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[13px] font-semibold" style={{ color: "#0F172A" }}>{def.title}</span>
        <span className="text-[10px] px-2 py-0.5 rounded font-medium" style={{ background: "#F1F5F9", color: "#64748B" }}>Baseline vs Current</span>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={def.title}>
        {[0.25, 0.5, 0.75, 1].map((f) => {
          const v = maxV * f;
          const y = yAt(v);
          return (
            <g key={f}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} stroke="#E2E8F0" strokeWidth="1" />
              <text x={PAD.l - 6} y={y + 3} textAnchor="end" style={{ fontSize: 9, fill: "#94A3B8" }}>{Number.isInteger(v) ? v : v.toFixed(1)}</text>
            </g>
          );
        })}
        {xs.map((label, i) => (
          <text key={label} x={PAD.l + i * groupW + groupW / 2} y={H - 10} textAnchor="middle" style={{ fontSize: 9, fill: "#64748B" }}>{label}</text>
        ))}
        {xs.map((_, i) =>
          def.series.map((s, si) => {
            const y = yAt(s.points[i].y);
            return (
              <g key={`${i}-${si}`}>
                <g onMouseEnter={() => setHoverBar({i, si})} onMouseLeave={() => setHoverBar(null)} className="cursor-pointer transition-all">
                  <rect
                    x={PAD.l + i * groupW + groupW / 2 - barW + si * barW}
                    y={y} width={barW} height={Math.max(H - PAD.b - y, 1)}
                    rx="2" fill={s.color} opacity={hoverBar?.i === i && hoverBar?.si === si ? "1" : "0.85"}>
                  </rect>
                  {hoverBar?.i === i && hoverBar?.si === si ? (
                    <g>
                      <rect x={PAD.l + i * groupW + groupW / 2 - barW + si * barW + barW / 2 - 30} y={y - 35} width="60" height="28" rx="4" fill="#fff" stroke={s.color} strokeWidth="1" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.1))" />
                      <text x={PAD.l + i * groupW + groupW / 2 - barW + si * barW + barW / 2} y={y - 23} textAnchor="middle" style={{ fontSize: 9, fontWeight: 600, fill: "#0F172A" }}>{s.points[i].x}</text>
                      <text x={PAD.l + i * groupW + groupW / 2 - barW + si * barW + barW / 2} y={y - 12} textAnchor="middle" style={{ fontSize: 9, fontWeight: 600, fill: s.color }}>{s.points[i].y}</text>
                    </g>
                  ) : (
                    <text
                      x={PAD.l + i * groupW + groupW / 2 - barW + si * barW + barW / 2}
                      y={y - 5}
                      textAnchor="middle"
                      style={{ fontSize: 9 }}
                      fill={s.color}
                      fontWeight={600}
                      pointerEvents="none"
                    >
                      {s.points[i].y}
                    </text>
                  )}
                </g>
              </g>
            );
          })
        )}
      </svg>
      <div className="flex flex-wrap items-center gap-3 mt-2">
        {def.series.map((s) => (
          <span key={s.id} className="flex items-center gap-1.5 text-[11px]" style={{ color: "#475569" }}>
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
      <div className="mt-3 rounded-lg px-3 py-2 text-[11px]" style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", color: "#475569" }}>
        ℹ️ {def.insight}
      </div>
    </div>
  );
}

export default function ChartCard({ id }: { id: DemoChartId }) {
  const def = chartById(id);
  if (!def) return null;
  return id === "baseline-current" || id === "levels-24-26" || id.includes("corrosion") ? <GroupedBarChart def={def} /> : <LineChart def={def} />;
}