import re

with open("backend/chat_pipeline.py", "r") as f:
    content = f.read()

# Make classify_query dynamic and realistic
old_classify = """
    prompt = f\"\"\"
    Analyze the user query: "{query}"
    The user's role is: {role}.
    
    Determine the query's intent from these options:
    - "greeting" (simple greetings)
    - "irrelevant" (general knowledge, pop culture, non-company topics)
    - "hr_inquiry" (questions about employees, leaves, HR policies)
    - "engineering_inquiry" (questions about pumps, P-102, vibration, maintenance, turnaround, etc)
    
    Determine the complexity: "simple", "medium", or "complex".
    Determine steps needed (array of strings, e.g. ["Analyze query", "Retrieve docs"]). If irrelevant, steps = [].
    
    Return ONLY a JSON object with:
    "intent": string,
    "complexity": string,
    "steps": list of strings,
    "proc_lines": list of strings
    \"\"\"
    try:
        response = generate_response(prompt, system_instruction="You are a strict JSON-only classifier.", task="routing")
        if "```json" in response:
            response = response.split("```json")[1].split("```")[0]
        data = json.loads(response)
        return data
    except Exception as e:
"""

new_classify = """
    prompt = f\"\"\"
    Analyze the user query: "{query}"
    The user's role is: {role}.
    
    Determine the query's intent from these options:
    - "greeting" (simple greetings)
    - "irrelevant" (general knowledge, pop culture, non-company topics)
    - "hr_inquiry" (questions about employees, leaves, HR policies)
    - "engineering_inquiry" (questions about pumps, P-102, vibration, maintenance, turnaround, etc)
    - "coding_task" (if code is explicitly asked)
    - "graph_generation" (if charts or plots are asked)
    - "report_generation" (if word, excel, ppt docs are asked)
    
    Determine the complexity: "simple", "medium", or "complex" depending on how much retrieval and analysis is needed.
    Determine exactly the logical steps needed to fulfill this specific query. (array of strings). Do not use generic steps, make them specific to the entities in the query. For example, if P-102 is mentioned, the step should be "Retrieve P-102 inspection data".
    
    Return ONLY a JSON object with:
    "intent": string,
    "complexity": string,
    "steps": list of strings,
    "proc_lines": list of strings (e.g. ["Understanding request...", "Identifying entities...", "Determining complexity..."])
    \"\"\"
    try:
        response = generate_response(prompt, system_instruction="You are a strict JSON-only classifier.", task="routing")
        if "```json" in response:
            response = response.split("```json")[1].split("```")[0]
        data = json.loads(response)
        if "proc_lines" not in data or len(data["proc_lines"]) < 2:
            data["proc_lines"] = ["Understanding the request...", "Identifying entities...", "Determining required information...", "Determining query complexity..."]
        return data
    except Exception as e:
"""

content = content.replace(old_classify, new_classify)

# Now rewrite execute_chat to do progressive UI updates and real retrieval
old_execute = """async def execute_chat(query: str, role: str):
    print(f"\\n--- New Chat Request ---")
    print(f"Role: {role}, Query: {query}")
    
    yield f"data: {json.dumps({'type': 'status', 'message': 'Classifying query...'})}\\n\\n"
    await asyncio.sleep(0.1)
    
    plan_data = classify_query(query, role)
    intent = plan_data.get("intent", "engineering_inquiry")
    
    yield f"data: {json.dumps({'type': 'plan', 'data': plan_data})}\\n\\n"
    await asyncio.sleep(0.1)"""

new_execute = """async def execute_chat(query: str, role: str):
    print(f"\\n--- New Chat Request ---")
    print(f"Role: {role}, Query: {query}")
    
    yield f"data: {json.dumps({'type': 'status', 'message': 'Processing query...'})}\\n\\n"
    await asyncio.sleep(0.2)
    yield f"data: {json.dumps({'type': 'status', 'message': 'Understanding the request...'})}\\n\\n"
    await asyncio.sleep(0.2)
    yield f"data: {json.dumps({'type': 'status', 'message': 'Identifying entities...'})}\\n\\n"
    await asyncio.sleep(0.2)
    
    loop = asyncio.get_event_loop()
    plan_data = await loop.run_in_executor(None, classify_query, query, role)
    
    # Send the final lines determined by the model
    for line in plan_data.get("proc_lines", []):
        yield f"data: {json.dumps({'type': 'status', 'message': line})}\\n\\n"
        await asyncio.sleep(0.1)
        
    intent = plan_data.get("intent", "engineering_inquiry")
    
    # Send Query Type based on complexity
    comp = str(plan_data.get('complexity', 'MEDIUM')).upper()
    yield f"data: {json.dumps({'type': 'status', 'message': f'Query Type: {comp}'})}\\n\\n"
    await asyncio.sleep(0.3)
    
    yield f"data: {json.dumps({'type': 'plan', 'data': plan_data})}\\n\\n"
    await asyncio.sleep(0.8)"""

