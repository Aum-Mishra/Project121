import io
from typing import Dict, Any, List, Optional

SECTION_TEMPLATES: Dict[str, List[str]] = {
    "approval_note": [
        "Document Control",
        "Subject",
        "Background",
        "Evidence",
        "Technical Assessment",
        "Risk",
        "Recommendation",
        "Approval Requested",
        "References",
        "AI Provenance",
    ],
    "technical_review": [
        "Problem Statement",
        "Asset Context",
        "Inputs",
        "Applicable Documents",
        "Historical Comparison",
        "Calculations",
        "Conflicts and Uncertainty",
        "Conclusion",
        "Recommendation",
        "Reviewer",
    ],
    "inspection_report": [
        "Document Control",
        "Scope",
        "Method",
        "Measurements",
        "Findings",
        "Historical Comparison",
        "Assessment",
        "Recommendation",
        "Sign-off",
    ],
    "standard_operating_procedure": [
        "Document Control",
        "Purpose & Objectives",
        "Scope & Applicability",
        "Responsibilities & Personnel",
        "Safety Precautions & PPE",
        "Prerequisites & Equipment",
        "Step-by-Step Procedure",
        "Emergency Shutdown & Contingency",
        "Verification & Log Sign-off",
    ],
    "engineering_change_request": [
        "Document Control",
        "Change Title & Reference",
        "Asset / System Affected",
        "Reason for Change",
        "Technical Specification",
        "Safety, Health & Environmental Impact",
        "Cost & Resource Estimates",
        "Implementation Schedule",
        "Review & Approval Sign-offs",
    ],
    "root_cause_analysis": [
        "Incident Overview",
        "Asset Details & Operating Conditions",
        "Sequence of Events & Timeline",
        "Methodology & Failure Mode Analysis",
        "Root Cause Identification",
        "Contributing Factors",
        "Corrective & Preventive Actions (CAPA)",
        "Reviewer & Engineering Sign-off",
    ],
    "work_order_summary": [
        "Work Order Header",
        "Equipment & Asset Details",
        "Scope of Maintenance",
        "Required Tools, Spares & Materials",
        "Permit to Work & Isolation Steps",
        "Execution Steps & Measurements",
        "Post-Maintenance Verification",
        "Sign-off & Handover",
    ],
}

RISK_ASSESSMENT_SHEETS: List[str] = ["Summary", "Hazards", "Controls", "Risk Matrix", "Approvals"]

MANAGEMENT_SUMMARY_SLIDES: List[str] = [
    "Executive Summary",
    "Key Findings",
    "Historical Trend",
    "Risk",
    "Recommendation",
    "Decision Required",
    "Evidence",
]


def _extract_sections(data: Dict[str, Any]) -> Dict[str, Any]:
    sections = data.get("sections")
    if isinstance(sections, dict):
        return sections
    return {}


def generate_docx_bytes(template: str, data: Dict[str, Any]) -> bytes:
    from docx import Document as DocxDocument
    from docx.shared import Pt
    import io

    doc = DocxDocument()
    style = doc.styles["Normal"]
    font = style.font
    font.name = "Calibri"
    font.size = Pt(11)

    doc.add_heading(data.get("title") or template.replace("_", " ").title(), 0)

    sections = _extract_sections(data)
    if not sections:
        for key, value in data.items():
            if key in ("title", "format", "template"):
                continue
            p = doc.add_paragraph()
            p.add_run(f"{key}: ").bold = True
            p.add_run(str(value))
        buffer = io.BytesIO()
        doc.save(buffer)
        return buffer.getvalue()

    section_names = SECTION_TEMPLATES.get(template, SECTION_TEMPLATES.get("approval_note", []))
    for name in section_names:
        content = sections.get(name)
        if content is None and not any(k.lower() == name.lower() for k in sections):
            continue
        doc.add_heading(name, 1)
        if isinstance(content, list):
            for item in content:
                doc.add_paragraph(f"- {item}", style="List Bullet")
        elif content:
            doc.add_paragraph(str(content))

    for extra_name, content in sections.items():
        if extra_name.lower() not in [k.lower() for k in section_names]:
            doc.add_heading(extra_name, 1)
            if isinstance(content, list):
                for item in content:
                    doc.add_paragraph(f"- {item}", style="List Bullet")
            elif content:
                doc.add_paragraph(str(content))

    buffer = io.BytesIO()
    doc.save(buffer)
    return buffer.getvalue()


