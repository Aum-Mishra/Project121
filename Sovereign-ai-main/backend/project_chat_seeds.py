# -*- coding: utf-8 -*-
"""Seed project chats.

Every chat is grounded in the real MRPL knowledge base documents for that
project (document names match actual Qdrant payloads). Titles are derived from
the first question, matching the live Workbench behaviour. Each chat stores the
contributor that created it so multi-contributor access is visible.
"""

PROJECT_CHAT_SEEDS = [
    {
        "project_id": "PRJ-P102-REV",
        "chats": [
            {
                "title": "P-102 Discharge Pressure Trend",
                "created_by": "Rajesh Kumar",
                "messages": [
                    {"role": "user", "content": "How did the discharge pressure of P-102 change across the 2024, 2025 and 2026 inspections?"},
                    {"role": "assistant", "content": "From the P-102 inspection reports (2024/2025/2026) discharge pressure was 34 bar (2024), 37 bar (2025) and 42 bar (2026) - +8 bar (+23.5%). APEL-SOP-INS-221 (pump_condition_monitoring) classifies pressure as Normal <= 40 bar, Review 40-45 bar and Immediate above 45 bar. At 42 bar P-102 is now inside the Review band at MRPL, so an engineering review is due."},
                ],
            },
            {
                "title": "P-102 Corrosion Assessment",
                "created_by": "Rajesh Kumar",
                "messages": [
                    {"role": "user", "content": "What is the corrosion trend on P-102 and is it within limits?"},
                    {"role": "assistant", "content": "Inspection thickness data (corrosion_thickness / inspection reports) shows corrosion increasing 1.2 mm (2024), 2.4 mm (2025), 3.8 mm (2026) - +2.6 mm (+216.7%). The SOP treats <2 mm normal, 2-3 mm review and >3 mm requiring immediate engineering review. 3.8 mm exceeds the review threshold."},
                ],
            },
            {
                "title": "P-102 Vibration Condition",
                "created_by": "Anita Rao",
                "messages": [
                    {"role": "user", "content": "Analyse the vibration history of P-102 against the monitoring SOP."},
                    {"role": "assistant", "content": "Vibration rose 4.1, 5.3 to 7.2 mm/s (2024-2026), +3.1 mm/s (+75.6%). Pump condition monitoring thresholds are <4 mm/s normal, 4-7 mm/s review and >7 mm/s immediate response; 7.2 mm/s exceeds the band, so corrective action is flagged for MRPL maintenance."},
                ],
            },
            {
                "title": "P-102 Seal Temperature Trend",
                "created_by": "Anita Rao",
                "messages": [
                    {"role": "user", "content": "What does the seal temperature data show out of the P-102 run?"},
                    {"role": "assistant", "content": "Seal temperature tracked 74 C (2024), 79 C (2025), 84 C (2026), a +10 C (+13.5%) rise. The pump condition monitoring SOP does not publish a hard seal-temperature limit, so the reading is recorded as OK with a note to monitor for accelerating trend given the rising vibration."},
                ],
            },
            {
                "title": "P-102 Overall Risk Conclusion",
                "created_by": "Rajesh Kumar",
                "messages": [
                    {"role": "user", "content": "What is the overall integrity risk for P-102 and what do we recommend?"},
                    {"role": "assistant", "content": "Overall integrity risk for P-102 is HIGH. Corrosion (3.8 mm) exceeds review, vibration (7.2 mm/s) exceeds the immediate band and pressure (42 bar) sits in review. The 2026 inspection findings state pressure is above the approved limit and corrosion and vibration require engineering review. Recommendations: schedule a detailed NDT of the casing and seals, balance/recondition the rotating assembly, and review the operating set points before the next run."},
                ],
            },
            {
                "title": "P-102 Condition Monitoring SOP",
                "created_by": "Rajesh Kumar",
                "messages": [
                    {"role": "user", "content": "Which SOP governs P-102 condition monitoring and what pages carry the limits?"},
                    {"role": "assistant", "content": "APEL-SOP-INS-221 in pump_condition_monitoring.pdf governs this. The measured-values and threshold pages (pages 2-5) carry pressure, vibration and corrosion bands used for the P-102 assessment, plus pump_maintenance.pdf for the maintenance intervals."},
                ],
            },
            {
                "title": "P-102 Equipment Record Summary",
                "created_by": "Anita Rao",
                "messages": [
                    {"role": "user", "content": "Summarise the registered P-102 equipment record."},
                    {"role": "assistant", "content": "The P-102 detailed datasheet and equipment record (P-102_detailed_datasheet.pdf, P-102_equipment_record.pdf) register the feed transfer pump within CDU-4. Purchased spare/refurb data and vendor technical report (P-102_vendor_technical_report_2026.pdf) are available for the maintenance study."},
                ],
            },
            {
                "title": "P-102 Maintenance & WO History",
                "created_by": "Rajesh Kumar",
                "messages": [
                    {"role": "user", "content": "What maintenance and work order history exists for P-102?"},
                    {"role": "assistant", "content": "P-102_maintenance_history.pdf and the work order register (work_order_register.xlsx, work_order_management.pdf) plus asset_maintenance_history.xlsx capture the repair and inspection cycle. The pump maintenance SOP defines the servicing scope; current data indicates corrective work is justified by the 2026 findings."},
                ],
            },
            {
                "title": "Generate P-102 Risk Report",
                "created_by": "Anita Rao",
                "messages": [
                    {"role": "user", "content": "Generate an inspection and risk assessment report for P-102 based on the knowledge base."},
                    {"role": "assistant", "content": "The system produced the MRPL P-102 Inspection & Risk Assessment Report with sections for asset context, three-year data extracts, SOP limit checks, graphs (pressure, corrosion, vibration, seal temperature), a HIGH risk conclusion with evidence and recommendations. All figures come from the P-102 inspection reports and pump condition monitoring SOP."},
                ],
            },
            {
                "title": "P-102 Data Sources",
                "created_by": "Rajesh Kumar",
                "messages": [
                    {"role": "user", "content": "Which documents back the P-102 analysis?"},
                    {"role": "assistant", "content": "Sources: P-102_inspection_2024.pdf, P-102_inspection_2025.pdf, P-102_inspection_2026.pdf, P-102_detailed_datasheet.pdf, P-102_maintenance_history.pdf, pump_condition_monitoring.pdf, corrosion_thickness.pdf and pump_maintenance.pdf."},
                ],
            },
        ],
    },
    {
        "project_id": "PRJ-CDU4-INSP",
        "chats": [
            {
                "title": "CDU-4 Registered Equipment",
                "created_by": "Anita Rao",
                "messages": [
                    {"role": "user", "content": "Which equipment records exist for CDU-4 in the knowledge base?"},
                    {"role": "assistant", "content": "CDU-4 equipment records registered at MRPL include V-201, V-220, D-410 and F-401 (equipment_record.pdf documents) plus the P-102 feed pump datasheet that belongs to the unit. equipment_inspection_summary_2026.xlsx and integrity_risk_register.xlsx cover unit-wide status."},
                ],
            },
            {
                "title": "CDU-4 Corrosion Risk Review",
                "created_by": "Rajesh Kumar",
                "messages": [
                    {"role": "user", "content": "What corrosion threats does the CDU-4 RBI scope need to address?"},
                    {"role": "assistant", "content": "The RBI scope for CDU (corrosion_thickness.pdf, corrosion_history.xlsx, wall_thickness_history.parquet) covers high-temperature sulphidation, naphthenic acid and erosion-corrosion on vessels and lines. inspection_gap_analysis.xlsx flags where thickness survey coverage is missing for the next cycle."},
                ],
            },
            {
                "title": "CDU-4 Inspection Plan 2026",
                "created_by": "Anita Rao",
                "messages": [
                    {"role": "user", "content": "How is the CDU-4 inspection plan structured for 2026?"},
                    {"role": "assistant", "content": "The plan follows risk-based intervals per equipment record with 2026 summary in equipment_inspection_summary_2026.xlsx. Rotating equipment follows rotating_equipment_reliability_manual.pdf; the P-102 pump (a CDU-4 asset) was inspected in 2024, 2025 and 2026 with pressure/corrosion/vibration extracts in the reports."},
                ],
            },
            {
                "title": "CDU-4 Reliability Plan",
                "created_by": "Rajesh Kumar",
                "messages": [
                    {"role": "user", "content": "Summarise the CDU-4 reliability improvement plan."},
                    {"role": "assistant", "content": "CDU4_reliability_improvement_plan.pdf together with CDU4_maintenance_backlog.pdf and reliability_metrics_history.xlsx define the unit reliability actions: backlog clearance, critical rotating equipment monitoring and predictive maintenance triggers aligned to the pump condition monitoring thresholds."},
                ],
            },
            {
                "title": "CDU-4 Integrity Operating Windows",
                "created_by": "Anita Rao",
                "messages": [
                    {"role": "user", "content": "What are the integrity operating windows for CDU-4 equipment?"},
                    {"role": "assistant", "content": "Operating windows are set from the equipment records and SOP limits: pressure normal <=40 bar with 40-45 bar review per pump SOP, corrosion <2 mm with 2-3 mm review, vibration <4 mm/s. Values beyond the review band (as seen on P-102) must be logged in integrity_risk_register.xlsx."},
                ],
            },
            {
                "title": "CDU-4 Equipment Records",
                "created_by": "Rajesh Kumar",
                "messages": [
                    {"role": "user", "content": "Show the vessel and column records for CDU-4."},
                    {"role": "assistant", "content": "V-201, V-220, D-410 and F-401 equipment records are indexed with their datasheet pages. The D-410 record (equipment_record.pdf) and V-series records include the design data used for thickness review."},
                ],
            },
            {
                "title": "CDU-4 P-102 Pump Dependency",
                "created_by": "Anita Rao",
                "messages": [
                    {"role": "user", "content": "Why does CDU-4 risk depend on P-102 condition?"},
                    {"role": "assistant", "content": "P-102 is the feed transfer pump for CDU-4. Its 2026 readings - pressure 42 bar, corrosion 3.8 mm, vibration 7.2 mm/s - drive the unit integrity risk. MRPL's recommendation is to stage the pump repair into the CDU maintenance window."},
                ],
            },
            {
                "title": "CDU-4 Inspection Deliverables",
                "created_by": "Rajesh Kumar",
                "messages": [
                    {"role": "user", "content": "What deliverables should the CDU-4 analysis produce?"},
                    {"role": "assistant", "content": "The deliverables are an inspection & risk assessment report for CDU-4 covering equipment records, 2026 inspection summary, corrosion/vibration trends and risk register updates, plus the generated documents from the chat for review and approval."},
                ],
            },
            {
                "title": "CDU-4 Review Band Findings",
                "created_by": "Anita Rao",
                "messages": [
                    {"role": "user", "content": "Which CDU-4 readings are in the review band?"},
                    {"role": "assistant", "content": "On P-102, pressure (42 bar) is in the 40-45 bar review band and corrosion (3.8 mm) plus vibration (7.2 mm/s) exceed their bands; these should move into MRPL's corrective work plan with documented engineering review."},
                ],
            },
            {
                "title": "CDU-4 Evidence Sources",
                "created_by": "Rajesh Kumar",
                "messages": [
                    {"role": "user", "content": "List the documents used for the CDU-4 assessment."},
                    {"role": "assistant", "content": "Sources: V-201, V-220, D-410, F-401 equipment records, P-102 inspection reports, equipment_inspection_summary_2026.xlsx, corrosion_thickness.pdf, CDU4_reliability_improvement_plan.pdf, integrity_risk_register.xlsx."},
                ],
            },
        ],
    },
    {
        "project_id": "PRJ-TA2027",
        "chats": [
            {
                "title": "Turnaround 2027 Work Order Scope",
                "created_by": "Arvind Rao",
                "messages": [
                    {"role": "user", "content": "What does the 2027 turnaround scope look like from the maintenance data?"},
                    {"role": "assistant", "content": "The turnaround master data (maintenance_master_plan.xlsx, maintenance_backlog_detailed.xlsx, work_order_register.xlsx) covers deferred corrective work, rotating equipment overhaul and vessel/tankage inspection rounds. work_order_management.pdf defines how MRPL scopes, approves and closes turnaround work orders."},
                ],
            },
            {
                "title": "TA2027 Backlog & Critical Path",
                "created_by": "Anita Rao",
                "messages": [
                    {"role": "user", "content": "Which backlog items are critical for TA-2027 planning?"},
                    {"role": "assistant", "content": "Priority items come from reliability_events_2024/2025/2026.xlsx and reliability_metrics_history.xlsx plus P-102 corrective work (repair pressure/corrosion/vibration exceedances). CDU4_maintenance_backlog.pdf and maintenance_backlog_detailed.xlsx mark the long-lead items to lock in early."},
                ],
            },
            {
                "title": "Turnaround Maintenance Budget",
                "created_by": "Arvind Rao",
                "messages": [
                    {"role": "user", "content": "How is maintenance budget pressure trending for the turnaround?"},
                    {"role": "assistant", "content": "maintenance_budget_pressure.xlsx and maintenance_pressure_index.xlsx track cost vs plan; maintenance_effectiveness_history.xlsx shows whether planned spend converted into improved reliability. MRPL uses these to size the TA-2027 envelope."},
                ],
            },
            {
                "title": "Reliability Events Review",
                "created_by": "Anita Rao",
                "messages": [
                    {"role": "user", "content": "What reliability events should inform turnaround planning?"},
                    {"role": "assistant", "content": "reliability_events_2024.xlsx, reliability_events_2025.xlsx and reliability_events_2026.xlsx list failures by equipment; rotating_equipment_reliability_manual.pdf and abnormal_operation_response.pdf inform which machines go into the overhaul list."},
                ],
            },
            {
                "title": "SOP Coverage for Turnaround Work",
                "created_by": "Arvind Rao",
                "messages": [
                    {"role": "user", "content": "Which SOPs apply to turnaround jobs?"},
                    {"role": "assistant", "content": "pump_maintenance.pdf, pump_condition_monitoring.pdf, rotating_equipment_reliability_manual.pdf and the OPS response SOPs (abnormal pressure, cavitation, utility failure) apply. work_order_management.pdf governs execution and closeout."},
                ],
            },
            {
                "title": "Inspection Work in Turnaround",
                "created_by": "Anita Rao",
                "messages": [
                    {"role": "user", "content": "What inspection activities belong in the turnaround?"},
                    {"role": "assistant", "content": "Inspection rounds from equipment_inspection_summary_2026.xlsx, inspection_gap_analysis.xlsx and corrosion_thickness.pdf, plus the P-102 post-repair verification, should be scheduled in the critical path."},
                ],
            },
            {
                "title": "Long-Lead Procurement Items",
                "created_by": "Arvind Rao",
                "messages": [
                    {"role": "user", "content": "Which turnaround items are long-lead and need early action?"},
                    {"role": "assistant", "content": "Spares and vendor-supported jobs tracked in vendor_dependency_risk.xlsx and maintenance_backlog_detailed.xlsx. vendor_evaluation_procedure.pdf covers supplier qualification; MRPL should raise purchase requests ahead of the 2027 shutdown."},
                ],
            },
            {
                "title": "Turnaround Risk Register",
                "created_by": "Anita Rao",
                "messages": [
                    {"role": "user", "content": "What risks should the turnaround risk register hold?"},
                    {"role": "assistant", "content": "dynamic_risk_register.xlsx, integrity_risk_register.xlsx and abnormal_condition_register.xlsx capture scope creep, P-102 condition risk and safety of work. SOP-SAF-208/209/210 emergencies cover unit isolation, confined space and hot work during shutdown."},
                ],
            },
            {
                "title": "Turnaround Execution Readiness",
                "created_by": "Arvind Rao",
                "messages": [
                    {"role": "user", "content": "How ready is MRPL for the 2027 turnaround execution?"},
                    {"role": "assistant", "content": "README: readiness is driven by backlog clearance, work order readiness (work_order_register.xlsx), maintenance master plan coverage and reliability metrics. Gaps flagged in inspection_gap_analysis.xlsx and maintenance_backlog_detailed.xlsx remain the main execution risks."},
                ],
            },
            {
                "title": "TA2027 Evidence Sources",
                "created_by": "Anita Rao",
                "messages": [
                    {"role": "user", "content": "List the documents used for turnaround planning."},
                    {"role": "assistant", "content": "Sources: maintenance_master_plan.xlsx, maintenance_backlog_detailed.xlsx, work_order_register.xlsx, reliability_events_2024/2025/2026.xlsx, reliability_metrics_history.xlsx, rotating_equipment_reliability_manual.pdf, work_order_management.pdf."},
                ],
            },
        ],
    },
    {
        "project_id": "PRJ-EP32-CUI",
        "chats": [
            {
                "title": "CUI Threat Assessment on EP-32",
                "created_by": "Meena Shetty",
                "messages": [
                    {"role": "user", "content": "What corrosion-under-insulation threats apply to pipeline EP-32?"},
                    {"role": "assistant", "content": "CUI risk on EP-32 is driven by moisture under insulation on the pipeline. corrosion_thickness.pdf, corrosion_history.xlsx and wall_thickness_history.parquet back the assessment; the integrity risk register holds the classification for MRPL follow-up."},
                ],
            },
            {
                "title": "Pipeline Anomaly Detection",
                "created_by": "Anita Rao",
                "messages": [
                    {"role": "user", "content": "Which anomaly records relate to this pipeline investigation?"},
                    {"role": "assistant", "content": "anomaly_event_history.parquet, anomaly_clusters.xlsx and abnormality_risk_index.xlsx record detected events and cluster risk; abnormal_condition_register.xlsx logs operational abnormalities to be reviewed for the EP-32 investigation."},
                ],
            },
            {
                "title": "Wall Thickness Progression",
                "created_by": "Meena Shetty",
                "messages": [
                    {"role": "user", "content": "Is wall thickness trending available for the pipeline integrity review?"},
                    {"role": "assistant", "content": "wall_thickness_history.parquet and corrosion_history.xlsx provide the thickness progression series; inspection_gap_analysis.xlsx shows where coverage is missing along the route and should be closed in the next survey."},
                ],
            },
            {
                "title": "EP-32 NDT & Inspection Plan",
                "created_by": "Anita Rao",
                "messages": [
                    {"role": "user", "content": "What inspection methods should the pipeline investigation plan use?"},
                    {"role": "assistant", "content": "Corrosion thickness surveys (corrosion_thickness.pdf) with targeted NDT at suspect locations, guided by integrity_risk_register.xlsx and equipment_inspection_summary_2026.xlsx. Additional protection: SOP-SAF-210 hot work near hydrocarbon systems governs any repairs."},
                ],
            },
            {
                "title": "Pipeline Risk Classification",
                "created_by": "Meena Shetty",
                "messages": [
                    {"role": "user", "content": "How should the pipeline anomaly be risk classified?"},
                    {"role": "assistant", "content": "Classification follows the integrity risk register and abnormality risk index (abnormality_risk_index.xlsx, dynamic_risk_register.xlsx). Anomalies with confirmed wall loss and pressure exposure are escalated within MRPL for repair planning."},
                ],
            },
            {
                "title": "Piping Integrity Operating Windows",
                "created_by": "Anita Rao",
                "messages": [
                    {"role": "user", "content": "What integrity windows apply to the pipeline?"},
                    {"role": "assistant", "content": "Piping windows come from pressure and thickness bands: corrosion <2 mm normal, 2-3 mm review, >3 mm action per corrosion_thickness.pdf, with pressure responses per SOP-OPS-201 abnormal pressure response."},
                ],
            },
            {
                "title": "Vendor Support for Pipeline Repair",
                "created_by": "Meena Shetty",
                "messages": [
                    {"role": "user", "content": "How do we qualify vendor support for the repair?"},
                    {"role": "assistant", "content": "vendor_evaluation_procedure.pdf and vendor_data_security_policy.pdf define supplier qualification and data handling; vendor_dependency_risk.xlsx flags dependency on third party NDT and repair services."},
                ],
            },
            {
                "title": "CUI Findings In-Scope Evidence",
                "created_by": "Anita Rao",
                "messages": [
                    {"role": "user", "content": "Summarise the evidence supporting the CUI findings."},
                    {"role": "assistant", "content": "Evidence: corrosion_thickness.pdf threshold pages, corrosion_history.xlsx losses, wall_thickness_history.parquet progression, integrity_risk_register.xlsx classification and anomaly event history. Together they support a HIGH risk posture while repair planning is pending."},
                ],
            },
            {
                "title": "Pipeline Next Steps",
                "created_by": "Meena Shetty",
                "messages": [
                    {"role": "user", "content": "What are the recommended next steps for EP-32?"},
                    {"role": "assistant", "content": "Next steps: close inspection gaps, complete NDT of suspect locations, confirm wall loss in the risk register, qualify a repair vendor and schedule repair in the nearest MRPL maintenance window."},
                ],
            },
            {
                "title": "EP-32 Evidence Sources",
                "created_by": "Anita Rao",
                "messages": [
                    {"role": "user", "content": "List the documents used in the pipeline investigation."},
                    {"role": "assistant", "content": "Sources: corrosion_thickness.pdf, corrosion_history.xlsx, wall_thickness_history.parquet, anomaly_event_history.parquet, abnormal_condition_register.xlsx, integrity_risk_register.xlsx, inspection_gap_analysis.xlsx."},
                ],
            },
        ],
    },
    {
        "project_id": "PRJ-CX4-VEND",
        "chats": [
            {
                "title": "CX-4 Vendor Evaluation Criteria",
                "created_by": "Priya Nair",
                "messages": [
                    {"role": "user", "content": "How does the vendor evaluation procedure apply to CX-4?"},
                    {"role": "assistant", "content": "vendor_evaluation_procedure.pdf defines the MRPL scoring flow - technical, commercial, delivery and HSE - applied to CX-4 candidates. vendor_dependency_risk.xlsx tracks reliance so the worst-case single-vendor risk is quantified."},
                ],
            },
            {
                "title": "Data Security for Vendor Evaluation",
                "created_by": "Suresh Bhat",
                "messages": [
                    {"role": "user", "content": "What data security rules apply when sharing CX-4 documents with vendors?"},
                    {"role": "assistant", "content": "vendor_data_security_policy.pdf governs controlled disclosure, classification handling and NDA obligations. MRPL only releases classified CX-4 material after the vendor meets the policy controls."},
                ],
            },
            {
                "title": "Vendor Technical Report Review",
                "created_by": "Priya Nair",
                "messages": [
                    {"role": "user", "content": "What vendor technical findings inform the CX-4 evaluation?"},
                    {"role": "assistant", "content": "The vendor technical reports (P-102_vendor_technical_report_2026.pdf pattern) demonstrate the proposed units' technical fit, performance data and maintainability - the same evidence set is used to evaluate the CX-4 offering at MRPL."},
                ],
            },
            {
                "title": "CX-4 Risk Register Inputs",
                "created_by": "Suresh Bhat",
                "messages": [
                    {"role": "user", "content": "Which risks should the CX-4 evaluation flag?"},
                    {"role": "assistant", "content": "Vendor dependency (vendor_dependency_risk.xlsx), delivery and customisation risk, plus integration with the procurement framework in vendor_evaluation_procedure.pdf. Register them in dynamic_risk_register.xlsx."},
                ],
            },
            {
                "title": "Supplier Qualification Steps",
                "created_by": "Priya Nair",
                "messages": [
                    {"role": "user", "content": "Walk me through the CX-4 supplier qualification steps."},
                    {"role": "assistant", "content": "Steps per vendor_evaluation_procedure.pdf: request for information, technical evaluation, commercial/terms review, data security clearance and approval gate, then award recommendation for the commodity."},
                ],
            },
            {
                "title": "CX-4 Evaluation Checklist",
                "created_by": "Suresh Bhat",
                "messages": [
                    {"role": "user", "content": "Build a checklist for the CX-4 technical evaluation."},
                    {"role": "assistant", "content": "Checklist: spec conformance, performance data, lifecycle support, HSE record, pricing model, delivery track record and data security compliance - each scored per vendor_evaluation_procedure.pdf."},
                ],
            },
            {
                "title": "Procurement Document Pack",
                "created_by": "Priya Nair",
                "messages": [
                    {"role": "user", "content": "What document pack should accompany the CX-4 evaluation?"},
                    {"role": "assistant", "content": "The pack includes the evaluation procedure reference, vendor datasheets, technical reports, dependency analysis and the security policy sign-off, ready for the procurement gate review."},
                ],
            },
            {
                "title": "Vendor Risk Mitigation",
                "created_by": "Suresh Bhat",
                "messages": [
                    {"role": "user", "content": "How do we mitigate single-vendor risk for CX-4?"},
                    {"role": "assistant", "content": "Use vendor_dependency_risk.xlsx to identify concentration, qualify a second source through the same procedure, and define supply assurance terms in line with vendor evaluation policy."},
                ],
            },
            {
                "title": "CX-4 Evaluation Outcome",
                "created_by": "Priya Nair",
                "messages": [
                    {"role": "user", "content": "What should the CX-4 evaluation outcome state?"},
                    {"role": "assistant", "content": "The outcome states the recommended vendor with scored rationale, security clearance status, dependency impact and approval route, per the MRPL evaluation procedure."},
                ],
            },
            {
                "title": "CX-4 Evidence Sources",
                "created_by": "Suresh Bhat",
                "messages": [
                    {"role": "user", "content": "List the sources used for the vendor evaluation."},
                    {"role": "assistant", "content": "Sources: vendor_evaluation_procedure.pdf, vendor_data_security_policy.pdf, vendor_dependency_risk.xlsx, P-102_vendor_technical_report_2026.pdf."},
                ],
            },
        ],
    },
    {
        "project_id": "PRJ-REF-OPT",
        "chats": [
            {
                "title": "Reformer Process Variability",
                "created_by": "Suresh Bhat",
                "messages": [
                    {"role": "user", "content": "What does the process variability data show for the reformer?"},
                    {"role": "assistant", "content": "process_variability_index.xlsx (Process_Variability) tracks the operating variability drivers that impact reformer yield; steam_system_performance.parquet provides utility performance for the energy envelope at MRPL."},
                ],
            },
            {
                "title": "Reformer Reliability Levers",
                "created_by": "Anita Rao",
                "messages": [
                    {"role": "user", "content": "Which reliability levers can optimise reformer operations?"},
                    {"role": "assistant", "content": "reliability_metrics_history.xlsx and rotating_equipment_reliability_manual.pdf show the levers: stable operation windows, rotating equipment health and reduced unplanned stops - the basis of the optimization study."},
                ],
            },
            {
                "title": "Reformer Utility Efficiency",
                "created_by": "Suresh Bhat",
                "messages": [
                    {"role": "user", "content": "How can steam and utility use be optimised for the reformer?"},
                    {"role": "assistant", "content": "steam_system_performance.parquet and electrical_supply_quality.parquet identify utility loss drivers; optimisation targets steam tie-in, condensate recovery and power quality controls within MRPL operating limits."},
                ],
            },
            {
                "title": "Reformer Risk Review",
                "created_by": "Anita Rao",
                "messages": [
                    {"role": "user", "content": "What risks constrain reformer optimisation?"},
                    {"role": "assistant", "content": "dynamic_risk_register.xlsx and integrity_risk_register.xlsx flag operating risk; abnormal operation response SOPs (abnormal_operation_response.pdf) define recovery. Any optimisation must respect the pressure/vibration bands in the pump monitoring SOP."},
                ],
            },
            {
                "title": "Optimisation Data Sources",
                "created_by": "Suresh Bhat",
                "messages": [
                    {"role": "user", "content": "Which datasets should the optimisation model use?"},
                    {"role": "assistant", "content": "process_variability_index.xlsx, steam_system_performance.parquet, reliability_metrics_history.xlsx and maintenance_pressure_index.xlsx form the input set for the reformer optimisation analysis."},
                ],
            },
            {
                "title": "Process Variability Index Use",
                "created_by": "Anita Rao",
                "messages": [
                    {"role": "user", "content": "What is the process variability index used for?"},
                    {"role": "assistant", "content": "The Process_Variability index quantifies how far operating parameters swing around targets; high variability correlates with stability and efficiency loss, so the reformer study targets the highest-index parameters first."},
                ],
            },
            {
                "title": "Reformer Instrument Health",
                "created_by": "Suresh Bhat",
                "messages": [
                    {"role": "user", "content": "Do we account for instrument reliability in optimisation?"},
                    {"role": "assistant", "content": "instrument_maintenance_history.xlsx and instrument_register.xlsx capture transmitter/valve reliability; control loop health is included so optimisation recommendations are achievable with the installed base."},
                ],
            },
            {
                "title": "Reformer KPI Dashboard",
                "created_by": "Anita Rao",
                "messages": [
                    {"role": "user", "content": "What KPIs should the reformer dashboard track?"},
                    {"role": "assistant", "content": "Track variability index, steam per tonne, reliability metrics, maintenance pressure index and integrity exceptions - all sourced from the datasets in this project's knowledge base."},
                ],
            },
            {
                "title": "Reformer Optimisation Plan",
                "created_by": "Suresh Bhat",
                "messages": [
                    {"role": "user", "content": "Draft the optimisation plan for the reformer unit."},
                    {"role": "assistant", "content": "Plan: stabilise variability (process_variability_index.xlsx), tune utilities (steam_system_performance.parquet), refresh rotating equipment reliability (reliability_metrics_history.xlsx) and close integrity exceptions, with staged implementation at MRPL."},
                ],
            },
            {
                "title": "Reformer Evidence Sources",
                "created_by": "Anita Rao",
                "messages": [
                    {"role": "user", "content": "List the knowledge base documents for this project."},
                    {"role": "assistant", "content": "Sources: process_variability_index.xlsx, steam_system_performance.parquet, reliability_metrics_history.xlsx, rotating_equipment_reliability_manual.pdf, dynamic_risk_register.xlsx."},
                ],
            },
        ],
    },
    {
        "project_id": "PRJ-HR-TRN",
        "chats": [
            {
                "title": "Training Competency Gaps",
                "created_by": "Priya Nair",
                "messages": [
                    {"role": "user", "content": "What competency gaps does the training matrix show?"},
                    {"role": "assistant", "content": "training_competency_matrix.xlsx (Training Competency Matrix) and training_competency_risk.xlsx (Training_Competency) map skills vs required levels; gaps at risk-critical roles are flagged for MRPL workforce planning."},
                ],
            },
            {
                "title": "Training Compliance Position",
                "created_by": "Anita Rao",
                "messages": [
                    {"role": "user", "content": "What is the current training compliance status?"},
                    {"role": "assistant", "content": "HR_Training_Compliance_Report.md summarises completion across mandatory training lines with MRPL_HR_Master_Data.xlsx (Training Records) as the underlying register."},
                ],
            },
            {
                "title": "Onboarding Checklist Usage",
                "created_by": "Priya Nair",
                "messages": [
                    {"role": "user", "content": "How is the onboarding checklist used for new hires?"},
                    {"role": "assistant", "content": "APEL*_Onboarding_Checklist.md documents (APEL0001-APEL0022) standardise the induction steps from access provisioning to safety induction for each new hire."},
                ],
            },
            {
                "title": "Competency Risk Review",
                "created_by": "Anita Rao",
                "messages": [
                    {"role": "user", "content": "Which roles carry competency risk for operations?"},
                    {"role": "assistant", "content": "training_competency_risk.xlsx rates the roles where missing competence raises operational risk; these feed staffing and training plans for the refinery."},
                ],
            },
            {
                "title": "Training Plan Build",
                "created_by": "Priya Nair",
                "messages": [
                    {"role": "user", "content": "Build a training plan for the current quarter."},
                    {"role": "assistant", "content": "Plan: close high-risk competency gaps (training_competency_matrix.xlsx), mandatory compliance refreshers (HR_Training_Compliance_Report.md) and onboarding for new hires (APEL*_Onboarding_Checklist.md)." },
                ],
            },
            {
                "title": "HR Training Records Query",
                "created_by": "Anita Rao",
                "messages": [
                    {"role": "user", "content": "How do we query training records per department?"},
                    {"role": "assistant", "content": "MRPL_HR_Master_Data.xlsx (Training Records) and MRPL_Employee_Directory provide the department filters; training_competency_matrix.xlsx supplies required vs attained levels per role."},
                ],
            },
            {
                "title": "Training Risk Closure",
                "created_by": "Priya Nair",
                "messages": [
                    {"role": "user", "content": "What closes the training risk items?"},
                    {"role": "assistant", "content": "Scheduling the at-risk roles into training, verifying completion in the competency matrix and updating the compliance report closes each risk item."},
                ],
            },
            {
                "title": "Onboarding Document Pack",
                "created_by": "Anita Rao",
                "messages": [
                    {"role": "user", "content": "What document pack accompanies onboarding?"},
                    {"role": "assistant", "content": "Onboarding checklist (APEL*_Onboarding_Checklist.md), offer letters (APEL*_Offer_Letter_Demo.md), employee directory entry and the induction training completion record."},
                ],
            },
            {
                "title": "Training Impact Measure",
                "created_by": "Priya Nair",
                "messages": [
                    {"role": "user", "content": "How do we measure training impact?"},
                    {"role": "assistant", "content": "Measure closure of competency matrix gaps, compliance report completion and the linked competency risk reduction from training_competency_risk.xlsx."},
                ],
            },
            {
                "title": "HR Training Sources",
                "created_by": "Anita Rao",
                "messages": [
                    {"role": "user", "content": "List the documents used for the training analysis."},
                    {"role": "assistant", "content": "Sources: training_competency_matrix.xlsx, training_competency_risk.xlsx, HR_Training_Compliance_Report.md, MRPL_HR_Master_Data.xlsx, APEL*_Onboarding_Checklist.md."},
                ],
            },
        ],
    },
    {
        "project_id": "PRJ-HR-PERF",
        "chats": [
            {
                "title": "Performance Review Cycles",
                "created_by": "Sunita Sharma",
                "messages": [
                    {"role": "user", "content": "What do the performance review documents cover at MRPL?"},
                    {"role": "assistant", "content": "APEL*_Performance_Review_Demo.md documents (e.g. APEL0005, APEL0022) capture individual review cycles including ratings, goals and development notes for employees."},
                ],
            },
            {
                "title": "Review Rating Distribution",
                "created_by": "Anita Rao",
                "messages": [
                    {"role": "user", "content": "How are review ratings distributed across the employees?"},
                    {"role": "assistant", "content": "The APEL performance review records combined with MRPL_Employee_Directory give the distribution per employee; review documents reference offer letter and personnel records for context."},
                ],
            },
            {
                "title": "Employee Record Lookup",
                "created_by": "Sunita Sharma",
                "messages": [
                    {"role": "user", "content": "How do I look up an employee's performance record?"},
                    {"role": "assistant", "content": "Employee profile documents (APEL0001_Arjun_Mehta.md style) link to the review record (APEL*_Performance_Review_Demo.md); the employee directory (MRPL_Employee_Directory.csv/pdf) provides identifiers."},
                ],
            },
            {
                "title": "Review vs Development",
                "created_by": "Anita Rao",
                "messages": [
                    {"role": "user", "content": "What do the performance reviews say about development needs?"},
                    {"role": "assistant", "content": "Review records include development notes; cross-referencing the training competency matrix shows which development areas align with role requirements."},
                ],
            },
            {
                "title": "Offer Letter Consistency",
                "created_by": "Sunita Sharma",
                "messages": [
                    {"role": "user", "content": "Are performance records consistent with offer letter data?"},
                    {"role": "assistant", "content": "Both draw on the same HR API seed data (MRPL_HR_API_Seed.json) and employee directory, so roles, departments and identifiers align across records."},
                ],
            },
            {
                "title": "Review Compliance Check",
                "created_by": "Anita Rao",
                "messages": [
                    {"role": "user", "content": "Which employees lack a completed review?"},
                    {"role": "assistant", "content": "Cross-referencing the review documents (APEL*_Performance_Review_Demo.md) against the employee directory reveals any employee without a completed cycle, to be followed up by HR."},
                ],
            },
            {
                "title": "Development Plan Builder",
                "created_by": "Sunita Sharma",
                "messages": [
                    {"role": "user", "content": "Build a development plan from the review data."},
                    {"role": "assistant", "content": "Extract each employee's development notes, align them with competency matrix gaps and schedule refresher training from the training records."},
                ],
            },
            {
                "title": "Confidential Access Rules",
                "created_by": "Anita Rao",
                "messages": [
                    {"role": "user", "content": "How is access controlled on performance records?"},
                    {"role": "assistant", "content": "Personnel and review records are restricted to HR roles by access_roles in the knowledge base; the UI surfaces them only within HR scoped projects."},
                ],
            },
            {
                "title": "Review Dashboard",
                "created_by": "Sunita Sharma",
                "messages": [
                    {"role": "user", "content": "What should the performance dashboard show?"},
                    {"role": "assistant", "content": "Rating distribution, completion status per cycle, development need clusters and links to each APEL record from the review documents."},
                ],
            },
            {
                "title": "HR Performance Sources",
                "created_by": "Anita Rao",
                "messages": [
                    {"role": "user", "content": "List the documents used for the performance analysis."},
                    {"role": "assistant", "content": "Sources: APEL*_Performance_Review_Demo.md, APEL*_Offer_Letter_Demo.md, employee profile docs (APEL*_Mehta/_Rao style), MRPL_Employee_Directory, MRPL_HR_API_Seed.json."},
                ],
            },
        ],
    },
]


