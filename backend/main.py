import os
import json
import re
from typing import List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Voice to Excalidraw API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SYSTEM_PROMPT = """You are a system design diagram assistant. You output ONLY valid JSON. No other text.

Your job: given a user's voice command and the current canvas state, return a list of **actions** that modify the diagram, plus a **reply** explaining what you did or asking for clarification.

=== RESPONSE FORMAT ===
Return:
{{"reply": "...", "actions": [
  {{"type": "add", "element": {{ <ExcalidrawElement> }}}},
  {{"type": "modify", "targetIndex": <number>, "element": {{ <partial fields> }}}},
  {{"type": "delete", "targetIndex": <number>}},
  {{"type": "clear"}}
]}}

You MUST always include a "reply" field.
- When you make changes: reply with 1-2 sentences explaining what you added/modified/deleted and why.
- When the user's request is ambiguous: reply with a clarifying question and set "actions" to [].
- Be conversational but concise. Like an architect thinking aloud.

Supported action types:
- "add": Insert a new element. Provide ALL fields.
- "modify": Change fields of an existing element by its 1-based index. Only include fields that change.
- "delete": Remove an existing element by its 1-based index.
- "clear": Remove ALL elements.

=== ELEMENT FIELDS ===
{{
  "type": "rectangle" | "ellipse" | "diamond" | "arrow" | "line" | "text",
  "x": <number>,  // top-left x position
  "y": <number>,  // top-left y position
  "width": <number>,
  "height": <number>,
  "strokeColor": "<hex>",
  "backgroundColor": "<hex>",
  "fontSize": <number>,
  "textAlign": "left" | "center" | "right"
}}

IMPORTANT: Shapes (rect, ellipse, diamond) do NOT display text on their own.
You MUST add a separate "text" type element positioned inside/above each shape.

=== COMPLETE EXAMPLE ===
When user says "Draw an API Gateway with a load balancer below it, connected by an arrow":
{{"actions": [
  {{"type": "add", "element": {{"type": "rectangle", "x": 200, "y": 60, "width": 140, "height": 50, "strokeColor": "#1e1e1e", "backgroundColor": "#e1f5fe"}}}},
  {{"type": "add", "element": {{"type": "text", "x": 204, "y": 75, "width": 132, "height": 20, "text": "API Gateway", "fontSize": 16, "textAlign": "center"}}}},
  {{"type": "add", "element": {{"type": "diamond", "x": 220, "y": 160, "width": 100, "height": 60, "strokeColor": "#1e1e1e", "backgroundColor": "#fff3e0"}}}},
  {{"type": "add", "element": {{"type": "text", "x": 224, "y": 180, "width": 92, "height": 20, "text": "LB", "fontSize": 16, "textAlign": "center"}}}},
  {{"type": "add", "element": {{"type": "arrow", "fromElementIndex": 1, "toElementIndex": 3}}}}
]}}

Note: Arrow uses fromElementIndex and toElementIndex (1-based indices from the scene list below) to auto-connect existing elements. The frontend will calculate the actual arrow path.

=== CONNECTING WITH ARROWS ===
- ALWAYS prefer "fromElementIndex" and "toElementIndex" (1-based) to connect elements. Do NOT include "points" when using indices.
- Existing elements have indices 1..N from the scene list below.
- New elements YOU add in this batch get indices N+1, N+2, etc. in the order they appear in your "actions" array.
- Example: If there are 5 existing elements and you add a rectangle (1st add = index 6) then an arrow from element 2 to your rectangle, set {{"fromElementIndex": 2, "toElementIndex": 6}}.
- Only use explicit "points" as a last resort when you need a non-orthogonal custom path.

=== COLOR CONVENTIONS ===
- Client / mobile: #e8f5e9 (green)
- Server / API: #e1f5fe (blue)
- Load balancer / gateway: #fff3e0 (orange) — use diamond
- Database / storage: #fce4ec (pink) — use ellipse
- Cache / CDN: #f3e5f5 (purple)
- Message queue: #fbe9e7 (deep orange)
- External: #f5f5f5 (gray)

=== LABELING RULES ===
- EVERY shape needs a matching text element placed INSIDE it
- Text element x = shape.x + 4, width = shape.width - 8
- Text element y = shape.y + (shape.height / 2) - 10
- Text fontSize: 16
- Keep labels 1-3 words

=== LAYOUT ===
- Canvas: {canvasWidth}x{canvasHeight} pixels
- Elements: 120-180px wide, 45-60px tall (except text: 20px tall)
- Padding between elements: 50-80px
- Place elements near what the user describes, scanning left-to-right, top-to-bottom
- When user says "below X" or "to the right of X", find X by its text label in the scene list and offset from its position (below = y + height + 60, right = x + width + 60)

=== CURRENT SCENE (1-based indices) ===
{scene_summary}

Output ONLY the JSON. No explanations.
"""

