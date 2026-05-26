import { useRef, useCallback, useEffect, forwardRef, useImperativeHandle, useState } from "react"
import { Excalidraw, restoreElements } from "@excalidraw/excalidraw"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import type { ExcalidrawElement, ExcalidrawElementType } from "../types"
import "@excalidraw/excalidraw/index.css"

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
    const [isLoaded, setIsLoaded] = useState(false)

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

        console.log("=== Elements from LLM ===")
        console.log(JSON.stringify(elements, null, 2))

        const existing = api.getSceneElements()
        console.log("=== Existing elements count ===", existing.length)

        const elementsForRestore = elements.map((el, i) => ({
          id: `voice-${Date.now()}-${i}`,
          type: el.type,
          x: el.x,
          y: el.y,
          width: el.width,
          height: el.height,
          strokeColor: el.strokeColor ?? "#1e1e1e",
          backgroundColor: el.backgroundColor ?? "transparent",
          fillStyle: el.fillStyle ?? "solid",
          strokeWidth: el.strokeWidth ?? 2,
          strokeStyle: el.strokeStyle ?? "solid",
          roughness: el.roughness ?? 1,
          opacity: el.opacity ?? 100,
          angle: el.angle ?? 0,
          version: 1,
          versionNonce: 0,
          isDeleted: false,
          groupIds: [],
          frameId: null,
          boundElements: null,
          updated: Date.now(),
          link: null,
          locked: false,
          roundness: null,
          seed: Math.floor(Math.random() * 2147483647),
          index: null,
          ...(el.text !== undefined && { text: el.text, fontSize: el.fontSize ?? 20, fontFamily: el.fontFamily ?? 1, textAlign: el.textAlign ?? "left" }),
          ...(el.points !== undefined && { points: el.points, startBinding: null, endBinding: null, lastCommittedPoint: null }),
        }))

        console.log("=== Elements for restore ===")
        console.log(JSON.stringify(elementsForRestore, null, 2))

        const restored = restoreElements(
          elementsForRestore as unknown as any[],
          null
        )

        console.log("=== Restored elements ===")
        console.log(JSON.stringify(restored, null, 2))

        const combined = [...existing, ...restored]

        console.log("=== Calling updateScene with", combined.length, "elements ===")
        api.updateScene({
          elements: combined as unknown as never,
        })
        console.log("=== updateScene called ===")
      },
      []
    )

    useEffect(() => {
      if (elementsToAdd.length > 0 && isLoaded) {
        handleAddElements(elementsToAdd)
        onElementsAdded()
      }
    }, [elementsToAdd, handleAddElements, onElementsAdded, isLoaded])

    const handleAPI = useCallback((api: ExcalidrawImperativeAPI) => {
      excalidrawRef.current = api
      setIsLoaded(true)
      console.log("=== Excalidraw API ready ===")
    }, [])

    return (
      <div className="excalidraw-wrapper">
        <Excalidraw
          excalidrawAPI={handleAPI}
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

ExcalidrawWrapper.displayName = "ExcalidrawWrapper"

export default ExcalidrawWrapper
