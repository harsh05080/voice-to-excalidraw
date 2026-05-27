import { useState, useCallback, useRef } from "react"
import ExcalidrawWrapper from "./components/ExcalidrawWrapper"
import type { ExcalidrawWrapperHandle } from "./components/ExcalidrawWrapper"
import VoiceControls from "./components/VoiceControls"
import { textToActions } from "./lib/llm"
import { processActions } from "./lib/actions"
import type { ExcalidrawElement, DiagramAction } from "./types"
import "./App.css"

const MAX_HISTORY = 10

export default function App() {
  const [actionsToApply, setActionsToApply] = useState<DiagramAction[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [statusMessage, setStatusMessage] = useState("")
  const excalidrawRef = useRef<ExcalidrawWrapperHandle>(null)
  const conversationHistory = useRef<{ role: "user" | "assistant"; content: string }[]>([])

  const handleTranscript = useCallback(
    async (text: string) => {
      setIsProcessing(true)
      setStatusMessage(`Processing: "${text}"...`)

      try {
        const elements = excalidrawRef.current?.getSceneElements() ?? []
        const viewport = excalidrawRef.current?.getViewport() ?? { width: 1200, height: 800 }
        const history = conversationHistory.current.slice(-MAX_HISTORY)

        const actions = await textToActions(
          text,
          elements,
          viewport.width,
          viewport.height,
          history
        )

        conversationHistory.current.push({ role: "user", content: text })

        const result = processActions(actions, elements)
        let summary = ""

        if (result.shouldClear) {
          summary = "Cleared canvas"
        }
        if (result.elementsToRemove.length > 0) {
          summary += ` Removed ${result.elementsToRemove.length} element(s)`
        }
        if (result.elementsToModify.length > 0) {
          summary += ` Modified ${result.elementsToModify.length} element(s)`
        }
        if (result.elementsToAdd.length > 0) {
          summary += ` Added ${result.elementsToAdd.length} element(s)`
        }

        setActionsToApply(actions)

        if (summary) {
          setStatusMessage(summary.trim())
          conversationHistory.current.push({
            role: "assistant",
            content: `Applied: ${summary.trim()}`,
          })
        } else {
          setStatusMessage("No changes made")
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error"
        setStatusMessage(`Error: ${message}`)
      } finally {
        setIsProcessing(false)
      }
    },
    []
  )

  const handleActionsApplied = useCallback(() => {
    setActionsToApply([])
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
          actionsToApply={actionsToApply}
          onActionsApplied={handleActionsApplied}
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