class ExcalidrawElement(BaseModel):
    type: str
    x: float
    y: float
    width: float
    height: float
    strokeColor: Optional[str] = None
    backgroundColor: Optional[str] = None
    fillStyle: Optional[str] = None
    strokeWidth: Optional[int] = None
    roughness: Optional[int] = None
    opacity: Optional[int] = None
    angle: Optional[float] = None
    text: Optional[str] = None
    points: Optional[List[List[float]]] = None
    fontSize: Optional[int] = None
    fontFamily: Optional[int] = None
    textAlign: Optional[str] = None
    strokeStyle: Optional[str] = None
    roundness: Optional[dict] = None
    groupIds: Optional[List[str]] = None
    fromElementIndex: Optional[int] = None
    toElementIndex: Optional[int] = None


class DiagramAction(BaseModel):
    type: str
    targetIndex: Optional[int] = None
    element: Optional[ExcalidrawElement] = None


class ActionsResponse(BaseModel):
    actions: List[DiagramAction]
    reply: str = ""


class TextToElementsRequest(BaseModel):
    description: str
    existingElements: List[ExcalidrawElement] = []
    viewportWidth: float = 1200
    viewportHeight: float = 800
    conversationHistory: List[dict] = []


def summarize_scene(elements: List[ExcalidrawElement]) -> str:
    if not elements:
        return "(canvas is empty)"
    result = []
    for i, el in enumerate(elements):
        parts = [f"{i + 1}. {el.type} at ({int(el.x)}, {int(el.y)}) size {int(el.width)}x{int(el.height)}"]
        if el.text:
            parts.append(f'text="{el.text}"')
        if el.strokeColor:
            parts.append(f"color={el.strokeColor}")
        if el.backgroundColor:
            parts.append(f"fill={el.backgroundColor}")
        result.append(" ".join(parts))
    return "\n".join(result)


@app.post("/api/text-to-elements", response_model=ActionsResponse)
async def text_to_elements(request: TextToElementsRequest):
    api_key = os.getenv("OPENAI_API_KEY")
    base_url = os.getenv("OPENAI_BASE_URL")
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

    if not api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not configured in backend")

    client = OpenAI(api_key=api_key, base_url=base_url)

    scene_summary = summarize_scene(request.existingElements)

    system_prompt = SYSTEM_PROMPT.format(
        canvasWidth=int(request.viewportWidth),
        canvasHeight=int(request.viewportHeight),
        scene_summary=scene_summary,
    )

    messages = [{"role": "system", "content": system_prompt}]

    for msg in request.conversationHistory:
        if msg.get("role") in ("user", "assistant"):
            messages.append({"role": msg["role"], "content": msg["content"]})

    messages.append({"role": "user", "content": request.description})

    print(f"=== LLM Request ===")
    print(f"Description: {request.description}")
    print(f"Scene elements: {len(request.existingElements)}")
    print(f"Viewport: {int(request.viewportWidth)}x{int(request.viewportHeight)}")
    print(f"History messages: {len(request.conversationHistory)}")

    try:
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.3,
            response_format={"type": "json_object"},
        )
    except Exception as e:
        print(f"=== OpenAI Error ===")
        print(f"{e}")
        raise HTTPException(status_code=500, detail=f"OpenAI API error: {str(e)}")

    content = ""
    if response.choices and len(response.choices) > 0:
        choice = response.choices[0]
        if hasattr(choice, 'message') and choice.message:
            content = choice.message.content or ""

    if not content:
        raise HTTPException(status_code=500, detail="No response from LLM")

    print(f"=== LLM Response ===")
    print(f"{content[:1000]}")

    try:
        reply, parsed = parse_llm_response(content)
        return ActionsResponse(actions=parsed, reply=reply)
    except Exception as e:
        print(f"=== Parse Error ===")
        print(f"{e}")
        raise HTTPException(status_code=500, detail=f"Failed to parse LLM response: {str(e)}")


