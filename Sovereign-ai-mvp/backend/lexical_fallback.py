import os
import json

def lexical_search(query: str, dataset_dir="ApexPetro_Sovereign_Dataset_v3", limit=5):
    results = []
    query_lower = query.lower()
    keywords = [word for word in query_lower.split() if len(word) > 3]
    
    if "p-102" in query_lower:
        keywords.extend(["p-102", "102", "pump"])
        
    if not os.path.exists(dataset_dir):
        # Fallbacks for running from various directories
        possible_paths = [
            os.path.join("..", dataset_dir),
            os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), dataset_dir),
            os.path.join(os.getcwd(), dataset_dir),
        ]
        found = False
        for p in possible_paths:
            if os.path.exists(p):
                dataset_dir = p
                found = True
                break
        if not found:
            print("CRITICAL: Lexical Fallback could not find the dataset directory!")
            return []
        
    for root, _, files in os.walk(dataset_dir):
        for file in files:
            path = os.path.join(root, file)
            
            if file.endswith(".yaml") or file.endswith(".yml"):
                try:
                    with open(path, "r") as f:
                        text = f.read()
                        lower_text = text.lower()
                        score = sum(1 for k in keywords if k in lower_text)
                        if "p-102" in query_lower and "p-102" in lower_text:
                            score += 10
                        if score > 0:
                            results.append({
                                "score": score,
                                "payload": {
                                    "document_name": file,
                                    "text": text[:800],
                                    "type": "Specification",
                                    "access_roles": ["ADMIN", "ENGINEER"]
                                }
                            })
                except Exception:
                    pass
            
            elif file.endswith(".json"):
                try:
                    with open(path, "r") as f:
                        data = json.load(f)
                        if isinstance(data, dict):
                            for key, val in data.items():
                                chunk = {key: val}
                                text = json.dumps(chunk).lower()
                                score = sum(1 for k in keywords if k in text)
                                if "p-102" in query_lower and "p-102" in text:
                                    score += 5
                                if score > 0:
                                    results.append({
                                        "score": score,
                                        "payload": {
                                            "document_name": f"{file} - {key}",
                                            "text": json.dumps(chunk)[:2000],
                                            "type": "Document",
                                            "access_roles": ["ADMIN", "ENGINEER"]
                                        }
                                    })
                        elif isinstance(data, list):
                            for item in data:
                                text = json.dumps(item).lower()
                                score = sum(1 for k in keywords if k in text)
                                if "p-102" in query_lower and "p-102" in text:
                                    score += 5
                                if score > 0:
                                    results.append({
                                        "score": score,
                                        "payload": {
                                            "document_name": file,
                                            "text": json.dumps(item)[:2000],
                                            "type": "Document",
                                            "access_roles": ["ADMIN", "ENGINEER"]
                                        }
                                    })
                except Exception:
                    pass
                    
    results.sort(key=lambda x: x["score"], reverse=True)
    
    points = []
    class MockPoint:
        def __init__(self, payload):
            self.payload = payload
            
    for r in results[:limit]:
        points.append(MockPoint(r["payload"]))
        
    return points
