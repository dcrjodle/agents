import { useRef, useEffect, useState, useCallback } from "react";
import "../styles/ana-chat-panel.css";

const QUICK_ACTIONS = ["Check tasks", "Show errors", "Run query"];

const WELCOME_MESSAGE = "Hi! I'm Ana. I can help you with tasks, database queries, and debugging. What would you like to do?";

/**
 * AnaChatPanel — dropdown/overlay chat interface for Ana.
 *
 * Props:
 *   isOpen        — whether the panel is visible
 *   onClose       — callback to close the panel
 *   messages      — array of { id, role: 'user'|'assistant', content, timestamp }
 *   onSendMessage — callback(text: string) to send a message
 *   isLoading     — whether Ana is currently generating a response
 *   error         — error string or null
 */
export function AnaChatPanel({ isOpen, onClose, messages = [], onSendMessage, isLoading = false, error = null }) {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Auto-scroll to bottom when messages change or loading changes
  useEffect(() => {
    if (isOpen && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading, isOpen]);

  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (!text || isLoading) return;
    setInputValue("");
    if (onSendMessage) onSendMessage(text);
  }, [inputValue, isLoading, onSendMessage]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleQuickAction = useCallback(
    (action) => {
      if (isLoading) return;
      if (onSendMessage) onSendMessage(action);
    },
    [isLoading, onSendMessage]
  );

  const handleOverlayClick = useCallback(
    (e) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  const handlePanelClick = useCallback((e) => {
    e.stopPropagation();
  }, []);

  if (!isOpen) return null;

  const showWelcome = messages.length === 0;

  return (
    <div className="ana-chat-overlay" onClick={handleOverlayClick}>
      <div className="ana-chat-panel" onClick={handlePanelClick}>
        {/* Header */}
        <div className="ana-chat-panel-header">
          <span className="ana-chat-panel-title">Chat with Ana</span>
          <button
            className="ana-chat-panel-close"
            onClick={onClose}
            aria-label="Close chat"
          >
            ✕
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="ana-chat-error">
            {error}
          </div>
        )}

        {/* Messages */}
        <div className="ana-chat-panel-messages">
          {showWelcome ? (
            <div className="ana-chat-message ana-chat-message--assistant">
              <div className="ana-chat-message-bubble">
                {WELCOME_MESSAGE}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`ana-chat-message ana-chat-message--${msg.role}`}
              >
                <div className="ana-chat-message-bubble">
                  {msg.content}
                </div>
                {msg.timestamp && (
                  <div className="ana-chat-message-timestamp">
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                )}
              </div>
            ))
          )}

          {/* Typing indicator */}
          {isLoading && (
            <div className="ana-chat-message ana-chat-message--assistant">
              <div className="ana-chat-message-bubble ana-chat-message-bubble--typing">
                <span className="ana-chat-typing-dot" />
                <span className="ana-chat-typing-dot" />
                <span className="ana-chat-typing-dot" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick actions */}
        <div className="ana-chat-quick-actions">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action}
              className="ana-chat-quick-action-btn"
              onClick={() => handleQuickAction(action)}
              disabled={isLoading}
            >
              {action}
            </button>
          ))}
        </div>

        {/* Input area */}
        <div className="ana-chat-input-container">
          <textarea
            ref={inputRef}
            className="ana-chat-input"
            placeholder="Ask Ana something..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            rows={1}
          />
          <button
            className="ana-chat-send-btn"
            onClick={handleSend}
            disabled={isLoading || !inputValue.trim()}
            aria-label="Send message"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}
