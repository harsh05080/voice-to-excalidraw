import { useState, useRef, useCallback } from "react"
import { createSpeechRecognizer } from "../lib/speech"
import type { SpeechState } from "../types"

interface VoiceControlsProps {
  onTranscript: (text: string) => void
  disabled: boolean
}

export default function VoiceControls({ onTranscript, disabled }: VoiceControlsProps) {
  const [state, setState] = useState<SpeechState>({
    isListening: false,
    transcript: "",
    interimTranscript: "",
    error: null,
  })
  const recognizerRef = useRef<ReturnType<typeof createSpeechRecognizer> | null>(null)

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
          error: "Speech recognition not supported. Use Chrome.",
        }))
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

  return (
    <div className="voice-controls">
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
      {state.isListening && (
        <span className="status-dot" />
      )}
      {state.interimTranscript && (
        <div className="interim-text">{state.interimTranscript}</div>
      )}
      {state.error && (
        <div className="error-text">{state.error}</div>
      )}
    </div>
  )
}