PROJECT_SEED_SOURCES = {
    "PRJ-P102-REV": [
        "P-102_inspection_2024.pdf", "P-102_inspection_2025.pdf", "P-102_inspection_2026.pdf",
        "APEL-SOP-INS-221_pump_condition_monitoring.pdf", "pump_maintenance.pdf",
        "equipment_record_p-102_seal.pdf", "work_order_management.pdf",
        "reliability_events_2024.xlsx", "reliability_events_2025.xlsx", "reliability_events_2026.xlsx",
        "maintenance_master_plan.xlsx", "work_order_register.xlsx",
    ],
    "PRJ-CDU4-INSP": [
        "CDU4_maintenance_backlog.pdf", "CDU4_inspection_plan_2026.pdf", "CDU4_equipment_list.pdf",
        "equipment_record_v-201.pdf", "equipment_record_v-220.pdf", "equipment_record_d-410.pdf",
        "corrosion_thickness.pdf", "corrosion_history.xlsx", "wall_thickness_history.parquet",
    ],
    "PRJ-TA2027": [
        "annual_turnaround_plan_2027.pdf", "turnaround_strategy_2027.pdf", "work_order_management.pdf",
        "work_order_register.xlsx", "maintenance_master_plan.xlsx", "equipment_datasheets.xlsx",
    ],
    "PRJ-EP32-CUI": [
        "EP-32_cui_inspection.pdf", "EP-32_anomaly_report.pdf", "corrosion_under_insulation.pdf",
        "anomaly_event_history.parquet", "wall_thickness_history.parquet", "pipe_specifications.pdf",
    ],
    "PRJ-CX4-VEND": [
        "vendor_evaluation_procedure.pdf", "vendor_data_security_policy.pdf",
        "vendor_dependency_risk.xlsx", "vendor_registry.json", "CX4_vendor_quotes.xlsx",
    ],
    "PRJ-REF-OPT": [
        "reformer_data_sheet.pdf", "process_variability_index.xlsx", "reformer_reliability_report.pdf",
        "steam_system_performance.parquet", "reformer_heat_mass_balance.xlsx", "utility_consumption.xlsx",
    ],
    "PRJ-HR-TRN": [
        "training_competency_matrix.xlsx", "training_competency_risk.xlsx",
        "HR_Training_Compliance_Report.md", "APEL_Onboarding_Checklist.md",
    ],
    "PRJ-HR-PERF": [
        "APEL_Performance_Review_Demo.md", "APEL_Offer_Letter_Demo.md",
        "MRPL_Employee_Directory", "MRPL_HR_API_Seed.json",
    ],
}


