with open("backend/main.py", "r") as f:
    main_content = f.read()

import re

# Add imports for standard OpenAI compatible payload
new_imports = """
from typing import List, Optional, Dict, Any
import time
from .gateway import gateway_instance
"""

if "from typing import List" not in main_content:
    main_content = main_content.replace("from pydantic import BaseModel", "from pydantic import BaseModel\n" + new_imports)

# Add OpenAI payload classes and the route
openai_route = """
class ChatMessage(BaseModel):
    role: str
    content: str

class ChatCompletionRequest(BaseModel):
    model: str
    messages: List[ChatMessage]
    temperature: Optional[float] = 0.7
    stream: Optional[bool] = False

@app.post("/v1/chat/completions")
def chat_completions(request: ChatCompletionRequest):
    messages_dict = [{"role": m.role, "content": m.content} for m in request.messages]
    
    # Simple mapping of model strings to task intents for the local router if the user specifically requests them
    task = "reasoning"
    if "coder" in request.model.lower() or "code" in request.model.lower():
        task = "coding"
    elif "3b" in request.model.lower() or "classifier" in request.model.lower():
        task = "routing"
    
    try:
        if request.stream:
            def sse_generator():
                stream_gen = gateway_instance.generate(messages_dict, task=task, stream=True, model_override=request.model)
                for chunk in stream_gen:
                    yield f"data: {json.dumps({'id': 'chatcmpl-123', 'object': 'chat.completion.chunk', 'choices': [{'delta': {'content': chunk}}]})}\\n\\n"
                yield "data: [DONE]\\n\\n"
            return StreamingResponse(sse_generator(), media_type="text/event-stream")
        else:
            response_text = gateway_instance.generate(messages_dict, task=task, stream=False, model_override=request.model)
            return {
                "id": f"chatcmpl-{int(time.time())}",
                "object": "chat.completion",
                "created": int(time.time()),
                "model": request.model,
                "choices": [{
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": response_text
                    },
                    "finish_reason": "stop"
                }]
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

"""

if "/v1/chat/completions" not in main_content:
    # Insert before the static files mounting block
    main_content = main_content.replace("# Mount the dist folder as static files", openai_route + "\n# Mount the dist folder as static files")
    
    # Make sure `import json` is in main.py
    if "import json" not in main_content:
        main_content = "import json\n" + main_content

    with open("backend/main.py", "w") as f:
        f.write(main_content)

