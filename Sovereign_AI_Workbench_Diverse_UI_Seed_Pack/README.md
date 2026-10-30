# Diverse Hands-On UI Seed Pack

This pack is intended for direct UI seeding and demo/testing.

## Main files
- `seed_questions_and_answers.json` — complete structured seed.
- `seed_questions.jsonl` — one question record per line.
- `artifacts/` — DOCX, PDF, PPTX, XLSX, CSV, PNG outputs.
- `graphs/` — graph source images.
- `diagrams/` — process/security/engineering diagrams.

## UI field mapping
- `id` → run/task ID
- `title` → conversation/task title
- `execution_size` → Small / Medium / Large badge
- `complexity` → routing/execution label
- `question` → user input
- `answer.summary` → primary assistant answer
- `answer.details` → expandable detailed explanation
- `execution_steps` → execution timeline
- `graph_analysis` → graph interpretation panel when present
- `sources` → source/evidence chips
- `artifacts` → artifact cards
- `recommended_statuses` → initial task status

## Coverage
The 10 questions intentionally span:
1. Company/organization knowledge
2. Security and data classification
3. Production analytics + bar chart + CSV
4. Work-order retrieval + chart + CSV
5. Operations SOP + DOCX
6. HSE permit + energy isolation + PDF + diagram
7. Procurement + XLSX
8. Management of Change + DOCX + diagram
9. Engineering tag relationship + engineering-style PNG
10. Sovereign AI architecture + 500-case benchmark + PPTX

## Important
The dataset is synthetic and for demonstration only. The engineering schematic is illustrative, not fabrication/CAD documentation. High-risk engineering decisions require authorized human review. Prototype security telemetry must not be presented as a real security guarantee.
