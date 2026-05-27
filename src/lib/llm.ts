import type { ExcalidrawElement, DiagramAction } from "../types"

const API_BASE = "http://localhost:8000"

export async function textToActions(
  description: string,
  existingElements: ExcalidrawElement[],
  viewportWidth: number,
  viewportHeight: number,
  conversationHistory: { role: "user" | "assistant"; content: string }[]
): Promise<DiagramAction[]> {
  const response = await fetch(`${API_BASE}/api/text-to-elements`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      description,
      existingElements,
      viewportWidth,
      viewportHeight,
      conversationHistory,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }))
    throw new Error(error.detail || `API error: ${response.status}`)
  }

  const data = await response.json()
  return data.actions as DiagramAction[]
}
