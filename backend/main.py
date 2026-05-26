import os
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

SYSTEM_PROMPT = """You output ONLY valid JSON. No other text.

Create Excalidraw elements from the user's description. Return a JSON object like:
{"elements": [
  {"type": "rectangle", "x": 150, "y": 100, "width": 100, "height": 60, "backgroundColor": "#e1f5fe"},
  {"type": "text", "x": 160, "y": 170, "width": 80, "height": 20, "text": "Box", "fontSize": 16},
  {"type": "arrow", "x": 260, "y": 130, "width": 50, "height": 0, "points": [[260, 130], [310, 130]]}
]}

Rules:
- All x: 100-500, y: 50-350
- Rectangles: ~100x60, use backgroundColor for fill
- LABEL every shape with a text element below/on it
- Arrows MUST have "points" array with [[startX,startY], [endX,endY]]
- Keep elements close (30-60px apart)
- Use different colors: blue (#e1f5fe) for servers, green (#e8f5e9) for clients, orange (#fff3e0) for load balancer

Output ONLY the JSON. No explanations."""


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


class TextToElementsRequest(BaseModel):
    description: str
    existingElements: List[ExcalidrawElement] = []


class TextToElementsResponse(BaseModel):
    elements: List[ExcalidrawElement]


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
        result.append(" ".join(parts))
    return "\n".join(result)


@app.post("/api/text-to-elements", response_model=TextToElementsResponse)
async def text_to_elements(request: TextToElementsRequest):
    api_key = os.getenv("OPENAI_API_KEY")
    base_url = os.getenv("OPENAI_BASE_URL")
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

    if not api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not configured in backend")

    client = OpenAI(api_key=api_key, base_url=base_url)

    print(f"=== LLM Request ===")
    print(f"Description: {request.description}")

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": request.description},
            ],
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
    print(f"{content}")

    content_lower = content.lower()
    if "error" in content_lower and "clipboard" in content_lower:
        print("=== LLM refused - asking for simpler request ===")
        raise HTTPException(status_code=500, detail="LLM refused. Try a simpler description.")

    if "cannot read" in content_lower or "does not support" in content_lower:
        raise HTTPException(status_code=500, detail=f"LLM error in response: {content[:200]}")

    try:
        parsed = parse_llm_response(content)
        return TextToElementsResponse(elements=parsed)
    except Exception as e:
        print(f"=== Parse Error ===")
        print(f"{e}")
        raise HTTPException(status_code=500, detail=f"Failed to parse LLM response: {str(e)}")


def clamp_coord(value: float, min_val: float, max_val: float) -> float:
    return max(min_val, min(max_val, value))


def parse_llm_response(content: str) -> List[ExcalidrawElement]:
    import json
    import re

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

    elements = parsed.get("elements", []) if isinstance(parsed, dict) else parsed

    if not isinstance(elements, list):
        raise ValueError(f"Expected array, got: {type(elements)}")

    print(f"=== Parsing {len(elements)} elements ===")

    result = []
    for i, el in enumerate(elements):
        if not isinstance(el, dict):
            continue

        el_type = el.get("type", "rectangle")

        x = clamp_coord(float(el.get("x", 150 + i * 100)), 100, 600)
        y = clamp_coord(float(el.get("y", 100 + (i % 3) * 80)), 50, 400)
        width = clamp_coord(float(el.get("width", 120)), 40, 200)
        height = clamp_coord(float(el.get("height", 60)), 30, 150)

        points = el.get("points")
        if el_type in ["arrow", "line"] and points:
            points = [[clamp_coord(p[0], 50, 700), clamp_coord(p[1], 30, 500)] for p in points]
        elif el_type in ["arrow", "line"] and not points:
            print(f"WARNING: Arrow/line without points, using default")
            points = [[x, y], [x + width, y]]

        print(f"  Element {i}: {el_type} at ({x}, {y}) size {width}x{height}")
        if el.get("text"):
            print(f"    Text: {el.get('text')}")
        if points:
            print(f"    Points: {points}")

        result.append(ExcalidrawElement(
            type=el_type,
            x=x,
            y=y,
            width=width,
            height=height,
            strokeColor=el.get("strokeColor"),
            backgroundColor=el.get("backgroundColor"),
            fillStyle=el.get("fillStyle"),
            strokeWidth=el.get("strokeWidth"),
            roughness=el.get("roughness"),
            opacity=el.get("opacity"),
            angle=el.get("angle"),
            text=el.get("text"),
            points=points,
            fontSize=el.get("fontSize") or (16 if el_type == "text" else None),
            fontFamily=el.get("fontFamily"),
            textAlign=el.get("textAlign"),
            strokeStyle=el.get("strokeStyle"),
            roundness=el.get("roundness"),
            groupIds=el.get("groupIds"),
        ))

    print(f"=== Returning {len(result)} valid elements ===")
    return result


@app.get("/api/health")
async def health():
    return {"status": "ok", "has_api_key": bool(os.getenv("OPENAI_API_KEY"))}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