def generate_xlsx_bytes(template: str, data: Dict[str, Any]) -> bytes:
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill
    import io

    wb = Workbook()
    ws_initial = wb.active

    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")

    if template == "risk_assessment":
        sheets = data.get("sheets")
        if isinstance(sheets, dict):
            ws_initial.title = "Summary"
            for sheet_name, sheet_data in sheets.items():
                if sheet_name not in ["Summary", "Hazards", "Controls", "Risk Matrix", "Approvals"]:
                    continue
                ws = wb[sheet_name] if sheet_name == "Summary" else wb.create_sheet(sheet_name)
                if isinstance(sheet_data, dict):
                    headers = sheet_data.get("headers") or (list(sheet_data.get("rows")[0].keys()) if sheet_data.get("rows") else [])
                    rows = sheet_data.get("rows") or []
                else:
                    headers = []
                    rows = sheet_data or []
                if isinstance(rows, list) and rows and isinstance(rows[0], dict):
                    headers = list(rows[0].keys())
                if headers:
                    ws.append(headers)
                    for cell in ws[1]:
                        cell.font = header_font
                        cell.fill = header_fill
                for row in rows:
                    if isinstance(row, dict):
                        ws.append([row.get(h, "") for h in headers])
                    elif isinstance(row, (list, tuple)):
                        ws.append(list(row))
            wb.save(io_bytes := io.BytesIO())
            return io_bytes.getvalue()

        ws_initial.title = "Risk Assessment"
        rows = data.get("rows", [])
        if rows and isinstance(rows[0], dict):
            headers = list(rows[0].keys())
            ws_initial.append(headers)
            for cell in ws_initial[1]:
                cell.font = header_font
                cell.fill = header_fill
            for row in rows:
                ws_initial.append([row.get(h, "") for h in headers])
        else:
            ws_initial.append(["Parameter", "Value", "Limit", "Status", "Unit"])
            for cell in ws_initial[1]:
                cell.font = header_font
                cell.fill = header_fill
            for row in rows:
                if isinstance(row, dict):
                    ws_initial.append([row.get("parameter"), row.get("value"), row.get("limit"), row.get("status"), row.get("unit")])

        for column in ws_initial.columns:
            max_length = max(len(str(cell.value or "")) for cell in column)
            ws_initial.column_dimensions[column[0].column_letter].width = min(max_length + 2, 50)
        wb.save(io_bytes := io.BytesIO())
        return io_bytes.getvalue()

    ws_initial.append(["Field", "Value"])
    for cell in ws_initial[1]:
        cell.font = header_font
        cell.fill = header_fill
    for key, value in data.items():
        if key in ("title", "format", "template", "sheets", "rows"):
            continue
        ws_initial.append([key, str(value)])

    for column in ws_initial.columns:
        max_length = max(len(str(cell.value or "")) for cell in column)
        ws_initial.column_dimensions[column[0].column_letter].width = min(max_length + 2, 50)

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def generate_pptx_bytes(template: str, data: Dict[str, Any]) -> bytes:
    from pptx import Presentation
    from pptx.util import Inches, Pt
    from pptx.dml.color import RGBColor
    import io

    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)

    slides = data.get("slides")
    if template == "management_summary" and isinstance(slides, dict):
        for slide_title, content in slides.items():
            layout = prs.slide_layouts[5]
            slide = prs.slides.add_slide(layout)
            title_shape = slide.shapes.title
            if title_shape:
                title_shape.text = slide_title
                title_shape.text_frame.paragraphs[0].font.size = Pt(28)
                title_shape.text_frame.paragraphs[0].font.color.rgb = RGBColor(0x1A, 0x3C, 0x5E)
            txBox = slide.shapes.add_textbox(Inches(0.5), Inches(1.5), Inches(12), Inches(5.5))
            tf = txBox.text_frame
            tf.word_wrap = True
            items = content if isinstance(content, list) else [str(content)]
            for i, item in enumerate(items):
                p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
                p.text = f"• {item}"
                p.font.size = Pt(14)
                p.space_after = Pt(6)
    else:
        slide_layout = prs.slide_layouts[5]
        slide = prs.slides.add_slide(slide_layout)
        title_shape = slide.shapes.title
        if title_shape:
            title_shape.text = data.get("title") or template.replace("_", " ").title()
            title_shape.text_frame.paragraphs[0].font.size = Pt(28)
            title_shape.text_frame.paragraphs[0].font.color.rgb = RGBColor(0x1A, 0x3C, 0x5E)
        content = data.get("content", data)
        left = Inches(0.5)
        top = Inches(1.5)
        width = Inches(12)
        height = Inches(5.5)
        txBox = slide.shapes.add_textbox(left, top, width, height)
        tf = txBox.text_frame
        tf.word_wrap = True
        if isinstance(content, dict):
            for key, value in content.items():
                p = tf.add_paragraph()
                p.text = f"{key}: {value}"
                p.font.size = Pt(14)
                p.space_after = Pt(6)
        elif isinstance(content, list):
            for item in content:
                p = tf.add_paragraph()
                p.text = f"• {item}"
                p.font.size = Pt(14)
                p.space_after = Pt(6)

    buffer = io.BytesIO()
    prs.save(buffer)
    return buffer.getvalue()


