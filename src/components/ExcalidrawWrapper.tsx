import { useRef, useCallback, useEffect, forwardRef, useImperativeHandle, useState } from "react"
import { Excalidraw, restoreElements, exportToBlob } from "@excalidraw/excalidraw"
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import type { ExcalidrawElement, ExcalidrawElementType, DiagramAction } from "../types"
import { processActions } from "../lib/actions"
import "@excalidraw/excalidraw/index.css"

interface ExcalidrawWrapperProps {
  actionsToApply: DiagramAction[]
  onActionsApplied: () => void
}

export interface ExcalidrawWrapperHandle {
  getSceneElements: () => ExcalidrawElement[]
  getViewport: () => { width: number; height: number }
  undo: () => void
  redo: () => void
  zoomIn: () => void
  zoomOut: () => void
  clearCanvas: () => void
  exportAsImage: () => Promise<void>
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

const MAX_UNDO = 50

const ExcalidrawWrapper = forwardRef<ExcalidrawWrapperHandle, ExcalidrawWrapperProps>(
  ({ actionsToApply, onActionsApplied }, ref) => {
    const excalidrawRef = useRef<ExcalidrawImperativeAPI | null>(null)
    const [isLoaded, setIsLoaded] = useState(false)
    const undoStack = useRef<Record<string, unknown>[][]>([])
    const redoStack = useRef<Record<string, unknown>[][]>([])

    const saveForUndo = useCallback(() => {
      const api = excalidrawRef.current
      if (!api) return
      const elements = api.getSceneElements() as unknown as Record<string, unknown>[]
      undoStack.current.push(elements.map((el) => ({ ...el })))
      if (undoStack.current.length > MAX_UNDO) undoStack.current.shift()
      redoStack.current = []
    }, [])

    const undo = useCallback(() => {
      const api = excalidrawRef.current
      if (!api || undoStack.current.length === 0) return
      const current = api.getSceneElements() as unknown as Record<string, unknown>[]
      redoStack.current.push(current.map((el) => ({ ...el })))
      const previous = undoStack.current.pop()!
      api.updateScene({ elements: previous as never })
    }, [])

    const redo = useCallback(() => {
      const api = excalidrawRef.current
      if (!api || redoStack.current.length === 0) return
      const current = api.getSceneElements() as unknown as Record<string, unknown>[]
      undoStack.current.push(current.map((el) => ({ ...el })))
      const next = redoStack.current.pop()!
      api.updateScene({ elements: next as never })
    }, [])

    const zoomIn = useCallback(() => {
      const api = excalidrawRef.current
      if (!api) return
      const state = api.getAppState()
      const newZoom = (state.zoom?.value ?? 1) * 1.25
      api.updateScene({ appState: { zoom: { value: newZoom } } as never })
    }, [])

    const zoomOut = useCallback(() => {
      const api = excalidrawRef.current
      if (!api) return
      const state = api.getAppState()
      const newZoom = (state.zoom?.value ?? 1) / 1.25
      api.updateScene({ appState: { zoom: { value: newZoom } } as never })
    }, [])

    const clearCanvas = useCallback(() => {
      const api = excalidrawRef.current
      if (!api) return
      saveForUndo()
      api.updateScene({ elements: [] as never })
    }, [saveForUndo])

    const exportAsImage = useCallback(async () => {
      const api = excalidrawRef.current
      if (!api) return
      const elements = api.getSceneElements()
      const appState = api.getAppState()
      const blob = await exportToBlob({
        elements,
        appState,
        files: null,
        exportPadding: 20,
        mimeType: "image/png",
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `diagram-${Date.now()}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }, [])

    useImperativeHandle(ref, () => ({
      getSceneElements: () => {
        const api = excalidrawRef.current
        if (!api) return []
        const raw = api.getSceneElements() as unknown as Record<string, unknown>[]
        return raw.map(simplifyElement)
      },
      getViewport: () => {
        const api = excalidrawRef.current
        if (!api) return { width: 1200, height: 800 }
        const state = api.getAppState() as Record<string, unknown>
        const w = (state.width as number) || 1200
        const h = (state.height as number) || 800
        return { width: w, height: h }
      },
      undo,
      redo,
      zoomIn,
      zoomOut,
      clearCanvas,
      exportAsImage,
    }))

    const applyActions = useCallback(
      (actions: DiagramAction[]) => {
        const api = excalidrawRef.current
        if (!api) return

        saveForUndo()

        const raw = api.getSceneElements() as unknown as Record<string, unknown>[]
        const simpleElements = raw.map(simplifyElement)
        const result = processActions(actions, simpleElements)

        console.log("=== Applying actions ===")
        console.log("Actions:", JSON.stringify(actions, null, 2))
        console.log("Result:", JSON.stringify(result, null, 2))

        let newElements: Record<string, unknown>[]

        if (result.shouldClear) {
          newElements = []
        } else {
          const rawElements = [...raw]

          const sortedRemovals = [...result.elementsToRemove].sort((a, b) => b - a)
          for (const idx of sortedRemovals) {
            if (idx >= 0 && idx < rawElements.length) {
              rawElements.splice(idx, 1)
            }
          }

          for (const mod of result.elementsToModify) {
            if (mod.index >= 0 && mod.index < rawElements.length) {
              const target = rawElements[mod.index] as Record<string, unknown>
              if (mod.changes.strokeColor !== undefined) target.strokeColor = mod.changes.strokeColor
              if (mod.changes.backgroundColor !== undefined) target.backgroundColor = mod.changes.backgroundColor
              if (mod.changes.text !== undefined) target.text = mod.changes.text
              if (mod.changes.x !== undefined) target.x = mod.changes.x
              if (mod.changes.y !== undefined) target.y = mod.changes.y
              if (mod.changes.width !== undefined) target.width = mod.changes.width
              if (mod.changes.height !== undefined) target.height = mod.changes.height
              if (mod.changes.fontSize !== undefined) target.fontSize = mod.changes.fontSize
            }
          }

          newElements = rawElements
        }

        const elementsForRestore = result.elementsToAdd.map((el, i) => ({
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

        const restored = restoreElements(
          elementsForRestore as unknown as any[],
          null
        )

        const combined = [...newElements, ...restored]

        console.log("Calling updateScene with", combined.length, "elements")
        api.updateScene({
          elements: combined as unknown as never,
        })
      },
      []
    )

    useEffect(() => {
      if (actionsToApply.length > 0 && isLoaded) {
        applyActions(actionsToApply)
        onActionsApplied()
      }
    }, [actionsToApply, applyActions, onActionsApplied, isLoaded])

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
