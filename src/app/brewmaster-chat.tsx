"use client";

import { Bot, Minimize2, Maximize2, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface AgentResponse {
  role: "brewmaster" | "support";
  batchId?: string;
  message: string;
  toolsUsed?: string[];
  pendingAction?: {
    type: "approve_qa" | "send_signal";
    payload: unknown;
  };
}

type ChatRole = "user" | "agent";
interface ChatMessage { role: ChatRole; text: string }

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) }
  });
  const json = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error((json as { error?: string }).error ?? res.statusText);
  return json;
}

interface BrewmasterChatProps {
  batchId?: string;
}

export function BrewmasterChat({ batchId }: BrewmasterChatProps) {
  const [open, setOpen]    = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "agent", text: "Ask me what is happening with the current batch." }
  ]);
  const [input, setInput]             = useState("Should I be worried?");
  const [pendingAction, setPendingAction] = useState<AgentResponse["pendingAction"]>();
  const [busy, setBusy]               = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages, open]);

  async function send(confirm = false) {
    if (!input.trim() && !confirm) return;
    const text = confirm ? "Confirm action" : input;
    if (!confirm) setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetchJson<AgentResponse>("/api/agents/brewmaster/chat", {
        method: "POST",
        body: JSON.stringify({ batchId: batchId || undefined, message: text, pendingAction, confirm })
      });
      setPendingAction(res.pendingAction);
      setMessages((m) => [...m, { role: "agent", text: res.message }]);
    } catch (err) {
      setMessages((m) => [...m, { role: "agent", text: `Error: ${err instanceof Error ? err.message : String(err)}` }]);
    } finally {
      setBusy(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
  }

  return (
    <div className={`brew-float ${open ? "brew-float--open" : ""}`}>
      {open ? (
        <div className="brew-window">
          {/* Header */}
          <div className="brew-header">
            <Bot size={16} />
            <span>Brewmaster AI</span>
            {batchId && <span className="brew-batch-id">{batchId.slice(0, 8)}…</span>}
            <button className="brew-minimize" onClick={() => setOpen(false)} title="Minimize">
              <Minimize2 size={14} />
            </button>
          </div>

          {/* Chat log */}
          <div className="brew-log" ref={logRef}>
            {messages.map((m, i) => (
              <p className={m.role} key={i}>{m.text}</p>
            ))}
            {busy && <p className="agent typing">Thinking…</p>}
          </div>

          {/* Confirm pending action */}
          {pendingAction && (
            <button
              className="primary brew-confirm"
              disabled={busy}
              onClick={() => void send(true)}
            >
              Confirm Agent Action
            </button>
          )}

          {/* Input */}
          <div className="brew-input">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask the brewmaster…"
              disabled={busy}
            />
            <button disabled={busy || !input.trim()} onClick={() => void send()}>
              <Send size={15} />
            </button>
          </div>
        </div>
      ) : (
        <button className="brew-bubble" onClick={() => setOpen(true)} title="Open Brewmaster AI">
          <Bot size={22} />
          <span>Brewmaster AI</span>
          {messages.length > 1 && (
            <span className="brew-badge">{messages.filter((m) => m.role === "agent").length}</span>
          )}
        </button>
      )}
    </div>
  );
}
