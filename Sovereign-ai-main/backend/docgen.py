"""Template-based document generation (approval_note, technical_review,
inspection_report, risk_assessment, management_summary).

Renders to docx / xlsx / pptx / pdf / csv / json / md / txt and records an
Artifact row so every generated document is downloadable through
`/api/artifacts/{artifact_id}/download`.
"""
import csv
import io
import json
import secrets
from datetime import datetime
from pathlib import Path

from .config import ARTIFACT_STORAGE_PATH
from .database import SessionLocal
from .models import Artifact

try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib import colors
    _HAS_PDF = True
except Exception:  # pragma: no cover - reportlab is optional
    _HAS_PDF = False

SUPPORTED_TEMPLATES = {
    "approval_note": ["docx", "pdf", "txt", "md", "json"],
    "technical_review": ["docx", "pdf", "txt", "md", "json"],
    "inspection_report": ["docx", "xlsx", "pdf", "txt", "md", "json", "csv"],
    "risk_assessment": ["docx", "xlsx", "pdf", "txt", "md", "json", "csv"],
    "management_summary": ["pptx", "pdf", "docx", "md", "txt", "json"],
    # Reusable document-type set covered by the KNOVIA AI Workbench.
    "engineering_report": ["docx", "xlsx", "pdf", "txt", "md", "json", "csv"],
    "equipment_report": ["docx", "xlsx", "pdf", "txt", "md", "json", "csv"],
    "maintenance_report": ["docx", "xlsx", "pdf", "txt", "md", "json", "csv"],
    "incident_report": ["docx", "pdf", "txt", "md", "json"],
    "investigation_report": ["docx", "pdf", "txt", "md", "json"],
    "audit_report": ["docx", "xlsx", "pdf", "txt", "md", "json", "csv"],
    "compliance_report": ["docx", "pdf", "txt", "md", "json"],
    "safety_report": ["docx", "xlsx", "pdf", "txt", "md", "json", "csv"],
    "sop_procedure": ["docx", "pdf", "txt", "md", "json"],
    "operational_report": ["docx", "xlsx", "pdf", "txt", "md", "json", "csv"],
    "reliability_report": ["docx", "xlsx", "pdf", "txt", "md", "json", "csv"],
    "analysis_report": ["docx", "xlsx", "pdf", "txt", "md", "json", "csv"],
    "comparison_report": ["docx", "xlsx", "pdf", "txt", "md", "json", "csv"],
    "review_report": ["docx", "pdf", "txt", "md", "json"],
    "meeting_record": ["docx", "md", "txt", "json"],
    "project_report": ["docx", "pdf", "txt", "md", "json"],
    "data_analytics": ["xlsx", "csv", "json", "md", "txt"],
    "evidence_report": ["docx", "md", "txt", "json"],
    "knowledge_reference": ["docx", "pdf", "md", "txt", "json"],
    "action_memo": ["docx", "pdf", "md", "txt", "json"],
}

TEMPLATE_TITLES = {
    "approval_note": "Approval Note",
    "technical_review": "Technical Review",
    "inspection_report": "Inspection Report",
    "risk_assessment": "Risk Assessment",
    "management_summary": "Management Summary",
    "engineering_report": "Engineering Report",
    "equipment_report": "Equipment / Asset Report",
    "maintenance_report": "Maintenance Report",
    "incident_report": "Incident Report",
    "investigation_report": "Investigation Report",
    "audit_report": "Audit Report",
    "compliance_report": "Compliance Report",
    "safety_report": "Safety (HSE) Report",
    "sop_procedure": "SOP / Procedure Document",
    "operational_report": "Operational Report",
    "reliability_report": "Reliability Report",
    "analysis_report": "Analysis Report",
    "comparison_report": "Comparison Report",
    "review_report": "Review Document",
    "meeting_record": "Meeting / Decision Record",
    "project_report": "Project Report",
    "data_analytics": "Data / Analytics Report",
    "evidence_report": "Evidence / Source Report",
    "knowledge_reference": "Knowledge / Reference Document",
    "action_memo": "Engineering Action Memo",
}


def _ensure_storage():
    Path(ARTIFACT_STORAGE_PATH).mkdir(parents=True, exist_ok=True)


def _safe(data, key, default=""):
    val = data.get(key, default)
    if val is None:
        return default
    return val


