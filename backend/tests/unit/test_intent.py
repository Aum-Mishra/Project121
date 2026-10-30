import pytest

from app.agents.intent import classify_query, CONVERSATIONAL, COMPANY_INFO, SUMMARIZATION, COMPARISON, KNOWLEDGE, CREATE_DOCUMENT, COMPLEX, ANALYSIS


class TestConversationalRouting:
    @pytest.mark.parametrize("query", [
        "Hi",
        "Hello there",
        "How are you?",
        "Are you fine?",
        "Are you okay?",
        "Who are you?",
        "What are you?",
        "What can you do?",
        "How can you help me?",
        "Thank you!",
        "Thanks so much",
        "Okay",
        "Good morning",
        "Bye",
    ])
    def test_smalltalk_is_conversational(self, query):
        intent = classify_query(query)
        assert intent["category"] == CONVERSATIONAL
        assert intent["requires_rag"] is False
        assert intent["requires_planner"] is False

    @pytest.mark.parametrize("query", [
        "What is the SOP for inspecting P-102?",
        "What is the maximum operating pressure for P-102?",
        "Which department handles maintenance?",
        "Tell me about the company",
    ])
    def test_subject_queries_are_not_conversational(self, query):
        assert classify_query(query)["category"] != CONVERSATIONAL


class TestCompanyIntent:
    @pytest.mark.parametrize("query", [
        "Tell me about the company",
        "What is the name of the company?",
        "Where is the refinery located?",
        "What does ApexPetro do?",
        "Which departments are present in the company?",
        "Give me the company profile",
    ])
    def test_company_questions(self, query):
        assert classify_query(query)["category"] == COMPANY_INFO


class TestSummarizationIntent:
    def test_brief_summary(self):
        intent = classify_query("Give me a brief summary of the P-102 inspection process")
        assert intent["category"] == SUMMARIZATION
        assert intent["summary_level"] == "brief"

    def test_detailed_summary(self):
        intent = classify_query("Summarize the P-102 inspection process in detail")
        assert intent["summary_level"] == "detailed"

    def test_n_points_summary(self):
        intent = classify_query("Summarize the P-102 inspection process in 5 points")
        assert intent["category"] == SUMMARIZATION
        assert intent["summary_level"] == "5_points"

    def test_key_findings_summary(self):
        intent = classify_query("Give me the key findings of the 2024 P-102 inspection")
        assert intent["category"] == SUMMARIZATION
        assert intent["summary_level"] == "findings"
        assert intent["years"] == [2024]


class TestComparisonIntent:
    def test_multiyear_comparison(self):
        intent = classify_query("Compare the 2024 and 2025 P-102 inspection reports")
        assert intent["category"] == COMPARISON
        assert intent["years"] == [2024, 2025]
        assert intent["multi_document"] is True

    def test_plain_compare(self):
        intent = classify_query("Compare the two inspection reports for P-101")
        assert intent["category"] == COMPARISON


class TestDocGenerationIntent:
    def test_approval_note(self):
        intent = classify_query("Create an approval note for the overpressure assessment of P-102")
        assert intent["category"] == CREATE_DOCUMENT

    def test_risk_assessment_document(self):
        intent = classify_query("Create the risk assessment document for P-102")
        assert intent["category"] == CREATE_DOCUMENT


class TestComplexIntent:
    def test_multipart_create_query(self):
        intent = classify_query(
            "Retrieve the 2025 P-102 inspection report, give the company information "
            "with assets, and create an inspection report"
        )
        assert intent["category"] == COMPLEX
        assert intent["complex"] is True
        assert intent["multi_document"] is True

    def test_company_asset_search_analyze_compare_create(self):
        intent = classify_query(
            "Give me the company information, provide the asset information for P-102, "
            "retrieve the relevant inspection and SOP data, analyze, compare, and create "
            "an inspection report"
        )
        assert intent["category"] == COMPLEX


class TestKnowledgeIntent:
    def test_pressure_query(self):
        intent = classify_query("What is the maximum operating pressure for P-102?")
        assert intent["category"] == KNOWLEDGE
        assert intent["asset_ids"] == ["P-102"]

    def test_sop_for_asset(self):
        intent = classify_query("What is the SOP for inspecting P-102?")
        assert intent["category"] == KNOWLEDGE
        assert intent["asset_ids"] == ["P-102"]
        assert intent["document_type"] == "sop"

    def test_department_question(self):
        intent = classify_query("Which department is responsible for maintenance?")
        assert intent["category"] == KNOWLEDGE
        assert intent["department"] == "Maintenance"