def generate_pdf_bytes(template: str, data: Dict[str, Any]) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    import io

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=inch, leftMargin=inch, topMargin=inch, bottomMargin=inch)
    styles = getSampleStyleSheet()
    story = []

    title_style = ParagraphStyle("CustomTitle", parent=styles["Title"], fontSize=18, spaceAfter=12)
    story.append(Paragraph(data.get("title") or template.replace("_", " ").title(), title_style))
    story.append(Spacer(1, 12))

    sections = _extract_sections(data)
    if sections:
        section_names = SECTION_TEMPLATES.get(template, SECTION_TEMPLATES.get("approval_note", []))
        rendered = 0
        for name in section_names:
            content = sections.get(name)
            if content is None:
                continue
            story.append(Paragraph(f"<b>{name}</b>", styles["Heading2"]))
            if isinstance(content, list):
                for item in content:
                    story.append(Paragraph(f"• {str(item)}", styles["Normal"]))
            else:
                story.append(Paragraph(str(content), styles["Normal"]))
            story.append(Spacer(1, 8))
            rendered += 1
        if rendered == 0:
            for item in sections.items():
                story.append(Paragraph(f"<b>{item[0]}:</b> {item[1]}", styles["Normal"]))
                story.append(Spacer(1, 6))
    else:
        for key, value in data.items():
            if key in ("title", "format", "template"):
                continue
            story.append(Paragraph(f"<b>{key}:</b> {value}", styles["Normal"]))
            story.append(Spacer(1, 6))

    doc.build(story)
    return buffer.getvalue()


def render_document(template: str, format: str, data: Dict[str, Any]) -> bytes:
    ext = format.lower()
    if ext == "docx":
        return generate_docx_bytes(template, data)
    if ext == "xlsx":
        return generate_xlsx_bytes(template, data)
    if ext == "pptx":
        return generate_pptx_bytes(template, data)
    if ext == "pdf":
        return generate_pdf_bytes(template, data)
    if ext == "txt":
        return generate_txt_bytes(template, data)
    if ext in ("json",):
        return generate_json_bytes(template, data)
    if ext in ("md", "markdown"):
        return generate_markdown_bytes(template, data)
    if ext in ("csv",):
        return generate_csv_bytes(template, data)
    raise ValueError(f"Unsupported format: {format}")


