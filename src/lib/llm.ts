import OpenAI from "openai"
import type { ExcalidrawElement, LLMConfig } from "../types"

const SYSTEM_PROMPT = `You are a diagram generator. Convert the user's description into Excalidraw JSON elements.

You will receive:
1. The user's spoken description of what to add
2. The current scene elements already on the canvas (if any)

Your task: return ONLY new Excalidraw elements to add. NEVER repeat or modify elements that already exist on the canvas.

IMPORTANT: Study the existing elements carefully. Position new elements with proper spacing relative to existing ones so the overall diagram remains readable and well-organized. Avoid overlapping existing elements unless the user explicitly asks for it.

Return ONLY a JSON object with a single key "elements" containing an array of element objects. No markdown, no explanations.

Each element object supports these fields:
- type: "rectangle" | "ellipse" | "diamond" | "arrow" | "line" | "text"
- x: number (position from left)
- y: number (position from top)
- width: number
- height: number
- strokeColor: hex color string (e.g. "#ff0000")
- backgroundColor: hex color string
- fillStyle: "solid" | "hachure" | "cross-hatch" | "zigzag"
- strokeWidth: number (default 2)
- roughness: number (0-2, default 1)
- opacity: number (0-100, default 100)
- angle: number (radians, default 0)
- text: string (only for type "text")
- points: [[x1,y1],[x2,y2],...] (for "line" and "arrow" types, REQUIRED for these types)
- fontSize: number (for text, default 20)
- textAlign: "left" | "center" | "right" (for text)
- strokeStyle: "solid" | "dashed" | "dotted"

Guidelines:
- Place elements to form a coherent diagram relative to existing elements
- Use reasonable spacing between elements (at least 20-30px apart)
- Use different colors to distinguish elements
- For arrows/lines, always include "points" with at least 2 points
- For text labels near elements, use "text" type elements positioned nearby
- Keep the overall composition within a 1200x800 canvas area
- Return a flat array of elements, even if just one`

function summarizeScene(elements: ExcalidrawElement[]): string {
  if (elements.length === 0) return "(canvas is empty)"
  return elements
    .map(
      (el, i) =>
        `${i + 1}. ${el.type} at (${Math.round(el.x)}, ${Math.round(el.y)})` +
        ` size ${Math.round(el.width)}x${Math.round(el.height)}` +
        (el.text ? ` text="${el.text}"` : "") +
        (el.strokeColor ? ` color=${el.strokeColor}` : "")
    )
    .join("\n")
}

export function createLLM(config: LLMConfig) {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    dangerouslyAllowBrowser: true,
  })

  return {
    async textToElements(
      description: string,
      existingElements?: ExcalidrawElement[]
    ): Promise<ExcalidrawElement[]> {
      const sceneSummary = summarizeScene(existingElements ?? [])

      const response = await client.chat.completions.create({
        model: config.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Current canvas elements:\n${sceneSummary}\n\nNew instruction: ${description}`,
          },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      })

      const content = response.choices[0]?.message?.content
      if (!content) {
        throw new Error("No response from LLM")
      }

      const parsed = JSON.parse(content)
      const elements = parsed.elements ?? parsed

      if (!Array.isArray(elements)) {
        throw new Error("LLM response is not an array")
      }

      return elements as ExcalidrawElement[]
    },
  }
}
