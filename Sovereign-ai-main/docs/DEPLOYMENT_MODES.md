# Deployment Modes (LOCAL / CLOUD)

Knovia AI runs the same codebase in two modes, selected by one environment
variable:

```bash
APP_MODE=local    # Ollama (installed local models only)
APP_MODE=cloud    # NVIDIA Nemotron via Nebius Token Factory (OpenAI-compatible)
```

`LLM_MODE` is still accepted as a backward-compatible alias (`APP_MODE` wins).

There is **no cross-provider fallback**: cloud mode never calls Ollama, and
local mode never calls the Nebius API. If the configured provider is
unavailable the request fails with a clear error (HTTP 503 on the OpenAI-style
endpoint), and retrieval degrades to deterministic lexical search rather than
switching models.

## Where routing lives

| Layer | File |
| --- | --- |
| Workbench provider router (chat, RAG, agents, doc/coding) | `backend/ai_provider.py` |
| Backward-compatible gateway facade | `backend/gateway.py` |
| Coding Agent provider router | `coding_agent/backend/app/llm_provider.py` |
| Coding Agent client shim | `coding_agent/backend/app/ollama_client.py` |

`backend/config.py` and `coding_agent/backend/app/config.py` read the mode and
all provider settings from the environment.

## Local mode

```bash
APP_MODE=local
LOCAL_API_BASE=http://localhost:11434
LOCAL_ROUTER_MODEL=qwen2.5:3b
LOCAL_REASONING_MODEL=qwen2.5:7b
LOCAL_CODER_MODEL=qwen2.5-coder:7b
LOCAL_EMBEDDING_MODEL=bge-m3:latest
```

* Chat, agents and document generation use the reasoning model.
* Classification/routing uses the router model.
* The Coding Agent uses the coder model.
* Embeddings use the local embedding model; if it is not installed, retrieval
  automatically uses lexical search (and startup ingest is skipped).

## Cloud mode

```bash
APP_MODE=cloud
NEBIUS_API_KEY=...                                       # server-side only
NEBIUS_BASE_URL=https://api.tokenfactory.us-central1.nebius.com/v1
NEBIUS_MODEL=nvidia/nemotron-3-super-120b-a12b
NEBIUS_ROUTER_MODEL=nvidia/nemotron-3-super-120b-a12b
NEBIUS_CODER_MODEL=nvidia/nemotron-3-super-120b-a12b
NEBIUS_EMBEDDING_MODEL=                                  # optional
CLOUD_AUTO_INGEST=0                                      # optional, see below
NEBIUS_TIMEOUT=600
```

* Every AI call (chat, routing, agents, doc generation, coding agent) is sent
  to Nebius with the model resolved by the central router.
* Ollama-style overrides (`qwen2.5:7b`, etc.) are ignored in cloud mode.
* `NEBIUS_EMBEDDING_MODEL` is optional. Without it, cloud retrieval uses the
  deterministic lexical index over the dataset — no local embeddings are ever
  used.
* Vector indexing through Nebius is opt-in (`NEBIUS_EMBEDDING_MODEL` **and**
  `CLOUD_AUTO_INGEST=1`) because it embeds the whole corpus (slow + billable).
* Cloud vectors live in a separate collection (`<collection>_cloud`), so
  switching modes can never wipe the local index.

## Verifying at runtime

```bash
# Active provider + model routing (no secrets)
curl http://127.0.0.1:8000/api/ai/status

# Real inference call through the active provider
curl -X POST http://127.0.0.1:8000/api/ai/selftest

# Coding Agent view
curl http://127.0.0.1:8002/api/ai/status
```

Every `/api/chat` result event and every `/v1/chat/completions` response
includes `provider`, `provider_label`, `model` and `mode`. The Models page reads
`/api/ai/status` and shows only the NVIDIA Nemotron model(s) in cloud mode; the
local list is shown in local mode.

## Switching modes

Restart **both** backend services (`:8000` and `:8002`) after changing
`APP_MODE`. The workbench automatically restarts the coding agent when it
detects a mode mismatch, but a manual restart is the simplest path.