def _markdown(data, template):
    lines = [f"# {_safe(data, 'title', TEMPLATE_TITLES[template])}"]
    for key in ("project", "unit", "asset", "date", "prepared_by"):
        if data.get(key):
            lines.append(f"\n**{key.title()}:** {data[key]}")
    if data.get("summary"):
        lines.append(f"\n## Summary\n{data['summary']}")
    if data.get("content"):
        lines.append("\n## Document Body / Full Analysis")
        for para in [p for p in str(data["content"]).split("\n") if p.strip()]:
            if para.startswith("#"):
                lines.append(f"\n{para}")
            else:
                lines.append(para)
    if data.get("findings"):
        lines.append("\n## Findings")
        for f in data["findings"]:
            status = (f.get("status") or "warning").upper()
            lines.append(f"- [{status}] {f.get('label', '')}: {f.get('value', '')}")
    if data.get("metrics"):
        lines.append("\n## Key Metrics")
        for m in data["metrics"]:
            lines.append(f"- {m.get('name', '')}: {m.get('value', '')} {m.get('unit', '')}")
    for t in data.get("tables", []):
        lines.append(f"\n## {t.get('title', 'Data table')}")
        lines.append("| " + " | ".join(t.get("headers", [])) + " |")
        lines.append("|" + "|".join(["---"] * len(t.get("headers", []))) + "|")
        for row in t.get("rows", []):
            lines.append("| " + " | ".join(str(c) for c in row) + " |")
    if data.get("recommendations"):
        lines.append("\n## Recommendations")
        for r in data["recommendations"]:
            lines.append(f"- **{r.get('priority', '')}** {r.get('action', '')}: {r.get('rationale', '')}")
    if data.get("risk_level"):
        lines.append(f"\n**Risk Level:** {data['risk_level']}")
    if data.get("calcs"):
        lines.append("\n## Calculations")
        for c in data["calcs"]:
            lines.append(f"- {c.get('description', 'Calculation')}: {c.get('expr', '')} = **{c.get('result', '')}**")
    if data.get("conclusions"):
        lines.append("\n## Conclusion")
        for c in data["conclusions"]:
            text = c.get("text", "") if isinstance(c, dict) else str(c)
            lines.append(f"- {text}")
    if data.get("sources"):
        lines.append("\n## Evidence / Sources Used")
        for s in data["sources"]:
            doc_name = s.get("document", s.get("title", ""))
            meta = s.get("source_type", "Document")
            if s.get("year"):
                meta += f", {s['year']}"
            ref = f" | Ref: {s.get('reference_id')}" if s.get("reference_id") else ""
            lines.append(f"- **{doc_name}** ({meta}){ref}")
            if s.get("snippet"):
                lines.append(f"  > {s['snippet']}")
    lines.append("\n---\nGenerated by MRPL KNOVIA AI (automated draft).")
    return "\n".join(lines)


def _render_docx(data, template, path):
    from docx import Document
    doc = Document()
    doc.add_heading(_safe(data, "title", TEMPLATE_TITLES[template]), 0)
    for key in ("project", "unit", "asset", "date", "prepared_by"):
        if data.get(key):
            doc.add_paragraph(f"{key.title()}: {data[key]}")
    if data.get("summary"):
        doc.add_heading("Summary", level=1)
        doc.add_paragraph(data["summary"])
    if data.get("content"):
        doc.add_heading("Document Body / Full Analysis", level=1)
        for para in [p for p in str(data["content"]).split("\n") if p.strip()]:
            if para.startswith("#"):
                cleaned = para.lstrip("# ").strip()
                if cleaned:
                    doc.add_heading(cleaned, level=2)
            else:
                doc.add_paragraph(para)
    if data.get("findings"):
        doc.add_heading("Findings", level=1)
        for f in data["findings"]:
            p = doc.add_paragraph()
            p.add_run(f"[{str(f.get('status', 'warning')).upper()}] {f.get('label', '')}: ")
            p.add_run(str(f.get("value", ""))).bold = True
    if data.get("metrics"):
        doc.add_heading("Key Metrics", level=1)
        for m in data["metrics"]:
            doc.add_paragraph(f"{m.get('name', '')}: {m.get('value', '')} {m.get('unit', '')}")
    for t in data.get("tables", []):
        doc.add_heading(t.get("title", "Data table"), level=2)
        table = doc.add_table(rows=1, cols=len(t.get("headers", [])))
        table.style = "Light Grid"
        for j, h in enumerate(t.get("headers", [])):
            table.rows[0].cells[j].text = str(h)
        for row in t.get("rows", []):
            cells = table.add_row().cells
            for j, c in enumerate(row):
                if j < len(cells):
                    cells[j].text = str(c)
    if data.get("recommendations"):
        doc.add_heading("Recommendations", level=1)
        for r in data["recommendations"]:
            doc.add_paragraph(f"[{r.get('priority', '')}] {r.get('action', '')} — {r.get('rationale', '')}")
    if data.get("risk_level"):
        doc.add_heading("Risk Assessment", level=1)
        doc.add_paragraph(f"Risk Level: {data['risk_level']}")
    if data.get("calcs"):
        doc.add_heading("Calculations", level=1)
        for c in data["calcs"]:
            doc.add_paragraph(f"{c.get('description', 'Calculation')}: {c.get('expr', '')} = {c.get('result', '')}")
    if data.get("conclusions"):
        doc.add_heading("Conclusion", level=1)
        for c in data["conclusions"]:
            text = c.get("text", "") if isinstance(c, dict) else str(c)
            doc.add_paragraph(text)
    if data.get("sources"):
        doc.add_heading("Evidence / Sources Used", level=1)
        for s in data["sources"]:
            doc_name = s.get("document", s.get("title", ""))
            meta = s.get("source_type", "Document")
            if s.get("year"):
                meta += f", {s['year']}"
            if s.get("reference_id"):
                meta += f" | Ref: {s['reference_id']}"
            p = doc.add_paragraph()
            p.add_run(f"• {doc_name}").bold = True
            p.add_run(f" ({meta})")
            if s.get("snippet"):
                p2 = doc.add_paragraph(s["snippet"])
                if "Quote" in (st.name for st in doc.styles):
                    p2.style = "Quote"
    doc.add_paragraph("")
    doc.add_paragraph("Generated by MRPL KNOVIA AI (automated draft).")
    doc.save(path)


