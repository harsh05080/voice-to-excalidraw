import { useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from "react"
import { Excalidraw } from "@excalidraw/excalidraw"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types/types"
import type { ExcalidrawElement, ExcalidrawElementType } from "../types"
import { elementToExcalidrawFormat } from "../lib/elements"

interface ExcalidrawWrapperProps {
  elementsToAdd: ExcalidrawElement[]
  onElementsAdded: () => void
}

export interface ExcalidrawWrapperHandle {
  getSceneElements: () => ExcalidrawElement[]
}

const EXCALIDRAW_TO_SIMPLE: Record<string, ExcalidrawElementType> = {
  rectangle: "rectangle",
  ellipse: "ellipse",
  diamond: "diamond",
  arrow: "arrow",
  line: "line",
  text: "text",
}

function simplifyElement(raw: Record<string, unknown>): ExcalidrawElement {
  return {
    type: EXCALIDRAW_TO_SIMPLE[raw.type as string] ?? "rectangle",
    x: raw.x as number,
    y: raw.y as number,
    width: raw.width as number,
    height: raw.height as number,
    strokeColor: raw.strokeColor as string,
    backgroundColor: raw.backgroundColor as string,
    text: raw.text as string | undefined,
    points: raw.points as number[][] | undefined,
  }
}

const ExcalidrawWrapper = forwardRef<ExcalidrawWrapperHandle, ExcalidrawWrapperProps>(
  ({ elementsToAdd, onElementsAdded }, ref) => {
    const excalidrawRef = useRef<ExcalidrawImperativeAPI | null>(null)

    useImperativeHandle(ref, () => ({
      getSceneElements: () => {
        const api = excalidrawRef.current
        if (!api) return []
        const raw = api.getSceneElements() as unknown as Record<string, unknown>[]
        return raw.map(simplifyElement)
      },
    }))

    const handleAddElements = useCallback(
      (elements: ExcalidrawElement[]) => {
        const api = excalidrawRef.current
        if (!api) return

        const newElements = elements.map((el, i) =>
          elementToExcalidrawFormat(el, `voice-${Date.now()}-${i}`)
        )

        const existing = api.getSceneElements()
        api.updateScene({
          elements: [...existing, ...newElements] as unknown as never,
          commitToHistory: true,
        })
      },
      []
    )

    useEffect(() => {
      if (elementsToAdd.length > 0) {
        handleAddElements(elementsToAdd)
        onElementsAdded()
      }
    }, [elementsToAdd, handleAddElements, onElementsAdded])

    return (
      <div className="excalidraw-wrapper">
        <Excalidraw
          excalidrawAPI={(api) => {
            excalidrawRef.current = api
          }}
          initialData={{
            appState: {
              viewBackgroundColor: "#ffffff",
            },
          }}
        />
      </div>
    )
  }
)

export default ExcalidrawWrapper
