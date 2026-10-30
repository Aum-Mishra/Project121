import pytest

from app.agents.intent import classify_query
from app.agents.orchestrator import AgentOrchestrator
from app.agents.state import AgentState


def make_state(query="Compare the 2024 and 2025 P-102 inspection reports"):
    state = AgentState(
        run_id="test-run",
        conversation_id="test-conv",
        user_id=1,
        company_id="apexpetro",
        query=query,
    )
    state.analysis = {
        "summary": "Deterministic summary from the structured analysis.",
        "metrics": [
            {"name": "Pressure", "value": "42.0", "unit": "bar", "status": "CRITICAL"},
            {"name": "Corrosion", "value": "3.8", "unit": "mm", "status": "CRITICAL"},
        ],
        "findings": [
            {"title": "Pressure trend (2024 → 2026)", "detail": "Pressure changed from 34 to 42 bar.", "confidence": "HIGH"},
        ],
        "charts": [
            {
                "type": "line",
                "title": "Pressure, Corrosion, and Vibration Levels (2024–2026)",
                "series": [
                    {"name": "Pressure (bar)", "data": [{"label": "2024", "value": 34.0}, {"label": "2026", "value": 42.0}]},
                ],
            }
        ],
        "tables": [
            {
                "title": "P-102 Inspection Readings",
                "headers": ["Year", "Pressure (bar)"],
                "rows": [["2024", "34.0"], ["2026", "42.0"]],
            }
        ],
        "_scope": {"risk_level": "HIGH"},
    }
    state.evidence = [
        {
            "document_id": "APEL-INS-P102-2024",
            "document_name": "P-102 Inspection 2024",
            "year": 2024,
            "content": "Pressure 34.0 bar",
        },
        {
            "document_id": "APEL-INS-P102-2026",
            "document_name": "P-102 Inspection 2026",
            "year": 2026,
            "content": "Pressure 42.0 bar",
        },
    ]
    state.artifacts_generated = [
        {
            "name": "P-102 Inspection Report — 2026",
            "format": "DOCX",
            "version": 1,
            "download_url": "/api/artifacts/abc/download",
        }
    ]
    return state


class TestFallbackSynthesize:
    def test_never_emits_error_message(self):
        orch = AgentOrchestrator(db=None, company_id="apexpetro", user_id=1)
        state = make_state()
        intent = classify_query(state.query)
        out = orch._fallback_synthesize(state, intent)
        assert "Error synthesizing" not in out
        assert "### Comparison" in out or "## Comparison" in out

    def test_includes_metrics_findings_and_sources(self):
        orch = AgentOrchestrator(db=None, company_id="apexpetro", user_id=1)
        state = make_state()
        out = orch._fallback_synthesize(state, classify_query(state.query))
        assert "Pressure: 42.0 bar (CRITICAL)" in out
        assert "Pressure trend (2024 → 2026)" in out
        assert "APEL-INS-P102-2024" in out
        assert "APEL-INS-P102-2026" in out
        assert "P-102 Inspection Report — 2026 (DOCX, v1)" in out
        assert "Risk level:** HIGH" in out

    def test_honest_empty_answer_when_no_data(self):
        orch = AgentOrchestrator(db=None, company_id="apexpetro", user_id=1)
        state = make_state()
        state.analysis = {}
        state.evidence = []
        state.artifacts_generated = []
        out = orch._fallback_synthesize(state, classify_query(state.query))
        assert "couldn't find the requested information" in out.lower()

    def test_honest_not_found_guard_unreached_by_fallback(self):
        # The no-fabrication guard (requires_rag + zero evidence) makes the LLM
        # path return an honest message before ever reaching the LLM; the
        # fallback must produce a non-error answer whenever it is called.
        orch = AgentOrchestrator(db=None, company_id="apexpetro", user_id=1)
        state = make_state()
        state.evidence = []
        out = orch._fallback_synthesize(state, classify_query(state.query))
        assert "Error synthesizing" not in out
        assert out.strip() != ""