def _render_xlsx(data, template, path):
    from openpyxl import Workbook
    wb = Workbook()
    ws = wb.active
    ws.title = "Summary"
    ws["A1"] = _safe(data, "title", TEMPLATE_TITLES[template])
    ws["A1"].font = ws["A1"].font.copy(bold=True, size=14)
    row = 3
    for key in ("project", "unit", "asset", "date", "prepared_by"):
        if data.get(key):
            ws.cell(row=row, column=1, value=f"{key.title()}")
            ws.cell(row=row, column=2, value=str(data[key]))
            row += 1
    if data.get("findings"):
        row += 1
        ws.cell(row=row, column=1, value="Findings").font = ws.cell(row=row, column=1).font.copy(bold=True)
        row += 1
        for f in data["findings"]:
            ws.cell(row=row, column=1, value=str(f.get("label", "")))
            ws.cell(row=row, column=2, value=str(f.get("value", "")))
            ws.cell(row=row, column=3, value=str(f.get("status", "")).upper())
            row += 1
    for t in data.get("tables", []):
        ws2 = wb.create_sheet(t.get("title", "Data")[:31] or "Data")
        for j, h in enumerate(t.get("headers", []), start=1):
            ws2.cell(row=1, column=j, value=str(h))
        for i, r in enumerate(t.get("rows", []), start=2):
            for j, c in enumerate(r, start=1):
                ws2.cell(row=i, column=j, value=c if not isinstance(c, str) or not c.isdigit() else int(c))
    if data.get("calcs"):
        ws3 = wb.create_sheet("Calculations")
        ws3.cell(row=1, column=1, value="Description")
        ws3.cell(row=1, column=2, value="Expression")
        ws3.cell(row=1, column=3, value="Result")
        for i, c in enumerate(data["calcs"], start=2):
            ws3.cell(row=i, column=1, value=str(c.get("description", "")))
            ws3.cell(row=i, column=2, value=str(c.get("expr", "")))
            ws3.cell(row=i, column=3, value=str(c.get("result", "")))
    if data.get("sources"):
        ws4 = wb.create_sheet("Evidence")
        ws4.cell(row=1, column=1, value="Document")
        ws4.cell(row=1, column=2, value="Type")
        ws4.cell(row=1, column=3, value="Year")
        ws4.cell(row=1, column=4, value="Reference")
        ws4.cell(row=1, column=5, value="Snippet")
        for i, s in enumerate(data["sources"], start=2):
            ws4.cell(row=i, column=1, value=str(s.get("document", s.get("title", ""))))
            ws4.cell(row=i, column=2, value=str(s.get("source_type", "")))
            ws4.cell(row=i, column=3, value=str(s.get("year", "")))
            ws4.cell(row=i, column=4, value=str(s.get("reference_id", "")))
            ws4.cell(row=i, column=5, value=str(s.get("snippet", ""))[:1000])
    if data.get("conclusions"):
        ws5 = wb.create_sheet("Conclusion")
        for i, c in enumerate(data["conclusions"], start=1):
            text = c.get("text", "") if isinstance(c, dict) else str(c)
            ws5.cell(row=i, column=1, value=str(text))
    wb.save(path)


