import re

import pytest

from app.services.inspection_trends import (
    build_inspection_trends,
    extract_measurements,
    normalize_token,
    _percent_change,
)


class FakeChunk:
    def __init__(self, content):
        self.content = content


class FakeDocument:
    def __init__(self, document_id, content):
        self.document_id = document_id
        self.status = "READY"
        self.chunks = [FakeChunk(content)]


class FakeQuery:
    def __init__(self, docs):
        self._docs = docs

    def filter(self, *args, **kwargs):
        return self

    def all(self):
        return self._docs


class FakeDb:
    def __init__(self, docs):
        self._docs = docs

    def query(self, model):
        return FakeQuery(self._docs)


MEAS_TEMPLATE = (
    "Measured values Parameter Value Unit "
    "Pressure {p} bar Corrosion {c} mm Vibration {v} mm/s Seal temperature {s} \u00b0C"
)


def inspection_docs():
    return [
        FakeDocument(
            "APEL-INS-P102-2024",
            MEAS_TEMPLATE.format(p="34.0", c="1.2", v="4.1", s="74")
            + " Findings Early vibration increase; no active leakage.",
        ),
        FakeDocument(
            "APEL-INS-P102-2025",
            MEAS_TEMPLATE.format(p="37.0", c="2.4", v="5.3", s="79")
            + " Findings Localized casing corrosion and elevated vibration.",
        ),
        FakeDocument(
            "APEL-INS-P102-2026",
            MEAS_TEMPLATE.format(p="42.0", c="3.8", v="7.2", s="84")
            + " Findings Pressure above approved limit; corrosion and vibration require engineering review.",
        ),
    ]


class TestParsing:
    def test_extract_measurements(self):
        out = extract_measurements(MEAS_TEMPLATE.format(p="34.0", c="1.2", v="4.1", s="74"))
        assert out == {"pressure": 34.0, "corrosion": 1.2, "vibration": 4.1, "seal_temp": 74.0}

    def test_extract_measurements_empty(self):
        assert extract_measurements("no data here") == {}

    def test_normalize_token(self):
        assert normalize_token("P-102") == "P102"
        assert normalize_token(" p102 ") == "P102"

    def test_percent_change(self):
        assert _percent_change(34.0, 37.0) == pytest.approx(8.8)
        assert _percent_change(None, 37.0) is None
        assert _percent_change(0.0, 5.0) is None


class TestBuildTrends:
    def test_build_multi_year_series(self):
        db = FakeDb(inspection_docs())
        trends = build_inspection_trends(db, "apexpetro", "P-102")
        assert trends is not None
        assert trends["years"] == [2024, 2025, 2026]
        assert trends["risk_level"] == "HIGH"
        chart = trends["chart"]
        assert chart["type"] == "line"
        assert "Pressure, Corrosion, and Vibration Levels (2024\u20132026)" in chart["title"]
        names = {line["name"] for line in chart["series"]}
        assert "Pressure (bar)" in names and "Corrosion (mm)" in names and "Vibration (mm/s)" in names
        pressure = next(l for l in chart["series"] if l["name"] == "Pressure (bar)")
        assert [(p["label"], p["value"]) for p in pressure["data"]] == [
            ("2024", 34.0), ("2025", 37.0), ("2026", 42.0)
        ]
        metric_status = {m["name"]: m["status"] for m in trends["metrics"]}
        assert metric_status == {"Pressure": "CRITICAL", "Corrosion": "CRITICAL", "Vibration": "CRITICAL"}
        assert any("exceeded the approved maximum" in f["detail"] for f in trends["findings"])
        pct = trends["percent_changes"]["pressure"]
        assert [(c["from"], c["to"], c["percent"]) for c in pct] == [
            (2024, 2025, 8.8), (2025, 2026, 13.5)
        ]

    def test_build_none_without_measurements(self):
        doc = FakeDocument("APEL-INS-P102-2024", "No readings in this report.")
        trends = build_inspection_trends(FakeDb([doc]), "apexpetro", "P-102")
        assert trends is None

    def test_build_none_without_asset(self):
        assert build_inspection_trends(FakeDb([]), "apexpetro", None) is None

    def test_year_filter(self):
        db = FakeDb(inspection_docs())
        trends = build_inspection_trends(db, "apexpetro", "P-102", years=[2024, 2026])
        assert trends["years"] == [2024, 2026]
        assert "2025" not in trends["readings"]