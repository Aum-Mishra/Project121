# Sovereign On-Premise Agentic AI Workbench: Enhancement Package

This package contains the complete, production-grade enhancement suite for the **Sovereign On-Premise Agentic AI Workbench**.

## 1. Architecture Highlights
- **Air-Gapped Sovereign AI Core**: Multi-agent local orchestration across Ollama `qwen2.5:3b`, `qwen2.5:7b`, `qwen2.5-coder:7b`, and `bge-m3` embeddings. Strictly zero external cloud AI dependencies.
- **Fast-Path Query Router**: Sub-second deterministic responses for social greetings and capability questions.
- **Multi-Tier Security Stack**:
  - `prompt_defense.py`: Heuristic & regex jailbreak / injection interception.
  - `dlp_service.py`: Automated scanning and redaction of Aadhaar, SSN, API keys, passwords, and catalyst formulas.
  - `watermark_service.py`: Dynamic watermarking (`CONFIDENTIAL · [User] · [Timestamp] · [Company]`).
  - `file_security_service.py`: Ingestion quarantine, magic bytes validation, and extension enforcement.
- **Permission-Aware RAG**: 5 Clearance levels (`PUBLIC`, `INTERNAL`, `CONFIDENTIAL`, `RESTRICTED`, `CRITICAL`) with automatic denial auditing.
- **Multi-Format Artifact Generation & Versioning**: 5 formats (PDF, DOCX, XLSX, PPTX, CSV), 6 industrial templates, version chaining (`v1 -> v2`), and unified line-by-line diffing.
- **Autonomous Sovereign Coding Agent**: Project tree explorer, checkpoint snapshots, isolated sandbox runner, and self-healing debug loop.
- **7-Pillar Observability Stack**:
  - Prometheus metrics endpoint (`/metrics` and `/api/metrics`)
  - Ready-to-import Grafana Dashboard JSON (`sovereign-workbench-dashboard.json`)
  - Production CiliumNetworkPolicy eBPF manifest (`cilium-network-policy.yaml`)
  - `NetworkSecurityProvider` with Local Docker and Cilium/Hubble implementations.

## 2. Test Execution
All 105 unit tests pass cleanly:
```powershell
cd backend
python -m pytest tests/unit
```

## 3. Integration
Copy the files in this folder directly into your workbench repository to apply all features seamlessly.
