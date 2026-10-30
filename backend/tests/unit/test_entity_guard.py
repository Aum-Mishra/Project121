import pytest

from app.agents import entity_guard
from app.agents.entity_guard import build_consistency_note, referenced_codes


KNOWN_UNITS = {"CDU-4", "HDS-1", "HGU-1", "UTY", "UTIL-1", "TKF", "ELEC", "FIRE"}


@pytest.fixture
def known_codes(monkeypatch):
    def fake_load(db):
        return {"assets": {"P-102", "C-301", "P-101"}, "units": KNOWN_UNITS}
    monkeypatch.setattr(entity_guard, "load_known_codes", fake_load)
    return None


class TestReferencedCodes:
    @pytest.mark.parametrize("query,expected", [
        ("Which equipment is installed in unit U-101?", ["U-101"]),
        ("What is the vibration level of C-301?", ["C-301"]),
        ("Max pressure of P-102?", ["P-102"]),
        ("Show me data for V-999", ["V-999"]),
        ("Equipment in the CDU-4 unit", ["CDU-4"]),
        ("Tell me about equipment", []),
        ("Compare 2024 and 2025 results", []),
        ("pressure is 35 bar now", []),
    ])
    def test_extraction(self, query, expected):
        assert referenced_codes(query, KNOWN_UNITS) == expected

    def test_known_unit_normalization(self):
        assert referenced_codes("list assets in cdu-4", KNOWN_UNITS) == ["CDU-4"]


class TestConsistencyNote:
    def test_unknown_code_strong_note(self):
        note = build_consistency_note(
            "Show me U-101 equipment", "some unrelated text about pumps", db=object()
        )
        assert "U-101" in note
        assert "does NOT occur anywhere" in note

    def test_known_code_missing_from_evidence_soft_note(self, known_codes):
        note = build_consistency_note(
            "P-102 pressure", "unrelated evidence text", db=object()
        )
        assert "P-102" in note
        assert "not covered by the retrieved evidence" in note

    def test_known_code_in_evidence_no_note(self, known_codes):
        assert build_consistency_note(
            "C-301 vibration", "Segment: C-301 DE_Vertical 2026 records", db=object()
        ) == ""

    def test_no_codes_no_note(self):
        assert build_consistency_note("Tell me about the company", "", db=object()) == ""