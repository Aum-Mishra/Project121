import pytest

from app.rag.doc_metadata import (
    derive_document_metadata, extract_asset_ids, extract_year,
    normalize_asset_token, DOCUMENT_TYPE_SOP, DOCUMENT_TYPE_INSPECTION,
    DOCUMENT_TYPE_POLICY,
)


class FakeDoc:
    def __init__(self, document_id="", file_name="", source_path="", owner="", revision="1"):
        self.document_id = document_id
        self.file_name = file_name
        self.source_path = source_path
        self.owner = owner
        self.revision = revision
        self.classification = "INTERNAL"
        self.file_type = "PDF"


class TestAssetExtraction:
    @pytest.mark.parametrize("text,expected", [
        ("P-102", ["P-102"]),
        ("p102 inspection", ["P-102"]),
        ("P 102 pump", ["P-102"]),
        ("APEL-INS-P102-2024", ["P-102"]),
        ("P-101 and P-102", ["P-101", "P-102"]),
        ("V-201", ["V-201"]),
    ])
    def test_asset_ids(self, text, expected):
        assert extract_asset_ids(text) == expected

    def test_normalize(self):
        assert normalize_asset_token("p102") == "P-102"


class TestYearExtraction:
    def test_year_in_id(self):
        assert extract_year("APEL-INS-P102-2024") == 2024

    def test_no_year(self):
        assert extract_year("SOP for inspection") is None


class TestDeriveMetadata:
    def test_sop_document(self):
        doc = FakeDoc(document_id="APEL-SOP-OPS-101", source_path="sops/operations/sop.xlsx")
        meta = derive_document_metadata(doc)
        assert meta["document_type"] == DOCUMENT_TYPE_SOP

    def test_inspection_document_with_asset_and_year(self):
        doc = FakeDoc(document_id="APEL-INS-P102-2024", source_path="inspection/P102/2024.xlsx")
        meta = derive_document_metadata(doc)
        assert meta["document_type"] == DOCUMENT_TYPE_INSPECTION
        assert meta["asset_id"] == "P-102"
        assert meta["year"] == 2024

    def test_policy_document(self):
        doc = FakeDoc(document_id="APEL-SEC-101", source_path="policies/data_security_policy.pdf")
        meta = derive_document_metadata(doc)
        assert meta["document_type"] == DOCUMENT_TYPE_POLICY

    def test_department_from_owner(self):
        doc = FakeDoc(document_id="APEL-SOP-1", source_path="sops/operations/x.xlsx", owner="Maintenance Dept")
        meta = derive_document_metadata(doc)
        assert meta["department"] == "Maintenance"

    def test_department_from_folder(self):
        doc = FakeDoc(document_id="APEL-MAN-1", source_path="manuals/vendor_manual.pdf")
        meta = derive_document_metadata(doc)
        assert meta["department"] == "Engineering"