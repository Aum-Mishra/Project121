# ApexPetro Energy Limited — Sovereign AI Dataset v3.0

Synthetic enterprise knowledge environment for the Sovereign AI Workbench.

The corpus was rebuilt so that multi-page PDFs use distinct, document-specific pages instead of repeating the same text to inflate page count.

Production folders:
organization, policies, sops, manuals, assets, historical_records, maintenance, hse, vendors, projects, operations, finance, hr, it, quality, templates, metadata, specs.

Delete TEST_DATA_REMOVE_LATER before production ingestion.

The company package is tenant-oriented: company.json and specs/apexpetro_master.yaml define the company; all company-specific knowledge is organized beneath the same folder contract.

Document generation uses structured LLM output plus deterministic rendering. See templates/document_generation_contract.json.

All content is fictional and must not be used for real industrial, HSE, engineering, financial, legal or regulatory decisions.
