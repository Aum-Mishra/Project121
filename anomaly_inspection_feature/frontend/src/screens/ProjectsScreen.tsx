import { useState, useEffect } from "react";
import { api, Project } from "../services/api";
import {
  FolderOpen,
  FileText,
  Package,
  Plus,
  Loader,
  Bot,
  User,
  Shield,
  Clock,
  Sparkles,
} from "lucide-react";

export interface ProjectCardData {
  id: string | number;
  project_id: string;
  name: string;
  description: string;
  unit: string;
  asset: string;
  facility: string;
  risk: "HIGH" | "MEDIUM" | "LOW" | string;
  classification: "CONFIDENTIAL" | "INTERNAL" | "RESTRICTED" | string;
  status: "AWAITING APPROVAL" | "COMPLETED" | "RUNNING" | "PLANNING" | "IN_PROGRESS" | string;
  progress: number;
  filesCount: number;
  agentName: string;
  artifactsCount: number;
  timeAgo: string;
}

const DEFAULT_PROJECTS: ProjectCardData[] = [
  {
    id: 1,
    project_id: "PRJ-P102-INTEGRITY",
    name: "P-102 Equipment Integrity Review",
    description:
      "Comprehensive integrity assessment of centrifugal process pump P-102 at CDU-4, including pressure analysis, corrosion assessment and vibration review.",
    facility: "Jamnagar Refinery Complex",
    unit: "CDU-4",
    asset: "P-102",
    risk: "HIGH",
    classification: "CONFIDENTIAL",
    status: "AWAITING APPROVAL",
    progress: 36,
    filesCount: 9,
    agentName: "Inspection Analyst",
    artifactsCount: 3,
    timeAgo: "09:49 Today",
  },
  {
    id: 2,
    project_id: "PRJ-CDU4-MAINT",
    name: "CDU-4 Maintenance Analysis",
    description:
      "Full maintenance scheduling and analysis for CDU-4 unit including all rotating equipment.",
    facility: "Jamnagar Refinery Complex",
    unit: "CDU-4",
    asset: "CDU-4",
    risk: "MEDIUM",
    classification: "CONFIDENTIAL",
    status: "COMPLETED",
    progress: 100,
    filesCount: 14,
    agentName: "Maintenance Analyst",
    artifactsCount: 5,
    timeAgo: "2026-08-27",
  },
  {
    id: 3,
    project_id: "PRJ-VENDOR-COMP",
    name: "Vendor Report Comparison",
    description:
      "Comparison of vendor inspection findings against internal inspection results for P-102.",
    facility: "Jamnagar Refinery Complex",
    unit: "CDU-4",
    asset: "P-102",
    risk: "MEDIUM",
    classification: "INTERNAL",
    status: "RUNNING",
    progress: 45,
    filesCount: 6,
    agentName: "Document Analyst",
    artifactsCount: 1,
    timeAgo: "10:12 Today",
  },
  {
    id: 4,
    project_id: "PRJ-ANNUAL-PLAN",
    name: "Annual Inspection Planning",
    description:
      "Planning and scheduling for annual turnaround inspection across all facility units.",
    facility: "Jamnagar Refinery Complex",
    unit: "All Units",
    asset: "Multiple",
    risk: "LOW",
    classification: "INTERNAL",
    status: "PLANNING",
    progress: 12,
    filesCount: 3,
    agentName: "No agent",
    artifactsCount: 0,
    timeAgo: "2026-08-16",
  },
];