def _render_pptx(data, template, path):
    from pptx import Presentation
    prs = Presentation()
    title_slide = prs.slides.add_slide(prs.slide_layouts[0])
    title_slide.shapes.title.text = _safe(data, "title", TEMPLATE_TITLES[template])
    if data.get("subtitle"):
        title_slide.placeholders[1].text = data["subtitle"]
    sections = [("Summary", [data.get("summary", "")])] if data.get("summary") else []
    if data.get("content"):
        paras = [p for p in str(data["content"]).split("\n") if p.strip()]
        if paras:
            sections.insert(0, ("Document Body / Full Analysis", paras[:12]))
    if data.get("findings"):
        sections.append(("Key Findings", [f"[{str(f.get('status', '')).upper()}] {f.get('label', '')}: {f.get('value', '')}" for f in data["findings"]]))
    if data.get("metrics"):
        sections.append(("Key Metrics", [f"{m.get('name', '')}: {m.get('value', '')} {m.get('unit', '')}" for m in data["metrics"]]))
    if data.get("recommendations"):
        sections.append(("Recommendations", [f"{r.get('priority', '')} — {r.get('action', '')}" for r in data["recommendations"]]))
    if data.get("risk_level"):
        sections.append(("Risk Assessment", [f"Risk Level: {data['risk_level']}"]))
    if data.get("calcs"):
        sections.append(("Calculations", [f"{c.get('description', 'Calc')}: {c.get('expr', '')} = {c.get('result', '')}" for c in data["calcs"]]))
    if data.get("conclusions"):
        sections.append(("Conclusion", [c.get("text", "") if isinstance(c, dict) else str(c) for c in data["conclusions"]]))
    if data.get("sources"):
        sections.append(("Evidence / Sources Used", [f"{s.get('document', s.get('title', ''))} ({s.get('source_type', '')})" for s in data["sources"]]))

    if not sections:
        sections.append(("Overview", ["Draft generated by MRPL KNOVIA AI."]))
    for heading, points in sections:
        slide = prs.slides.add_slide(prs.slide_layouts[1])
        slide.shapes.title.text = heading
        tf = slide.placeholders[1].text_frame
        tf.text = points[0] if points else ""
        for p in points[1:]:
            para = tf.add_paragraph()
            para.text = p
    prs.save(path)


def _render_pdf(data, template, path):
    if not _HAS_PDF:
        raise ValueError("PDF rendering unavailable (reportlab not installed)")
    styles = getSampleStyleSheet()
    doc = SimpleDocTemplate(str(path), pagesize=A4)
    story = [Paragraph(_safe(data, "title", TEMPLATE_TITLES[template]), styles["Title"])]
    for key in ("project", "unit", "asset", "date", "prepared_by"):
        if data.get(key):
            story.append(Paragraph(f"<b>{key.title()}:</b> {data[key]}", styles["Normal"]))
    if data.get("summary"):
        story.append(Paragraph("<b>Summary</b>", styles["Heading2"]))
        story.append(Paragraph(data["summary"], styles["BodyText"]))
    if data.get("content"):
        story.append(Paragraph("<b>Document Body / Full Analysis</b>", styles["Heading2"]))
        for para in [p for p in str(data["content"]).split("\n") if p.strip()]:
            if para.startswith("#"):
                story.append(Paragraph(para.lstrip("# ").strip(), styles["Heading3"]))
            else:
                story.append(Paragraph(para, styles["BodyText"]))
    if data.get("findings"):
        story.append(Paragraph("<b>Findings</b>", styles["Heading2"]))
        for f in data["findings"]:
            story.append(Paragraph(f"[{str(f.get('status', '')).upper()}] {f.get('label', '')}: {f.get('value', '')}", styles["BodyText"]))
    for t in data.get("tables", []):
        story.append(Paragraph(f"<b>{t.get('title', 'Data table')}</b>", styles["Heading2"]))
        table_data = [t.get("headers", [])] + [list(r) for r in t.get("rows", [])]
        table = Table(table_data)
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.whitesmoke),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
        ]))
        story.append(table)
        story.append(Spacer(1, 12))
    if data.get("recommendations"):
        story.append(Paragraph("<b>Recommendations</b>", styles["Heading2"]))
        for r in data["recommendations"]:
            story.append(Paragraph(f"[{r.get('priority', '')}] {r.get('action', '')} — {r.get('rationale', '')}", styles["BodyText"]))
    if data.get("risk_level"):
        story.append(Paragraph("<b>Risk Assessment</b>", styles["Heading2"]))
        story.append(Paragraph(f"Risk Level: {data['risk_level']}", styles["BodyText"]))
    if data.get("calcs"):
        story.append(Paragraph("<b>Calculations</b>", styles["Heading2"]))
        for c in data["calcs"]:
            story.append(Paragraph(f"{c.get('description', 'Calculation')}: {c.get('expr', '')} = <b>{c.get('result', '')}</b>", styles["BodyText"]))
    if data.get("conclusions"):
        story.append(Paragraph("<b>Conclusion</b>", styles["Heading2"]))
        for c in data["conclusions"]:
            text = c.get("text", "") if isinstance(c, dict) else str(c)
            story.append(Paragraph(text, styles["BodyText"]))
    if data.get("sources"):
        story.append(Paragraph("<b>Evidence / Sources Used</b>", styles["Heading2"]))
        for s in data["sources"]:
            doc_name = s.get("document", s.get("title", ""))
            meta = s.get("source_type", "Document")
            if s.get("year"):
                meta += f", {s['year']}"
            if s.get("reference_id"):
                meta += f" | Ref: {s['reference_id']}"
            story.append(Paragraph(f"<b>{doc_name}</b> ({meta})", styles["BodyText"]))
            if s.get("snippet"):
                story.append(Paragraph(s["snippet"], styles["BodyText"]))
    story.append(Spacer(1, 24))
    story.append(Paragraph("Generated by MRPL KNOVIA AI (automated draft).", styles["BodyText"]))
    doc.build(story)


