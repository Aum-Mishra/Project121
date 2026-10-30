import pytest

from app.agents.state import AgentState
from app.agents.planner import planner


def make_state(query: str) -> AgentState:
    return AgentState(
        run_id="run-test",
        conversation_id="conv-test",
        user_id=1,
        company_id="apexpetro",
        query=query,
    )


def plan_tools(query: str):
    plan = planner._fallback_plan(make_state(query))
    return [step.tool for step in plan.steps if step.tool]


class TestPlannerIntent:
    def test_creation_intent_routes_to_generate_document(self):
        tools = plan_tools("Create an approval note for the overpressure assessment of P-102")
        assert "generate_document" in tools
        assert "coding_agent" not in tools

    def test_code_intent_routes_to_coding_agent(self):
        tools = plan_tools("Write Python code to compute the deviation of 42 from 40 bar")
        assert "coding_agent" in tools
        assert "generate_document" not in tools

    def test_analysis_intent_uses_analysis_and_search(self):
        tools = plan_tools("Analyze the latest P-102 inspection data and trends")
        assert "analyze_data" in tools

    def test_general_query_falls_to_search(self):
        tools = plan_tools("What is the maximum operating pressure for P-102?")
        assert "search_documents" in tools

    def test_make_a_ppt_routes_to_generate_document(self):
        tools = plan_tools("Make a ppt summarizing the P-102 inspection findings")
        assert "generate_document" in tools

    def test_put_in_a_sheet_routes_to_generate_document(self):
        tools = plan_tools("Put the risk assessment in a sheet")
        assert "generate_document" in tools


class TestFollowUpEditRouting:
    def test_update_instruction_routes_to_update_artifact(self):
        state = make_state("Update the document to add a risk mitigation section")
        state.context["artifacts"] = [{"artifact_id": "abc-123"}]
        plan = planner._fallback_plan(state)
        tools = [s.tool for s in plan.steps if s.tool]
        assert "update_artifact" in tools
        assert "generate_document" not in tools

    def test_update_uses_latest_artifact_id(self):
        state = make_state("Expand the technical review document with more detail")
        state.context["artifacts"] = [{"artifact_id": "latest-id"}]
        plan = planner._fallback_plan(state)
        update_step = next(s for s in plan.steps if s.tool == "update_artifact")
        assert update_step.input_data["artifact_id"] == "latest-id"

    def test_add_risk_mitigation_section_is_update(self):
        state = make_state("Update the inspection report to add a risk mitigation section")
        state.context["artifacts"] = [{"artifact_id": "abc-1"}]
        plan = planner._fallback_plan(state)
        tools = [s.tool for s in plan.steps if s.tool]
        assert "update_artifact" in tools

    def test_convert_intent_routes_to_convert_artifact(self):
        state = make_state("Convert the document to pdf")
        state.context["artifacts"] = [{"artifact_id": "conv-1"}]
        plan = planner._fallback_plan(state)
        tools = [s.tool for s in plan.steps if s.tool]
        assert "convert_artifact" in tools

    def test_convert_inspection_report_to_pdf(self):
        state = make_state("Convert the inspection report to pdf")
        state.context["artifacts"] = [{"artifact_id": "conv-2"}]
        plan = planner._fallback_plan(state)
        tools = [s.tool for s in plan.steps if s.tool]
        assert "convert_artifact" in tools

    def test_convert_to_excel_phrasing(self):
        state = make_state("Turn the risk assessment into an excel file")
        state.context["artifacts"] = [{"artifact_id": "conv-3"}]
        plan = planner._fallback_plan(state)
        tools = [s.tool for s in plan.steps if s.tool]
        assert "convert_artifact" in tools

    def test_create_intent_not_routed_to_update(self):
        tools = plan_tools("Generate a technical review document for P-102")
        assert "update_artifact" not in tools
        assert "convert_artifact" not in tools


class TestCodingAgentCodeParsing:
    def test_fence_regex_extracts_python(self):
        from app.tools.coding_agent import CODE_FENCE
        text = 'Here is the code:\n```python\nprint("hi")\n```\nDone.'
        m = CODE_FENCE.search(text)
        assert m is not None
        assert m.group(1).strip() == 'print("hi")'


class TestIntentAwarePlanning:
    def test_comparison_plans_per_year(self):
        plan = planner._fallback_plan(make_state("Compare the 2024 and 2025 P-102 inspection reports"))
        search_steps = [s for s in plan.steps if s.tool == "search_documents"]
        years = [s.input_data.get("year") for s in search_steps]
        assert 2024 in years and 2025 in years

    def test_summarization_uses_summarize_tool(self):
        plan = planner._fallback_plan(make_state("Give me a brief summary of the P-102 inspection process"))
        tools = [s.tool for s in plan.steps]
        assert "summarize_documents" in tools

    def test_company_question_uses_company_info(self):
        plan = planner._fallback_plan(make_state("Tell me about the company"))
        tools = [s.tool for s in plan.steps]
        assert "company_info" in tools

    def test_sop_question_targets_asset_and_type(self):
        plan = planner._fallback_plan(make_state("What is the SOP for inspecting P-102?"))
        search = next(s for s in plan.steps if s.tool == "search_documents")
        assert search.input_data["asset_id"] == "P-102"
        assert search.input_data["document_type"] == "sop"

    def test_department_question_targets_department(self):
        plan = planner._fallback_plan(make_state("Which department is responsible for maintenance?"))
        search = next(s for s in plan.steps if s.tool == "search_documents")
        assert search.input_data["department"] == "Maintenance"

    def test_complex_query_produces_multiple_steps(self):
        plan = planner._fallback_plan(make_state(
            "Retrieve the 2025 P-102 inspection report, give the company information "
            "with assets, and create an inspection report"
        ))
        tools = [s.tool for s in plan.steps if s.tool]
        assert len(tools) >= 3
        assert "company_info" in tools
        assert "generate_document" in tools

    def test_pressure_query_does_not_hardcode_calculation(self):
        # Regression: the planner must not inject a fixed 42-40 calculation
        # just because "pressure" appears in the query.
        plan = planner._fallback_plan(make_state("What is the maximum operating pressure for P-102?"))
        tools = [s.tool for s in plan.steps]
        assert "calculate" not in tools
        assert "search_documents" in tools