def clamp_coord(value: float, min_val: float, max_val: float) -> float:
    return max(min_val, min(max_val, value))


def parse_llm_response(content: str):
    content = content.strip()

    json_match = re.search(r'\{[\s\S]*\}', content)
    if json_match:
        content = json_match.group(0)

    content = content.replace('```json', '').replace('```', '').strip()

    print(f"=== Cleaned JSON ===")
    print(f"{content[:500]}")

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError as e:
        raise ValueError(f"Failed to parse JSON: {str(e)}. Content: {content[:300]}")

    reply = parsed.get("reply", "") if isinstance(parsed, dict) else ""
    raw_actions = parsed.get("actions", []) if isinstance(parsed, dict) else parsed

    if not isinstance(raw_actions, list):
        raise ValueError(f"Expected 'actions' array, got: {type(raw_actions)}")

    print(f"=== Reply: {reply[:200]}")
    print(f"=== Parsing {len(raw_actions)} actions ===")

    result = []
    for i, raw in enumerate(raw_actions):
        if not isinstance(raw, dict):
            continue

        action_type = raw.get("type", "add")
        print(f"  Action {i}: type={action_type}")

        if action_type == "clear":
            result.append(DiagramAction(type="clear"))
            continue

        if action_type == "delete":
            target = raw.get("targetIndex")
            if target is None:
                print(f"  WARNING: delete action without targetIndex, skipping")
                continue
            result.append(DiagramAction(type="delete", targetIndex=int(target)))
            continue

        raw_el = raw.get("element")
        if not raw_el or not isinstance(raw_el, dict):
            print(f"  WARNING: action without valid element, skipping")
            continue

        el_type = raw_el.get("type", "rectangle")

        x = clamp_coord(float(raw_el.get("x", 150 + i * 100)), 0, 2000)
        y = clamp_coord(float(raw_el.get("y", 100 + (i % 3) * 80)), 0, 1500)
        width = clamp_coord(float(raw_el.get("width", 120)), 20, 500)
        height = clamp_coord(float(raw_el.get("height", 60)), 20, 400)

        points = raw_el.get("points")
        from_idx = raw_el.get("fromElementIndex")
        to_idx = raw_el.get("toElementIndex")

        if el_type in ["arrow", "line"] and points:
            points = [[clamp_coord(p[0], 0, 2500), clamp_coord(p[1], 0, 2000)] for p in points]
        elif el_type in ["arrow", "line"] and not points:
            points = [[x, y], [x + width, y]]

        print(f"    Element: {el_type} at ({x}, {y}) size {width}x{height}")
        if raw_el.get("text"):
            print(f"    Text: {raw_el.get('text')}")

        element = ExcalidrawElement(
            type=el_type,
            x=x,
            y=y,
            width=width,
            height=height,
            strokeColor=raw_el.get("strokeColor"),
            backgroundColor=raw_el.get("backgroundColor"),
            fillStyle=raw_el.get("fillStyle"),
            strokeWidth=raw_el.get("strokeWidth"),
            roughness=raw_el.get("roughness"),
            opacity=raw_el.get("opacity"),
            angle=raw_el.get("angle"),
            text=raw_el.get("text"),
            points=points,
            fontSize=raw_el.get("fontSize") or (16 if el_type == "text" else None),
            fontFamily=raw_el.get("fontFamily"),
            textAlign=raw_el.get("textAlign"),
            strokeStyle=raw_el.get("strokeStyle"),
            roundness=raw_el.get("roundness"),
            groupIds=raw_el.get("groupIds"),
            fromElementIndex=from_idx,
            toElementIndex=to_idx,
        )

        if action_type == "modify":
            target = raw.get("targetIndex")
            if target is None:
                print(f"  WARNING: modify action without targetIndex, treating as add")
                result.append(DiagramAction(type="add", element=element))
            else:
                result.append(DiagramAction(type="modify", targetIndex=int(target), element=element))
        else:
            result.append(DiagramAction(type="add", element=element))

    print(f"=== Returning reply + {len(result)} valid actions ===")
    return reply, result


@app.get("/api/health")
async def health():
    return {"status": "ok", "has_api_key": bool(os.getenv("OPENAI_API_KEY"))}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