def generate_document(template, data, fmt="docx"):
    """Render a templated document, persist an Artifact row, return metadata."""
    template = str(template or "").strip().lower()
    fmt = str(fmt or "docx").strip().lower()
    if template not in SUPPORTED_TEMPLATES:
        raise ValueError(f"Unsupported template '{template}'. Choose from: {', '.join(SUPPORTED_TEMPLATES)}")
    if fmt not in SUPPORTED_TEMPLATES[template]:
        raise ValueError(f"Template '{template}' does not support format '{fmt}'. Choose from: {', '.join(SUPPORTED_TEMPLATES[template])}")

    _ensure_storage()
    artifact_id = "ART-" + secrets.token_hex(5).upper()
    ext = "pptx" if fmt == "pptx" else fmt
    file_title = _safe(data, "file_title", "")
    safe_title = re_sub(file_title or _safe(data, "title", TEMPLATE_TITLES[template]))
    name = f"{safe_title or 'document'}.{ext}"
    filepath = Path(ARTIFACT_STORAGE_PATH) / f"{artifact_id}.{ext}"

    if fmt == "docx":
        _render_docx(data, template, filepath)
    elif fmt == "xlsx":
        _render_xlsx(data, template, filepath)
    elif fmt == "pptx":
        _render_pptx(data, template, filepath)
    elif fmt == "pdf":
        _render_pdf(data, template, filepath)
    elif fmt == "csv":
        rows = [data.get("tables", [{}])[0].get("headers", [])] if data.get("tables") else []
        if data.get("tables"):
            rows += data["tables"][0].get("rows", [])
        if not rows:
            rows = [["field", "value"], *[[k, str(v)] for k, v in data.items() if isinstance(v, (str, int, float))]]
        with open(filepath, "w", newline="") as fh:
            writer = csv.writer(fh)
            writer.writerows(rows)
    elif fmt == "json":
        with open(filepath, "w") as fh:
            json.dump({"template": template, **data, "generated_by": "MRPL KNOVIA AI"}, fh, indent=2)
    else:  # md / txt
        with open(filepath, "w") as fh:
            fh.write(_markdown(data, template))

    session = SessionLocal()
    try:
        artifact = Artifact(
            artifact_id=artifact_id,
            name=name,
            artifact_type="PRESENTATION" if fmt == "pptx" else ("SPREADSHEET" if fmt in ("xlsx", "csv") else "DOCUMENT"),
            format=fmt.upper(),
            file_path=str(filepath),
            status="READY_FOR_REVIEW",
            classification="CONFIDENTIAL",
        )
        session.add(artifact)
        session.commit()
        session.refresh(artifact)
    finally:
        session.close()

    return {
        "artifact_id": artifact_id,
        "name": name,
        "format": fmt.upper(),
        "file_path": str(filepath),
        "download_url": f"/api/artifacts/{artifact_id}/download",
        "template": template,
    }


def re_sub(title):
    import re
    return re.sub(r"[^A-Za-z0-9_.\- ]+", "", title).strip().replace(" ", "_")[:60]