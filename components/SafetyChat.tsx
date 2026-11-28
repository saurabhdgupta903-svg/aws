"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, PhoneCall, Send, Trash2 } from "lucide-react";
import type { Lang, Translations } from "@/lib/i18n";
import type { RiskLevel } from "@/lib/risk";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  suggestEmergency?: boolean;
}

interface SafetyChatProps {
  cityLevel: RiskLevel;
  lang: Lang;
  t: Translations;
}

/**
 * Render plain text safely with only **bold** inline spans and simple bullet/numbered lists.
 * Never uses dangerouslySetInnerHTML.
 */
function renderSafeFormatted(text: string): React.ReactNode {
  const renderBold = (line: string) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
        return (
          <strong key={idx} className="font-semibold text-white">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return <span key={idx}>{part}</span>;
    });
  };

  const lines = text.split(/\r?\n/);
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-1" />;
        const bulletMatch = trimmed.match(/^[-*•]\s+(.*)$/);
        if (bulletMatch) {
          return (
            <div key={i} className="flex items-start gap-1.5 pl-1">
              <span className="text-cyan-400">•</span>
              <span>{renderBold(bulletMatch[1])}</span>
            </div>
          );
        }
        const numMatch = trimmed.match(/^(\d+\.)\s+(.*)$/);
        if (numMatch) {
          return (
            <div key={i} className="flex items-start gap-1.5 pl-1">
              <span className="text-cyan-400 font-semibold">{numMatch[1]}</span>
              <span>{renderBold(numMatch[2])}</span>
            </div>
          );
        }
        return <p key={i}>{renderBold(trimmed)}</p>;
      })}
    </div>
  );
}

export default function SafetyChat({ cityLevel, lang, t }: SafetyChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const idSeqRef = useRef(0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || loading) return;
    if (trimmed.length > 500) {
      setErrorMsg("Message must be 500 characters or fewer.");
      return;
    }

    setErrorMsg(null);
    idSeqRef.current += 1;
    const userMsg: ChatMessage = {
      id: `u-${idSeqRef.current}`,
      role: "user",
      content: trimmed,
    };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const history = nextMessages.slice(-7, -1).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history,
          riskLevel: cityLevel,
          language: lang,
        }),
      });

      const data = (await res.json()) as {
        reply?: string;
        suggestEmergency?: boolean;
        error?: string;
      };

      if (!res.ok) {
        setErrorMsg(data.error || "Unable to get a response right now.");
        return;
      }

      idSeqRef.current += 1;
      const botMsg: ChatMessage = {
        id: `a-${idSeqRef.current}`,
        role: "assistant",
        content: data.reply || "",
        suggestEmergency: Boolean(data.suggestEmergency),
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch {
      setErrorMsg("Network error. Please try again or call 112 in an emergency.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  };

  return (
    <section
      aria-label={t.chatTitle}
      className="rounded-2xl bg-slate-900/90 border border-cyan-500/25 p-4 space-y-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center shrink-0">
            <Bot className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">{t.chatTitle}</h3>
            <p className="text-[11px] text-slate-400">{t.chatSubtitle}</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setMessages([]);
              setErrorMsg(null);
            }}
            className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white px-2 py-1 rounded-lg hover:bg-slate-800 transition-colors"
            aria-label={t.chatClear}
          >
            <Trash2 className="w-3 h-3" />
            <span>{t.chatClear}</span>
          </button>
        )}
      </div>

      {/* Suggestion Chips */}
      <div className="flex flex-wrap gap-1.5">
        {t.chatChips.map((chip) => (
          <button
            key={chip}
            type="button"
            disabled={loading}
            onClick={() => void sendMessage(chip)}
            className="text-left text-[11px] px-2.5 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-800 border border-slate-700 hover:border-cyan-500/40 text-cyan-200 disabled:opacity-50 transition-colors"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Message List */}
      {messages.length > 0 && (
        <div className="max-h-64 overflow-y-auto space-y-2.5 pr-1">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${
                msg.role === "user" ? "items-end" : "items-start"
              }`}
            >
              <div
                className={`max-w-[90%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                  msg.role === "user"
                    ? "bg-cyan-500 text-slate-950 font-medium"
                    : "bg-slate-800/90 border border-slate-700 text-slate-200"
                }`}
              >
                {msg.role === "user" ? msg.content : renderSafeFormatted(msg.content)}
              </div>
              {msg.role === "assistant" && msg.suggestEmergency && (
                <a
                  href="tel:112"
                  className="mt-1.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-sm transition-colors"
                >
                  <PhoneCall className="w-3.5 h-3.5" />
                  {t.chatEmergencyBtn}
                </a>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-xs text-slate-400 px-2 py-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
              <span>...</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {errorMsg && (
        <p
          role="alert"
          className="text-xs text-red-200 bg-red-950/40 border border-red-500/30 rounded-xl px-3 py-2"
        >
          {errorMsg}
        </p>
      )}

      {/* Input Row */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void sendMessage(input);
        }}
        className="flex items-center gap-2"
      >
        <input
          type="text"
          maxLength={500}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t.chatPlaceholder}
          disabled={loading}
          aria-label={t.chatPlaceholder}
          className="flex-1 min-w-0 rounded-xl bg-slate-800/90 border border-slate-700 focus:border-cyan-400 focus:outline-none px-3 py-2.5 text-xs text-white placeholder:text-slate-500 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          aria-label="Send message"
          className="p-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 transition-colors shrink-0"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </form>

      <p className="text-[11px] text-slate-400 text-center">{t.chatNote}</p>
    </section>
  );
}
