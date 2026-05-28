import { useRef, useEffect } from "react"
import type { ChatMessage } from "../types"

interface ChatPanelProps {
  messages: ChatMessage[]
  isProcessing: boolean
  isOpen: boolean
  onToggle: () => void
}

export default function ChatPanel({ messages, isProcessing, isOpen, onToggle }: ChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  return (
    <div className={`chat-panel ${isOpen ? "open" : "closed"}`}>
      <button className="chat-toggle" onClick={onToggle} title={isOpen ? "Close chat" : "Open chat"}>
        {isOpen ? "✕" : "💬"}
      </button>

      {isOpen && (
        <div className="chat-content">
          <div className="chat-header">
            <h2>Design Log</h2>
            <span className="chat-count">{messages.length}</span>
          </div>

          <div className="chat-messages">
            {messages.length === 0 && (
              <div className="chat-empty">
                Your conversation with the AI will appear here.
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`chat-msg ${msg.role}`}>
                <div className="chat-msg-role">
                  {msg.role === "user" ? "You" : "AI"}
                </div>
                <div className="chat-msg-content">{msg.content}</div>
              </div>
            ))}

            {isProcessing && (
              <div className="chat-msg assistant typing">
                <div className="chat-msg-role">AI</div>
                <div className="chat-msg-content">
                  <span className="typing-dot">.</span>
                  <span className="typing-dot">.</span>
                  <span className="typing-dot">.</span>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>
      )}
    </div>
  )
}
