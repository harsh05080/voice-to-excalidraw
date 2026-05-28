import { useState, useCallback, useRef } from "react"
import ExcalidrawWrapper from "./components/ExcalidrawWrapper"
import type { ExcalidrawWrapperHandle } from "./components/ExcalidrawWrapper"
import VoiceControls from "./components/VoiceControls"
import ChatPanel from "./components/ChatPanel"
import { textToActions } from "./lib/llm"
import { processActions } from "./lib/actions"
import type { ExcalidrawElement, DiagramAction, ChatMessage } from "./types"
import "./App.css"

const MAX_HISTORY = 10

export default function App() {
  const [actionsToApply, setActionsToApply] = useState<DiagramAction[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [statusMessage, setStatusMessage] = useState("")
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatOpen, setChatOpen] = useState(true)
  const excalidrawRef = useRef<ExcalidrawWrapperHandle>(null)
  const conversationHistory = useRef<{ role: "user" | "assistant"; content: string }[]>([])

  const pushMessage = useCallback((role: "user" | "assistant", content: string) => {
    setChatMessages((prev) => [...prev, { role, content, timestamp: Date.now() }])
  }, [])

  const handleCommand = useCallback(
    (text: string): boolean => {
      const ref = excalidrawRef.current
      if (!ref) return false

      const trimmed = text.toLowerCase().trim()
      const words = trimmed.split(/\s+/).length

      if (words > 6) return false

      if (/^(undo|go back|reverse)\b/.test(trimmed)) {
        ref.undo()
        pushMessage("user", text)
        pushMessage("assistant", "Undone last change")
        setStatusMessage("Undone")
        return true
      }

      if (/^(redo|forward)\b/.test(trimmed)) {
        ref.redo()
        pushMessage("user", text)
        pushMessage("assistant", "Redone")
        setStatusMessage("Redone")
        return true
      }

      if (/^(clear|reset|new canvas|fresh start|wipe)\b/.test(trimmed)) {
        ref.clearCanvas()
        pushMessage("user", text)
        pushMessage("assistant", "Canvas cleared")
        setStatusMessage("Canvas cleared")
        conversationHistory.current = []
        return true
      }

      if (/^(zoom in|magnify|enlarge)\b/.test(trimmed)) {
        ref.zoomIn()
        pushMessage("user", text)
        pushMessage("assistant", "Zoomed in")
        setStatusMessage("Zoomed in")
        return true
      }

      if (/^(zoom out|shrink|smaller)\b/.test(trimmed)) {
        ref.zoomOut()
        pushMessage("user", text)
        pushMessage("assistant", "Zoomed out")
        setStatusMessage("Zoomed out")
        return true
      }

      if (/^(export|save|download|screenshot)\b/.test(trimmed)) {
        pushMessage("user", text)
        ref.exportAsImage()
          .then(() => {
            pushMessage("assistant", "Exported as PNG")
            setStatusMessage("Exported as PNG")
          })
          .catch(() => {
            pushMessage("assistant", "Export failed")
            setStatusMessage("Export failed")
          })
        return true
      }

      return false
    },
    [pushMessage]
  )

  const handleTranscript = useCallback(
    async (text: string) => {
      if (handleCommand(text)) return

      setIsProcessing(true)
      setStatusMessage(`Processing...`)
      pushMessage("user", text)

      try {
        const elements = excalidrawRef.current?.getSceneElements() ?? []
        const viewport = excalidrawRef.current?.getViewport() ?? { width: 1200, height: 800 }
        const history = conversationHistory.current.slice(-MAX_HISTORY)

        const { actions, reply } = await textToActions(
          text,
          elements,
          viewport.width,
          viewport.height,
          history
        )

        conversationHistory.current.push({ role: "user", content: text })

        const result = processActions(actions, elements)
        let summary = ""

        if (result.shouldClear) summary = "Cleared canvas"
        if (result.elementsToRemove.length > 0) summary += ` Removed ${result.elementsToRemove.length}`
        if (result.elementsToModify.length > 0) summary += ` Modified ${result.elementsToModify.length}`
        if (result.elementsToAdd.length > 0) summary += ` Added ${result.elementsToAdd.length}`

        const aiReply = reply || summary.trim() || "No changes made."
        pushMessage("assistant", aiReply)
        conversationHistory.current.push({ role: "assistant", content: aiReply })

        setActionsToApply(actions)

        if (summary) {
          setStatusMessage(summary.trim())
        } else {
          setStatusMessage(aiReply)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error"
        pushMessage("assistant", `Error: ${message}`)
        setStatusMessage(`Error: ${message}`)
      } finally {
        setIsProcessing(false)
      }
    },
    [pushMessage, handleCommand]
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
        <div className="canvas-area">
          <ExcalidrawWrapper
            ref={excalidrawRef}
            actionsToApply={actionsToApply}
            onActionsApplied={handleActionsApplied}
          />
        </div>
        <ChatPanel
          messages={chatMessages}
          isProcessing={isProcessing}
          isOpen={chatOpen}
          onToggle={() => setChatOpen((o) => !o)}
        />
      </main>

      <footer className="app-footer">
        <p>
          Say things like{" "}
          <em>"design a URL shortener with a load balancer and database"</em>
        </p>
      </footer>
    </div>
  )
}