def extract_document_data(file_path: str, format: str) -> Dict[str, Any]:
    """Reverse-render a generated artifact back into structured data so it can be
    converted to another format or updated without losing content."""
    ext = (format or "").lower()
    try:
        if ext == "docx":
            from docx import Document as DocxDocument
            d = DocxDocument(file_path)
            title = ""
            sections: Dict[str, Any] = {}
            current = None
            for para in d.paragraphs:
                text = para.text.strip()
                if not text:
                    continue
                style = (para.style.name or "").lower()
                if para.style.name and para.style.name.startswith("Heading") or text.isupper():
                    if para.style.name and para.style.name.startswith("Heading 1"):
                        current = text
                        sections[current] = []
                    else:
                        current = text
                        sections[current] = []
                    if not title:
                        title = text
                elif current:
                    if isinstance(sections[current], list):
                        sections[current].append(text)
                else:
                    if not title:
                        title = text
            return {"title": title, "sections": {k: (v if isinstance(v, list) else v) for k, v in sections.items()}}

        if ext == "xlsx":
            from openpyxl import load_workbook
            wb = load_workbook(file_path, read_only=True, data_only=True)
            sheets: Dict[str, Any] = {}
            for ws in wb.worksheets:
                rows = [[c for c in row] for row in ws.iter_rows(values_only=True)]
                headers = rows[0] if rows else []
                sheets[ws.title] = {"headers": list(headers), "rows": [list(r) for r in rows[1:]]}
            return {"title": wb.worksheets[0].title if wb.worksheets else "", "sheets": sheets}

        if ext == "pptx":
            from pptx import Presentation
            prs = Presentation(file_path)
            slides: Dict[str, Any] = {}
            for idx, slide in enumerate(prs.slides, start=1):
                title = ""
                bullets: List[str] = []
                for shape in slide.shapes:
                    if not hasattr(shape, "text"):
                        continue
                    text = shape.text.strip()
                    if not text:
                        continue
                    if shape == slide.shapes.title:
                        title = text
                    else:
                        bullets.extend(line[2:] if line.startswith("• ") else line for line in text.splitlines())
                slides[title or f"Slide {idx}"] = bullets or [text]
            return {"title": next(iter(slides), ""), "slides": slides}

        if ext == "csv":
            import csv as _csv
            with open(file_path, newline="", encoding="utf-8", errors="replace") as f:
                reader = _csv.reader(f)
                rows = [row for row in reader if row]
            if not rows:
                return {}
            title_row = rows.pop(0) if rows else []
            if title_row == ["Field", "Value"]:
                data: Dict[str, Any] = {}
                for row in rows:
                    if len(row) >= 2:
                        data[row[0]] = row[1:]
                return {"title": "", "rows": rows}
            return {"title": "", "rows": rows}

        if ext == "md":
            with open(file_path, encoding="utf-8", errors="replace") as f:
                lines = f.read().splitlines()
            title = ""
            sections: Dict[str, Any] = {}
            current = None
            for line in lines:
                if line.startswith("# "):
                    title = line[2:].strip()
                elif line.startswith("## "):
                    current = line[3:].strip()
                    sections[current] = []
                elif current and line.strip():
                    sections[current].append(line.strip())
            return {"title": title, "sections": sections}

        if ext == "txt":
            with open(file_path, encoding="utf-8", errors="replace") as f:
                raw = f.read()
            return {"title": "", "content": raw}

        if ext == "json":
            import json as _json
            with open(file_path, encoding="utf-8", errors="replace") as f:
                return _json.load(f)

        if ext == "pdf":
            try:
                from pypdf import PdfReader
            except Exception:
                from PyPDF2 import PdfReader
            reader = PdfReader(file_path)
            text = "\n".join((page.extract_text() or "") for page in reader.pages)
            return {"title": "", "sections": {"Extracted Text": [line for line in text.splitlines() if line.strip()]}}

    except Exception as e:
        print(f"extract_document_data({ext}) failed: {e}")
    return {}


def generate_txt_bytes(template: str, data: Dict[str, Any]) -> bytes:
    lines: List[str] = []
    lines.append(data.get("title") or template.replace("_", " ").title())
    lines.append("=" * 60)
    sections = _extract_sections(data)
    if sections:
        for name, content in sections.items():
            lines.append("")
            lines.append(name)
            lines.append("-" * 40)
            if isinstance(content, list):
                lines.extend(f"- {item}" for item in content)
            else:
                lines.append(str(content))
    else:
        for key, value in data.items():
            if key in ("title", "format", "template"):
                continue
            lines.append(f"{key}: {value}")
    return ("\n".join(lines) + "\n").encode("utf-8")


def generate_json_bytes(template: str, data: Dict[str, Any]) -> bytes:
    import json as _json
    payload = dict(data)
    payload.pop("format", None)
    payload.pop("template", None)
    return _json.dumps(payload, indent=2, ensure_ascii=False).encode("utf-8")


