import { useState, useEffect, useCallback, useRef } from "react";

import { API_BASE, WS_URL } from "../config.js";

/**
 * useAnaChat — manages Ana chat state, message history, and WebSocket communication.
 *
 * Connects to the shared WebSocket to receive ANA_STREAM, ANA_MESSAGE, and ANA_ERROR events.
 */
export function useAnaChat({ projectPath, selectedTaskId }) {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [streamingContent, setStreamingContent] = useState("");
  const activeChatIdRef = useRef(null);
  const wsRef = useRef(null);

  // Connect to WebSocket for receiving Ana messages
  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      // Filter to only our active chat
      if (data.chatId && data.chatId !== activeChatIdRef.current) {
        return;
      }

      if (data.type === "ANA_STREAM") {
        setStreamingContent((prev) => prev + (data.data || ""));
      } else if (data.type === "ANA_MESSAGE") {
        const content = data.result?.response || data.result?.content || JSON.stringify(data.result);
        const assistantMessage = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
        setStreamingContent("");
        setIsLoading(false);
        activeChatIdRef.current = null;
      } else if (data.type === "ANA_ERROR") {
        setError(data.error || "An error occurred");
        setIsLoading(false);
        activeChatIdRef.current = null;
      }
    };

    ws.onerror = () => {
      // WebSocket errors are handled by reconnect in useWorkflow; we just need to not crash
    };

    return () => {
      ws.close();
    };
  }, []);

  const sendMessage = useCallback(
    async (text) => {
      if (!projectPath) {
        setError("No project selected");
        return;
      }

      const userMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);
      setError(null);
      setStreamingContent("");

      try {
        const res = await fetch(`${API_BASE}/ana/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            message: text,
            context: { projectPath, selectedTaskId },
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(errData.error || `Request failed: ${res.statusText}`);
        }

        const { chatId } = await res.json();
        activeChatIdRef.current = chatId;
      } catch (err) {
        setError(err.message || "Failed to send message");
        setIsLoading(false);
      }
    },
    [projectPath, selectedTaskId]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setStreamingContent("");
  }, []);

  return {
    messages,
    sendMessage,
    isLoading,
    error,
    streamingContent,
    clearError,
    clearMessages,
  };
}
