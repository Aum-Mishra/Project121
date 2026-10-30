# Sovereign AI Workbench - MVP

This is a completely isolated MVP version of the Sovereign AI Workbench.
It follows a frontend-first architecture with a highly lightweight, deterministic backend orchestrator.

## Key Features
- **Deterministic Processing**: Calculations, limits, and graphs are generated purely via deterministic logic, reducing LLM hallucinations.
- **Switchable LLM Provider**: The `backend/llm_provider.py` abstracts the local Ollama LLM, making it trivial to switch to cloud APIs later (`LLM_MODE=api`).
- **Dynamic Plan Execution**: The UI natively displays real-time query processing, understanding, and step-by-step plan execution.
- **Approval & Document Generation**: Dynamically constructs and renders interactive approval cards and mock physical documents.
- **Zero Heavy Dependencies**: Completely bypasses Qdrant and complex databases for a lightning-fast MVP experience.

## How to Run

1. **Start the Frontend**:
   ```bash
   npm install
   npm run dev
   ```

2. **Start the Lightweight MVP Backend**:
   Make sure your virtual environment is active, then run:
   ```bash
   uvicorn backend.main:app --port 8001 --reload
   ```

3. **Test the 5 Acceptance Queries**:
   - "What is the current operating pressure of P-102?"
   - "Compare the operating pressure and vibration of P-102 between 2024 and 2026."
   - "Analyze the inspection history of P-102 and identify changes in pressure, corrosion and vibration."
   - "Create a detailed inspection report for P-102."
   - "Create an engineering approval request for the P-102 inspection findings."