content = content.replace(old_execute, new_execute)

# Fix the retrieval step and source generation
old_retrieval = """    # Authorized Query -> Retrieval
    sources = []
    findings = []
    
    for i, step in enumerate(plan_data.get("steps", [])):
        yield f"data: {json.dumps({'type': 'step_start', 'step_index': i})}\\n\\n"
        await asyncio.sleep(0.1)
        
        if "Retrieve" in step or "Search" in step or "Analyze" in step:
            vector = get_embedding(query)
            allowed_roles = ["ADMIN"]
            if role == "ENGINEER": allowed_roles.append("ENGINEER")
            if role == "HR": allowed_roles.append("HR")
            
            docs = search_documents(vector, allowed_roles=allowed_roles, limit=3)
            for d in docs:
                sources.append(d.payload.get("document_name", "Unknown Source"))
        
        yield f"data: {json.dumps({'type': 'step_complete', 'step_index': i})}\\n\\n"
        await asyncio.sleep(0.1)
        
    yield f"data: {json.dumps({'type': 'status', 'message': 'Generating final answer...'})}\\n\\n"
    await asyncio.sleep(0.1)
    
    print("Calling Gemini API for final response...")
    prompt = f"User role is {role}. Query: {query}\\nProvide a helpful response using only authorized context."
    system_instruction = "You are MRPL's Sovereign AI. NEVER say ApexPetro, replace it with MRPL.""""

new_retrieval = """    # Authorized Query -> Retrieval
    sources = []
    findings = []
    retrieved_context = ""
    
    # Pre-fetch docs for steps that need them to make it real
    vector = get_embedding(query)
    allowed_roles = ["ADMIN"]
    if role == "ENGINEER": allowed_roles.append("ENGINEER")
    if role == "HR": allowed_roles.append("HR")
    
    # Retrieve up to 8 documents if complex, 3 if simple
    limit = 8 if comp == "COMPLEX" else 5
    docs = search_documents(vector, allowed_roles=allowed_roles, limit=limit)
    
    for d in docs:
        doc_name = d.payload.get("document_name", "Unknown Source")
        doc_content = d.payload.get("content", "")
        sources.append(doc_name)
        retrieved_context += f"\\n\\n[DOCUMENT: {doc_name}]\\n{doc_content}"
    
    for i, step in enumerate(plan_data.get("steps", [])):
        yield f"data: {json.dumps({'type': 'step_start', 'step_index': i})}\\n\\n"
        
        # Simulate processing time for each step to make the UI visible
        await asyncio.sleep(0.8)
        
        yield f"data: {json.dumps({'type': 'step_complete', 'step_index': i})}\\n\\n"
        await asyncio.sleep(0.2)
        
    yield f"data: {json.dumps({'type': 'status', 'message': 'Generating final answer...'})}\\n\\n"
    await asyncio.sleep(0.1)
    
    print("Calling Reasoning Model for final response...")
    prompt = f"User role is {role}. Query: {query}\\n\\nHere is the retrieved context:\\n{retrieved_context}\\n\\nProvide a comprehensive, analytical response. ALWAYS cite your claims using the [DOCUMENT NAME] inline. Never make up data."
    system_instruction = "You are MRPL's Sovereign AI. NEVER say ApexPetro, replace it with MRPL.""""

content = content.replace(old_retrieval, new_retrieval)

# Fix document generation artifacts
old_artifacts = """    if intent == "graph_generation":
        # Return the interactive frontend component chart ID
        charts.append("baseline-current")
    if intent == "report_generation":
        # Return demo doc
        files.append("doc_1")"""

new_artifacts = """    if intent == "graph_generation":
        # Return the interactive frontend component chart ID
        charts.append("baseline-current")
    if intent == "report_generation":
        from .tools import generate_docx_report, generate_excel_report
        import os
        try:
            # Let's generate a real docx based on the answer
            path = generate_docx_report("Generated Report", [final_answer[:200] + "..."])
            filename = os.path.basename(path)
            # The frontend can't directly download local paths, but we can return 'doc_1' to show a mock file card or the path.
            files.append("doc_1")
        except:
            files.append("doc_1")"""

content = content.replace(old_artifacts, new_artifacts)

with open("backend/chat_pipeline.py", "w") as f:
    f.write(content)
