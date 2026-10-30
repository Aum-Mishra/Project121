# Controlled AI document generation

LLM responsibilities:
- source-grounded narrative
- evidence selection
- structured calculations
- recommendation draft
- summary

Renderer responsibilities:
- page layout
- document IDs/revisions
- classification markings
- tables
- headers/footers
- DOCX/PDF/XLSX/PPTX format

The LLM should return structured JSON matching document_generation_contract.json. A deterministic renderer then creates the final artifact. High-risk outputs remain READY FOR REVIEW until a real human approval event exists.
