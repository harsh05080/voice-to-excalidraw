import { useState, useRef, useCallback, useEffect } from "react"
import { createSpeechRecognizer, isSpeechRecognitionSupported } from "../lib/speech"
import type { SpeechState } from "../types"

interface VoiceControlsProps {
  onTranscript: (text: string) => void
  disabled: boolean
}

export default function VoiceControls({ onTranscript, disabled }: VoiceControlsProps) {
  const [speechSupported, setSpeechSupported] = useState<boolean | null>(null)
  const [state, setState] = useState<SpeechState>({
    isListening: false,
    transcript: "",
    interimTranscript: "",
    error: null,
  })
  const [textInput, setTextInput] = useState("")
  const [showTextInput, setShowTextInput] = useState(false)
  const recognizerRef = useRef<ReturnType<typeof createSpeechRecognizer> | null>(null)

  useEffect(() => {
    setSpeechSupported(isSpeechRecognitionSupported())
  }, [])

  const handleResult = useCallback(
    (text: string, isFinal: boolean) => {
      if (isFinal) {
        setState((prev) => ({
          ...prev,
          transcript: prev.transcript + " " + text,
          interimTranscript: "",
        }))
        onTranscript(text)
      } else {
        setState((prev) => ({ ...prev, interimTranscript: text }))
      }
    },
    [onTranscript]
  )

  const handleError = useCallback((error: string) => {
    setState((prev) => ({ ...prev, error }))
  }, [])

  const handleEnd = useCallback(() => {
    setState((prev) => ({ ...prev, isListening: false }))
  }, [])

  const toggleListening = useCallback(() => {
    if (state.isListening) {
      recognizerRef.current?.stop()
      setState((prev) => ({ ...prev, isListening: false }))
    } else {
      const recognizer = createSpeechRecognizer({
        onResult: handleResult,
        onError: handleError,
        onEnd: handleEnd,
      })

      if (!recognizer) {
        setState((prev) => ({
          ...prev,
          error: "Speech recognition not available.",
        }))
        setShowTextInput(true)
        return
      }

      recognizerRef.current = recognizer
      recognizer.start()
      setState((prev) => ({
        ...prev,
        isListening: true,
        error: null,
        transcript: "",
        interimTranscript: "",
      }))
    }
  }, [state.isListening, handleResult, handleError, handleEnd])

  const handleTextSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (textInput.trim()) {
        onTranscript(textInput.trim())
        setTextInput("")
        setShowTextInput(false)
      }
    },
    [textInput, onTranscript]
  )

  if (speechSupported === null) {
    return <div className="voice-controls">Loading...</div>
  }

  return (
    <div className="voice-controls">
      {speechSupported && (
        <>
          <button
            className={`voice-btn ${state.isListening ? "listening" : ""}`}
            onClick={toggleListening}
            disabled={disabled}
            title={state.isListening ? "Stop listening" : "Start voice input"}
          >
            <span className="mic-icon">
              {state.isListening ? "🔴" : "🎤"}
            </span>
            {state.isListening ? "Stop" : "Speak"}
          </button>
          <button
            className="voice-btn"
            onClick={() => setShowTextInput(!showTextInput)}
            disabled={disabled}
            title="Type command instead"
          >
            ✏️
          </button>
        </>
      )}

      {(!speechSupported || showTextInput) && (
        <form onSubmit={handleTextSubmit} style={{ display: "flex", gap: "4px", alignItems: "center" }}>
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Type your command..."
            disabled={disabled}
            style={{
              padding: "6px 10px",
              border: "1px solid #ddd",
              borderRadius: "4px",
              fontSize: "14px",
              minWidth: "200px",
            }}
          />
          <button
            type="submit"
            className="voice-btn"
            disabled={disabled || !textInput.trim()}
          >
            Draw
          </button>
        </form>
      )}

      {state.isListening && (
        <span className="status-dot" />
      )}
      {state.interimTranscript && !showTextInput && (
        <div className="interim-text">{state.interimTranscript}</div>
      )}
      {state.error && (
        <div className="error-text">{state.error}</div>
      )}
    </div>
  )
}
