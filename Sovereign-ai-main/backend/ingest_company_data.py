import os
import json
import uuid
import pandas as pd
from pathlib import Path
from backend.vector_store import init_qdrant, insert_document
from backend.llm_provider import get_embedding

DATASET_PATH = "/home/aum/Desktop/ML/Smart India Hackathon/KNOVIA-ai-main/MRPL_Dataset_v3"

def determine_access_roles(path: str) -> list[str]:
    # Simple RBAC based on folder name
    path_lower = path.lower()
    if "hr" in path_lower or "human_factors" in path_lower:
        return ["ADMIN", "HR"]
    return ["ADMIN", "ENGINEER"]

def process_file(file_path: Path):
    roles = determine_access_roles(str(file_path))
    metadata = {
        "source_id": str(uuid.uuid4()),
        "document_name": file_path.name,
        "access_roles": roles,
        "path": str(file_path)
    }

    try:
        if file_path.suffix == ".json":
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                text_content = json.dumps(data, indent=2)
                # Chunking would happen here in a real scenario
                vector = get_embedding(text_content[:5000]) # chunk size limit
                insert_document(text_content[:5000], vector, metadata)
                return 1

        elif file_path.suffix in [".md", ".txt"]:
            with open(file_path, "r", encoding="utf-8") as f:
                text_content = f.read()
                vector = get_embedding(text_content[:5000])
                insert_document(text_content[:5000], vector, metadata)
                return 1

        elif file_path.suffix == ".csv":
            df = pd.read_csv(file_path)
            text_content = df.to_csv(index=False)
            vector = get_embedding(text_content[:5000])
            insert_document(text_content[:5000], vector, metadata)
            return 1

    except Exception as e:
        print(f"Error processing {file_path.name}: {e}")
        return 0
    return 0

def run_ingestion():
    init_qdrant()
    print("Starting ingestion...")
    count = 0
    for root, dirs, files in os.walk(DATASET_PATH):
        for file in files:
            if file.endswith((".json", ".md", ".txt", ".csv")):
                file_path = Path(root) / file
                count += process_file(file_path)
    print(f"Ingestion complete. Inserted {count} documents.")

if __name__ == "__main__":
    run_ingestion()
