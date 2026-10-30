with open("backend/main.py", "r") as f:
    content = f.read()

ingest_code = """
@app.post("/api/ingest_local")
def ingest_local():
    import json
    import uuid
    import os
    from .vector_store import client
    from .gateway import gateway_instance
    from qdrant_client.models import Distance, VectorParams, PointStruct
    
    COLLECTION = "mrpl_knowledge_local"
    DIMENSION = 1024 # bge-m3
    
    try:
        client.get_collection(COLLECTION)
    except Exception:
        client.create_collection(
            collection_name=COLLECTION,
            vectors_config=VectorParams(size=DIMENSION, distance=Distance.COSINE),
        )

    dataset_dir = "ApexPetro_Sovereign_Dataset_v3"
    if not os.path.exists(dataset_dir):
        return {"error": "Dataset not found"}

    points = []
    for file in os.listdir(dataset_dir):
        if file.endswith(".json"):
            with open(os.path.join(dataset_dir, file), "r") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    data = [data]
                for item in data:
                    text = str(item)
                    vector = gateway_instance.embed(text)
                    points.append(
                        PointStruct(
                            id=str(uuid.uuid4()),
                            vector=vector,
                            payload={
                                "document_name": file,
                                "content": text,
                                "type": "Data"
                            }
                        )
                    )

    if points:
        client.upsert(
            collection_name=COLLECTION,
            wait=True,
            points=points
        )
    
    # Update config
    with open("backend/config.py", "r") as f:
        conf = f.read()
    if 'VECTOR_COLLECTION = os.getenv("VECTOR_COLLECTION", "mrpl_knowledge")' in conf:
        conf = conf.replace('VECTOR_COLLECTION = os.getenv("VECTOR_COLLECTION", "mrpl_knowledge")', 'VECTOR_COLLECTION = os.getenv("VECTOR_COLLECTION", "mrpl_knowledge_local")')
        with open("backend/config.py", "w") as f:
            f.write(conf)
            
    return {"status": "success", "ingested": len(points)}
"""

if "/api/ingest_local" not in content:
    content = content.replace("# Mount the dist folder as static files", ingest_code + "\n# Mount the dist folder as static files")
    with open("backend/main.py", "w") as f:
        f.write(content)
