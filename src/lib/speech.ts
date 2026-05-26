export interface SpeechCallbacks {
  onResult: (transcript: string, isFinal: boolean) => void
  onError: (error: string) => void
  onEnd: () => void
}

export function createSpeechRecognizer(callbacks: SpeechCallbacks) {
  const SpeechRecognition =
    (window as unknown as Record<string, unknown>).SpeechRecognition ??
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition

  if (!SpeechRecognition) {
    callbacks.onError("Speech recognition not supported in this browser. Try Chrome.")
    return null
  }

  const recognition = new (SpeechRecognition as new () => EventTarget)() as unknown as {
    continuous: boolean
    interimResults: boolean
    lang: string
    start: () => void
    stop: () => void
    abort: () => void
    onresult: ((event: Event) => void) | null
    onerror: ((event: Event) => void) | null
    onend: (() => void) | null
  }

  recognition.continuous = true
  recognition.interimResults = true
  recognition.lang = "en-US"

  recognition.onresult = (event: Event) => {
    const evt = event as Event & {
      resultIndex: number
      results: SpeechRecognitionResult[]
    }
    let finalTranscript = ""
    let interimTranscript = ""

    for (let i = evt.resultIndex; i < evt.results.length; i++) {
      const result = evt.results[i]
      if (result.isFinal) {
        finalTranscript += result[0].transcript
      } else {
        interimTranscript += result[0].transcript
      }
    }

    if (finalTranscript) {
      callbacks.onResult(finalTranscript, true)
    }
    if (interimTranscript) {
      callbacks.onResult(interimTranscript, false)
    }
  }

  recognition.onerror = (event: Event) => {
    const evt = event as Event & { error: string }
    callbacks.onError(`Speech error: ${evt.error}`)
  }

  recognition.onend = () => {
    callbacks.onEnd()
  }

  return {
    start: () => {
      try {
        recognition.start()
      } catch {
        // already started
      }
    },
    stop: () => {
      recognition.stop()
    },
    abort: () => {
      recognition.abort()
    },
  }
}
