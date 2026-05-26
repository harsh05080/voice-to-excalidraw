import { useState, useCallback, useRef } from "react"
import ExcalidrawWrapper from "./components/ExcalidrawWrapper"
import type { ExcalidrawWrapperHandle } from "./components/ExcalidrawWrapper"
import VoiceControls from "./components/VoiceControls"
import { createLLM } from "./lib/llm"
import type { ExcalidrawElement, LLMConfig } from "./types"
import "./App.css"

const DEFAULT_CONFIG: LLMConfig = {
  apiKey: import.meta.env.VITE_OPENAI_API_KEY ?? "",
  model: import.meta.env.VITE_OPENAI_MODEL ?? "gpt-4o-mini",
  baseUrl: import.meta.env.VITE_OPENAI_BASE_URL ?? undefined,
}

export default function App() {
  const [elementsToAdd, setElementsToAdd] = useState<ExcalidrawElement[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [statusMessage, setStatusMessage] = useState("")
  const [config, setConfig] = useState<LLMConfig>(DEFAULT_CONFIG)
  const [showConfig, setShowConfig] = useState(!DEFAULT_CONFIG.apiKey)
  const excalidrawRef = useRef<ExcalidrawWrapperHandle>(null)

  const handleTranscript = useCallback(
    async (text: string) => {
      if (!config.apiKey) {
        setShowConfig(true)
        setStatusMessage("Set your OpenAI API key first")
        return
      }

      setIsProcessing(true)
      setStatusMessage(`Processing: "${text}"...`)

      try {
        const existing = excalidrawRef.current?.getSceneElements() ?? []
        const llm = createLLM(config)
        const elements = await llm.textToElements(text, existing)
        setElementsToAdd(elements)
        setStatusMessage(`Added ${elements.length} element(s)`)
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error"
        setStatusMessage(`Error: ${message}`)
      } finally {
        setIsProcessing(false)
      }
    },
    [config]
  )

  const handleElementsAdded = useCallback(() => {
    setElementsToAdd([])
  }, [])

  const handleConfigSave = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const formData = new FormData(form)
    setConfig({
      apiKey: (formData.get("apiKey") as string) || "",
      model: (formData.get("model") as string) || "gpt-4o-mini",
      baseUrl: (formData.get("baseUrl") as string) || undefined,
    })
    setShowConfig(false)
    setStatusMessage("Configuration saved")
  }, [])

  return (
    <div className="app">
      <header className="app-header">
        <h1>Voice → Excalidraw</h1>
        <div className="header-controls">
          <VoiceControls onTranscript={handleTranscript} disabled={isProcessing} />
          <button
            className="config-toggle"
            onClick={() => setShowConfig(!showConfig)}
            title="Settings"
          >
            ⚙️
          </button>
        </div>
      </header>

      {showConfig && (
        <div className="config-panel">
          <form onSubmit={handleConfigSave}>
            <label>
              OpenAI API Key
              <input
                type="password"
                name="apiKey"
                defaultValue={config.apiKey}
                placeholder="sk-..."
                required
              />
            </label>
            <label>
              Model
              <select name="model" defaultValue={config.model}>
                <option value="gpt-4o-mini">GPT-4o Mini</option>
                <option value="gpt-4o">GPT-4o</option>
                <option value="gpt-4o-turbo">GPT-4o Turbo</option>
              </select>
            </label>
            <label>
              API Base URL (optional)
              <input
                type="text"
                name="baseUrl"
                defaultValue={config.baseUrl ?? ""}
                placeholder="https://api.openai.com/v1"
              />
            </label>
            <div className="config-actions">
              <button type="submit">Save</button>
              <button type="button" onClick={() => setShowConfig(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

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