export default function ProjectsScreen({
  onSelectProject,
}: {
  onSelectProject?: (project: Project) => void;
}) {
  const [projectCards, setProjectCards] = useState<ProjectCardData[]>(DEFAULT_PROJECTS);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Optionally fetch backend projects and merge them seamlessly
    api.projects
      .list()
      .then((res) => {
        if (res?.projects?.length > 0) {
          const apiCards: ProjectCardData[] = res.projects.map((p) => ({
            id: p.id,
            project_id: p.project_id,
            name: p.name,
            description: p.description || "Industrial asset project assessment and remediation.",
            facility: "Jamnagar Refinery Complex",
            unit: p.unit || "CDU-4",
            asset: p.asset || "P-102",
            risk: (p.risk || "HIGH").toUpperCase(),
            classification: (p.classification || "CONFIDENTIAL").toUpperCase(),
            status:
              p.status === "Completed"
                ? "COMPLETED"
                : p.risk === "HIGH"
                ? "AWAITING APPROVAL"
                : "RUNNING",
            progress: p.progress ?? 36,
            filesCount: 9,
            agentName: "Inspection Analyst",
            artifactsCount: 3,
            timeAgo: "09:49 Today",
          }));

          // Keep P-102 as primary, then other API projects, then defaults
          const merged = [...apiCards];
          for (const def of DEFAULT_PROJECTS) {
            if (!merged.some((m) => m.project_id === def.project_id)) {
              merged.push(def);
            }
          }
          setProjectCards(merged);
        }
      })
      .catch(() => {
        /* fallback to defaults */
      });
  }, []);

  const handleCardClick = (p: ProjectCardData) => {
    if (onSelectProject) {
      // Cast or build Project representation
      const projObj: Project = {
        id: typeof p.id === "number" ? p.id : 1,
        project_id: p.project_id,
        name: p.name,
        unit: p.unit,
        asset: p.asset,
        status: p.status,
        risk: p.risk,
        progress: p.progress,
        classification: p.classification,
        description: p.description,
        created_at: "2026-08-28T09:42:00Z",
        updated_at: "2026-08-28T09:49:00Z",
      };
      onSelectProject(projObj);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-[#070D18]">
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {/* Top Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-bold text-[#F8FAFC]">Projects</h1>
            <p className="text-[12px] text-[#64748B] mt-0.5">
              ApexPetro Energy Limited · Jamnagar Refinery Complex
            </p>
          </div>
          <button className="flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-[#0D9488] hover:bg-[#0F766E] text-white text-[12px] font-semibold transition-colors shadow-sm">
            <Plus size={14} />
            New Project
          </button>
        </div>

        {/* 2-Column Grid of Project Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projectCards.map((p) => {
            const isHigh = p.risk === "HIGH";
            const isMed = p.risk === "MEDIUM";
            const isCompleted = p.status === "COMPLETED";
            const isAwaiting = p.status === "AWAITING APPROVAL";
            const isRunning = p.status === "RUNNING";

            // Status Badge Colors
            let statusBadge = "bg-[#1E293B] text-[#94A3B8] border-[#334155]";
            if (isCompleted) statusBadge = "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
            else if (isAwaiting) statusBadge = "bg-amber-500/15 text-amber-400 border-amber-500/30";
            else if (isRunning) statusBadge = "bg-blue-500/15 text-blue-400 border-blue-500/30";

            // Progress bar color
            let progressColor = "from-amber-500 to-amber-400";
            if (isCompleted) progressColor = "from-emerald-500 to-emerald-400";
            else if (isRunning) progressColor = "from-blue-500 to-blue-400";

            return (
              <div
                key={p.project_id}
                onClick={() => handleCardClick(p)}
                className="rounded-[12px] bg-[#0E1726] border border-[#1E2E44] hover:border-[#2D4263] p-5 cursor-pointer transition-all group flex flex-col justify-between shadow-sm hover:shadow-md"
              >
                <div>
                  {/* Badges Row */}
                  <div className="flex items-center gap-2 flex-wrap mb-3">
                    <span
                      className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded border ${
                        isHigh
                          ? "bg-red-500/15 text-red-400 border-red-500/30"
                          : isMed
                          ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                          : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                      }`}
                    >
                      {p.risk}
                    </span>

                    <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/25">
                      {p.classification}
                    </span>

                    <span
                      className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded border ${statusBadge}`}
                    >
                      {p.status}
                    </span>
                  </div>

                  {/* Title & Description */}
                  <h3 className="text-[15px] font-bold text-white group-hover:text-teal-400 transition-colors leading-snug">
                    {p.name}
                  </h3>
                  <p className="text-[12px] text-[#94A3B8] mt-1.5 leading-relaxed line-clamp-2">
                    {p.description}
                  </p>

                  {/* Facility line */}
                  <p className="text-[11px] text-[#64748B] mt-2.5 font-medium">
                    {p.facility} · {p.unit} · Asset: {p.asset}
                  </p>
                </div>

                {/* Progress & Footer */}
                <div className="mt-5 space-y-3 pt-3 border-t border-[#182335]">
                  <div>
                    <div className="flex items-center justify-between text-[11px] mb-1.5">
                      <span className="text-[#8C9BAE] font-medium">Progress</span>
                      <span className="font-mono font-bold text-amber-400">{p.progress}%</span>
                    </div>
                    <div className="w-full h-[5px] bg-[#162233] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${progressColor}`}
                        style={{ width: `${p.progress}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-[#64748B] pt-1">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1">
                        <FileText size={12} className="text-[#64748B]" />
                        {p.filesCount} Files
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <User size={12} className="text-[#64748B]" />
                        {p.agentName}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Package size={12} className="text-[#64748B]" />
                        {p.artifactsCount} Artifacts
                      </span>
                    </div>
                    <span className="font-mono text-[10.5px]">{p.timeAgo}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
