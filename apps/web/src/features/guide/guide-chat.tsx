"use client";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/features/auth/session";
import {
  streamChat,
  type ChatMessage,
  type ChatRequest,
} from "@/lib/api/agent";
import { RequestError } from "@/lib/api/client";
import Link from "next/link";

interface GuideChatProps {
  mode: "local" | "explore";
  scopeHygIds?: number[];
  selectedHygId?: number | null;
  onClose: () => void;
}

export function GuideChat({
  mode,
  scopeHygIds,
  selectedHygId,
  onClose,
}: GuideChatProps) {
  const { user } = useSession();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming || !user) return;

    const userMessage: ChatMessage = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setError(null);
    setStatusMessage(null);
    setIsStreaming(true);

    const recentMessages = newMessages.slice(-6);

    const requestBody: ChatRequest = {
      messages: recentMessages,
      mode,
      ...(mode === "local" && scopeHygIds
        ? { scope_hyg_ids: scopeHygIds, selected_hyg_id: selectedHygId }
        : {}),
    };

    abortControllerRef.current = new AbortController();

    try {
      let assistantContent = "";
      let hasError = false;

      for await (const event of streamChat(
        requestBody,
        abortControllerRef.current.signal,
      )) {
        if (event.type === "start") {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: "" },
          ]);
        } else if (event.type === "delta") {
          assistantContent += event.data.text;
          setMessages((prev) => {
            const updated = [...prev];
            if (updated[updated.length - 1]?.role === "assistant") {
              updated[updated.length - 1] = {
                role: "assistant",
                content: assistantContent,
              };
            }
            return updated;
          });
        } else if (event.type === "error") {
          hasError = true;
          setError(event.data.message);
          setMessages((prev) => prev.slice(0, -1));
        }
      }

      if (!hasError && assistantContent) {
        setMessages((prev) => {
          const updated = [...prev];
          if (updated[updated.length - 1]?.role === "assistant") {
            updated[updated.length - 1] = {
              role: "assistant",
              content: assistantContent,
            };
          }
          return updated;
        });
      }
    } catch (err) {
      if (err instanceof RequestError) {
        if (err.status === 401) {
          setStatusMessage("Please log in to use the guide.");
        } else if (err.status === 429) {
          setError(err.message);
        } else if (err.status === 503) {
          setError(
            err.code === "guide_busy"
              ? "The guide is busy. Please try again in a moment."
              : "The guide is currently unavailable.",
          );
        } else if (err.status === 504) {
          setError("The guide timed out. Please try again.");
        } else {
          setError(err.message);
        }
      } else if (
        err instanceof Error &&
        err.name !== "AbortError"
      ) {
        setError("Failed to connect to the guide.");
      }
      setMessages((prev) =>
        prev.filter((msg) => msg.content.trim() !== ""),
      );
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
      setMessages((prev) =>
        prev.filter((msg) => msg.content.trim() !== ""),
      );
    }
  };

  if (!user) {
    return (
      <div className="guide-chat-panel">
        <div className="guide-chat-header">
          <h2>Star Guide</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            ×
          </Button>
        </div>
        <div className="guide-login-prompt">
          <p>Sign in to ask the star guide about the sky.</p>
          <Link href="/login" className="text-link">
            Go to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="guide-chat-panel">
      <div className="guide-chat-header">
        <h2>Star Guide</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          ×
        </Button>
      </div>

      <div className="guide-chat-messages">
        {messages.length === 0 && (
          <div className="guide-empty-state">
            <p>
              {mode === "local"
                ? "Ask about the visible stars."
                : "Ask about any star in the catalog."}
            </p>
          </div>
        )}
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`guide-message guide-message-${msg.role}`}
          >
            <div className="guide-message-label">
              {msg.role === "user" ? "You" : "Guide"}
            </div>
            <div className="guide-message-content">{msg.content}</div>
          </div>
        ))}
        {error && (
          <div className="guide-error" role="alert">
            {error}
          </div>
        )}
        {statusMessage && (
          <div className="guide-status" role="status">
            {statusMessage}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="guide-chat-form">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about a star..."
          disabled={isStreaming}
          maxLength={2000}
          rows={3}
        />
        <div className="guide-chat-actions">
          {isStreaming ? (
            <Button type="button" variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
          ) : (
            <Button type="submit" disabled={!input.trim()}>
              Ask
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