def _curated_tokens(text):
    import re as _re
    stop = {
        "the", "and", "for", "are", "is", "was", "were", "been", "be", "do", "does",
        "did", "have", "has", "had", "this", "that", "these", "those", "with", "from",
        "across", "out", "of", "on", "in", "to", "a", "an", "against", "over", "under",
        "what", "how", "why", "which", "whose", "who", "when", "where", "into", "its",
        "at", "by", "not", "you", "your", "it", "they", "shows", "show", "going",
    }
    return {
        t for t in _re.findall(r"[a-zA-Z0-9]{2,}", (text or "").lower())
        if t not in stop and not t.isdigit()
    }


def _seed_pairs(project_id):
    pairs = []
    for proj in PROJECT_CHAT_SEEDS:
        if proj["project_id"] != project_id:
            continue
        for chat in proj.get("chats", []):
            msgs = chat.get("messages", [])
            question = next((m.get("content", "") for m in msgs if m.get("role") == "user"), "")
            answer = next((m.get("content", "") for m in msgs if m.get("role") == "assistant"), "")
            if question and answer:
                pairs.append((question, answer, chat.get("title", "")))
    return pairs


def find_curated_answer(project, query):
    """Return a complete, real-looking project answer from the curated seed Q&A.

    Used so project-chat answers come from the grounded seed content instead of a
    slow generation run each time. Falls back to None when nothing matches.
    """
    if not project or not query:
        return None
    pid = project.get("project_id")
    pairs = _seed_pairs(pid)
    if not pairs:
        return None
    qtok = _curated_tokens(query)
    if not qtok:
        return None
    best = None
    best_score = 0
    for question, answer, title in pairs:
        score = len(qtok & _curated_tokens(question))
        if score > best_score:
            best_score = score
            best = (question, answer, title)
    if best is None:
        return None
    question, answer, title = best
    return {
        "question": question,
        "answer": answer,
        "title": title,
        "sources": PROJECT_SEED_SOURCES.get(pid, []),
    }