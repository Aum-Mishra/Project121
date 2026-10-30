import pandas as pd
from pathlib import Path
from .config import ARTIFACT_STORAGE_PATH
import uuid
import matplotlib.pyplot as plt
from docx import Document
from pptx import Presentation

def ensure_storage():
    Path(ARTIFACT_STORAGE_PATH).mkdir(parents=True, exist_ok=True)

def generate_csv_report(data: list[dict], filename="report.csv") -> str:
    ensure_storage()
    df = pd.DataFrame(data)
    filepath = Path(ARTIFACT_STORAGE_PATH) / f"{uuid.uuid4().hex[:8]}_{filename}"
    df.to_csv(filepath, index=False)
    return str(filepath)

def generate_excel_report(data: list[dict], filename="report.xlsx") -> str:
    ensure_storage()
    df = pd.DataFrame(data)
    filepath = Path(ARTIFACT_STORAGE_PATH) / f"{uuid.uuid4().hex[:8]}_{filename}"
    df.to_excel(filepath, index=False)
    return str(filepath)

def generate_trend_chart(x_data: list, y_data: list, title: str, xlabel: str, ylabel: str) -> str:
    ensure_storage()
    plt.figure(figsize=(8, 5))
    plt.plot(x_data, y_data, marker='o', linestyle='-', color='#0D9488')
    plt.title(title)
    plt.xlabel(xlabel)
    plt.ylabel(ylabel)
    plt.grid(True, linestyle='--', alpha=0.7)
    
    filename = f"{uuid.uuid4().hex[:8]}_trend.png"
    filepath = Path(ARTIFACT_STORAGE_PATH) / filename
    plt.savefig(filepath)
    plt.close()
    return str(filepath)

def generate_docx_report(title: str, paragraphs: list[str]) -> str:
    ensure_storage()
    doc = Document()
    doc.add_heading(title, 0)
    for p in paragraphs:
        doc.add_paragraph(p)
    filename = f"{uuid.uuid4().hex[:8]}_report.docx"
    filepath = Path(ARTIFACT_STORAGE_PATH) / filename
    doc.save(filepath)
    return str(filepath)

def generate_pptx_presentation(title: str, slides_data: list[dict]) -> str:
    ensure_storage()
    prs = Presentation()
    title_slide_layout = prs.slide_layouts[0]
    slide = prs.slides.add_slide(title_slide_layout)
    title_shape = slide.shapes.title
    title_shape.text = title

    for s_data in slides_data:
        bullet_slide_layout = prs.slide_layouts[1]
        slide = prs.slides.add_slide(bullet_slide_layout)
        shapes = slide.shapes
        shapes.title.text = s_data.get('title', 'Slide')
        body_shape = shapes.placeholders[1]
        tf = body_shape.text_frame
        for point in s_data.get('points', []):
            p = tf.add_paragraph()
            p.text = point

    filename = f"{uuid.uuid4().hex[:8]}_presentation.pptx"
    filepath = Path(ARTIFACT_STORAGE_PATH) / filename
    prs.save(filepath)
    return str(filepath)
