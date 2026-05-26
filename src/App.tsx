import { useState, useCallback, useRef } from "react"
import ExcalidrawWrapper from "./components/ExcalidrawWrapper"
import type { ExcalidrawWrapperHandle } from "./components/ExcalidrawWrapper"
import VoiceControls from "./components/VoiceControls"
import { textToElements } from "./lib/llm"
import type { ExcalidrawElement } from "./types"
import "./App.css"

export default function App() {
  const [elementsToAdd, setElementsToAdd] = useState<ExcalidrawElement[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [statusMessage, setStatusMessage] = useState("")
  const excalidrawRef = useRef<ExcalidrawWrapperHandle>(null)

  const handleTranscript = useCallback(
    async (text: string) => {
      setIsProcessing(true)
      setStatusMessage(`Processing: "${text}"...`)

      try {
        const existing = excalidrawRef.current?.getSceneElements() ?? []
        const elements = await textToElements(text, existing)
        setElementsToAdd(elements)
        setStatusMessage(`Added ${elements.length} element(s)`)
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error"
        setStatusMessage(`Error: ${message}`)
      } finally {
        setIsProcessing(false)
      }
    },
    []
  )

  const handleElementsAdded = useCallback(() => {
    setElementsToAdd([])
  }, [])

  return (
    <div className="app">
      <header className="app-header">
        <h1>Voice → Excalidraw</h1>
        <div className="header-controls">
          <VoiceControls onTranscript={handleTranscript} disabled={isProcessing} />
        </div>
      </header>

      {statusMessage && (
        <div className={`status-bar ${statusMessage.startsWith("Error") ? "error" : ""}`}>
          {statusMessage}
        </div>
      )}

      <main className="app-main">
        <ExcalidrawWrapper
          ref={excalidrawRef}
          elementsToAdd={elementsToAdd}
          onElementsAdded={handleElementsAdded}
        />
      </main>

      <footer className="app-footer">
        <p>
          Say things like{" "}
          <em>"draw a red rectangle in the center"</em>,{" "}
          <em>"add a blue circle to the left"</em>,{" "}
          <em>"draw an arrow from the rectangle to the circle"</em>
        </p>
      </footer>
    </div>
  )
}