def generate_markdown_bytes(template: str, data: Dict[str, Any]) -> bytes:
    md: List[str] = []
    md.append(f"# {data.get('title') or template.replace('_', ' ').title()}")
    md.append("")
    sections = _extract_sections(data)
    if sections:
        for name, content in sections.items():
            md.append(f"## {name}")
            md.append("")
            if isinstance(content, list):
                md.extend(f"- {item}" for item in content)
            else:
                md.append(str(content))
            md.append("")
    else:
        for key, value in data.items():
            if key in ("title", "format", "template"):
                continue
            md.append(f"**{key}:** {value}")
            md.append("")
    return ("\n".join(md).rstrip() + "\n").encode("utf-8")


def generate_csv_bytes(template: str, data: Dict[str, Any]) -> bytes:
    import csv as _csv
    import io as _io
    buffer = _io.StringIO()
    writer = _csv.writer(buffer)
    rows = data.get("rows") or data.get("data") or []
    if rows and isinstance(rows[0], dict):
        headers = list(rows[0].keys())
        writer.writerow(headers)
        for row in rows:
            writer.writerow([row.get(h, "") for h in headers])
    elif rows:
        for row in rows:
            writer.writerow(row)
    else:
        writer.writerow(["Field", "Value"])
        for key, value in data.items():
            if key in ("format", "template", "rows", "data"):
                continue
            if isinstance(value, (dict, list)):
                value = "; ".join(str(v) for v in value.values()) if isinstance(value, dict) else "; ".join(str(v) for v in value)
            writer.writerow([key, value])
    return buffer.getvalue().encode("utf-8")


SUPPORTED_TEMPLATES = {
    "approval_note": ["docx", "pdf", "txt", "json", "md", "csv", "xlsx", "pptx"],
    "technical_review": ["docx", "pdf", "txt", "json", "md", "csv", "xlsx", "pptx"],
    "inspection_report": ["docx", "pdf", "txt", "json", "md", "csv", "xlsx", "pptx"],
    "standard_operating_procedure": ["docx", "pdf", "txt", "json", "md", "csv", "xlsx", "pptx"],
    "engineering_change_request": ["docx", "pdf", "txt", "json", "md", "csv", "xlsx", "pptx"],
    "root_cause_analysis": ["docx", "pdf", "txt", "json", "md", "csv", "xlsx", "pptx"],
    "work_order_summary": ["docx", "pdf", "txt", "json", "md", "csv", "xlsx", "pptx"],
    "risk_assessment": ["xlsx", "csv", "json", "md", "txt"],
    "management_summary": ["pptx", "pdf", "docx", "md", "txt", "json"],
}


def parse_artifact_text(file_path: str, artifact_type: Any) -> str:
    """Extracts plain text representation from an artifact file for diffing and preview."""
    import os
    if not file_path or not os.path.exists(file_path):
        return ""
    ext = (artifact_type.value if hasattr(artifact_type, "value") else str(artifact_type)).lower()
    if ext in ("txt", "md", "json", "csv"):
        try:
            with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                return f.read()
        except Exception:
            return ""
    if ext == "docx":
        try:
            from docx import Document as DocxDocument
            d = DocxDocument(file_path)
            lines = [p.text for p in d.paragraphs if p.text.strip()]
            for t in d.tables:
                for row in t.rows:
                    lines.append(" | ".join(c.text for c in row.cells))
            return "\n".join(lines)
        except Exception:
            return ""
    if ext == "pdf":
        try:
            import fitz
            doc = fitz.open(file_path)
            return "\n".join(page.get_text() for page in doc)
        except Exception:
            try:
                from pypdf import PdfReader
                reader = PdfReader(file_path)
                return "\n".join((p.extract_text() or "") for p in reader.pages)
            except Exception:
                return ""
    if ext == "xlsx":
        try:
            from openpyxl import load_workbook
            wb = load_workbook(file_path, read_only=True, data_only=True)
            lines = []
            for sheet in wb.worksheets:
                lines.append(f"=== Sheet: {sheet.title} ===")
                for row in sheet.iter_rows(values_only=True):
                    lines.append(" | ".join("" if c is None else str(c) for c in row))
            return "\n".join(lines)
        except Exception:
            return ""
    if ext == "pptx":
        try:
            from pptx import Presentation
            prs = Presentation(file_path)
            lines = []
            for i, s in enumerate(prs.slides):
                lines.append(f"=== Slide {i+1} ===")
                for shape in s.shapes:
                    if hasattr(shape, "text") and shape.text:
                        lines.append(shape.text)
            return "\n".join(lines)
        except Exception:
            return ""
    return ""
