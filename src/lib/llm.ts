import type { ExcalidrawElement } from "../types"

const API_BASE = "http://localhost:8000"

export async function textToElements(
  description: string,
  existingElements: ExcalidrawElement[] = []
): Promise<ExcalidrawElement[]> {
  const response = await fetch(`${API_BASE}/api/text-to-elements`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      description,
      existingElements,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }))
    throw new Error(error.detail || `API error: ${response.status}`)
  }

  const data = await response.json()
  return data.elements as ExcalidrawElement[]
}
