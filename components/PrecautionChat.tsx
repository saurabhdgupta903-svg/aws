"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Bot,
  Loader2,
  PhoneCall,
  Send,
  Trash2,
} from "lucide-react";
import type { Lang } from "@/lib/i18n";
import type { RiskLevel } from "@/lib/risk";

interface ChatBubble {
  id: string;
  role: "user" | "assistant";
  content: string;
  isError?: boolean;
}

interface PrecautionChatProps {
  cityLevel: RiskLevel;
  cityName?: string;
  lang: Lang;
}

interface ChatCopy {
  title: string;
  subtitle: string;
  disclaimer: string;
  placeholder: string;
  sendLabel: string;
  clearLabel: string;
  thinking: string;
  emptyPrompt: string;
  callEmergencyCta: string;
  charLimitHint: string;
  rateLimitedMsg: string;
  timeoutMsg: string;
  genericErrorMsg: string;
  suggestions: string[];
}

const CHAT_COPY: Record<Lang, ChatCopy> = {
  en: {
    title: "Ask Safety Assistant",
    subtitle: "Answers grounded in FloodLoop precaution guidance",
    disclaimer: "AI-generated guidance. In an emergency, call 112.",
    placeholder: "Ask about flood safety, driving, or kits...",
    sendLabel: "Send message",
    clearLabel: "Clear chat",
    thinking: "Checking safety guidance...",
    emptyPrompt:
      "Ask a safety question below or tap a quick topic to get step-by-step guidance.",
    callEmergencyCta: "Call 112 Now (Emergency)",
    charLimitHint: "Max 500 characters",
    rateLimitedMsg:
      "You've sent too many messages. Please wait a moment before asking again.",
    timeoutMsg: "The request timed out. Please try again.",
    genericErrorMsg:
      "Unable to reach the safety assistant right now. Please check the precautions above or call 112 in an emergency.",
    suggestions: [
      "What should I do during a flood?",
      "What goes in an emergency kit?",
      "Is it safe to drive through water?",
      "When should I avoid ghat roads?",
    ],
  },
  mr: {
    title: "सुरक्षा सहाय्यकाला विचारा",
    subtitle: "FloodLoop खबरदारी मार्गदर्शनावर आधारित उत्तरे",
    disclaimer: "AI-निर्मित मार्गदर्शन. आपत्कालीन स्थितीत 112 वर कॉल करा.",
    placeholder: "पूर सुरक्षा, वाहन चालवणे किंवा किटबद्दल विचारा...",
    sendLabel: "संदेश पाठवा",
    clearLabel: "चॅट साफ करा",
    thinking: "सुरक्षा मार्गदर्शन तपासत आहे...",
    emptyPrompt:
      "खालील पैकी एखादा प्रश्न निवडा किंवा तुमचा सुरक्षा प्रश्न विचारा.",
    callEmergencyCta: "आत्ताच 112 वर कॉल करा (आपत्कालीन)",
    charLimitHint: "कमाल ५०० अक्षरे",
    rateLimitedMsg:
      "खूप जास्त संदेश पाठवले आहेत. कृपया थोड्या वेळाने पुन्हा प्रयत्न करा.",
    timeoutMsg: "वेळ मर्यादा संपली. कृपया पुन्हा प्रयत्न करा.",
    genericErrorMsg:
      "सहाय्यक सध्या उपलब्ध नाही. कृपया वरील सूचना पहा किंवा आपत्कालीन स्थितीत 112 वर कॉल करा.",
    suggestions: [
      "पूर आल्यास मी काय करावे?",
      "आपत्कालीन किटमध्ये काय असावे?",
      "पाण्यातून वाहन चालवणे सुरक्षित आहे का?",
      "घाट रस्त्यावर प्रवास कधी टाळावा?",
    ],
  },
  hi: {
    title: "सुरक्षा सहायक से पूछें",
    subtitle: "FloodLoop सावधानी दिशानिर्देशों पर आधारित उत्तर",
    disclaimer: "AI द्वारा जनित मार्गदर्शन। आपात स्थिति में 112 पर कॉल करें।",
    placeholder: "बाढ़ सुरक्षा, ड्राइविंग या किट के बारे में पूछें...",
    sendLabel: "संदेश भेजें",
    clearLabel: "चैट साफ़ करें",
    thinking: "सुरक्षा दिशानिर्देश जाँच रहे हैं...",
    emptyPrompt:
      "नीचे दिए गए त्वरित विषय चुनें या अपना सुरक्षा प्रश्न पूछें।",
    callEmergencyCta: "अभी 112 पर कॉल करें (आपातकालीन)",
    charLimitHint: "अधिकतम 500 अक्षर",
    rateLimitedMsg:
      "बहुत अधिक संदेश भेजे गए हैं। कृपया थोड़ी देर बाद फिर प्रयास करें।",
    timeoutMsg: "अनुरोध का समय समाप्त हो गया। कृपया पुनः प्रयास करें।",
    genericErrorMsg:
      "सुरक्षा सहायक अभी उपलब्ध नहीं है। कृपया ऊपर दिए निर्देश देखें या आपात स्थिति में 112 पर कॉल करें।",
    suggestions: [
      "बाढ़ के दौरान मुझे क्या करना चाहिए?",
      "इमरजेंसी किट में क्या रखना चाहिए?",
      "क्या पानी से भरी सड़क पर गाड़ी चलाना सुरक्षित है?",
      "घाट की सड़कों पर यात्रा कब टालनी चाहिए?",
    ],
  },
};

const EMERGENCY_MENTION_RE =
  /\b(112|1070|100|101|1916|emergency|fire brigade|police|disaster control|ndrf)\b|(आपत्कालीन|आपातकालीन|अग्निशमन|फायर ब्रिगेड|पोलीस|पुलिस)/i;

function renderInlineBold(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={`${keyPrefix}-b-${idx}`} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={`${keyPrefix}-t-${idx}`}>{part}</span>;
  });
}

/**
 * Safely render simple markdown (bold + bullet/numbered lists) as React elements
 * without any HTML injection or dangerouslySetInnerHTML.
 */
function SafeMarkdown({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let listItems: string[] = [];
  let listKey = 0;

  const flushList = () => {
    if (listItems.length === 0) return;
    const currentKey = listKey++;
    blocks.push(
      <ul key={`ul-${currentKey}`} className="list-disc pl-4 space-y-1 my-1">
        {listItems.map((item, idx) => (
          <li key={`li-${currentKey}-${idx}`}>
            {renderInlineBold(item, `li-${currentKey}-${idx}`)}
          </li>
        ))}
      </ul>
    );
    listItems = [];
  };

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      return;
    }
    const bulletMatch = line.match(/^([-*•]|\d+[.)])\s+(.*)$/);
    if (bulletMatch) {
      listItems.push(bulletMatch[2]);
      return;
    }
    flushList();
    blocks.push(
      <p key={`p-${idx}`} className="leading-relaxed">
        {renderInlineBold(line, `p-${idx}`)}
      </p>
    );
  });

  flushList();

  return <div className="space-y-1.5 text-xs sm:text-sm">{blocks}</div>;
}

export default function PrecautionChat({
  cityLevel,
  cityName,
  lang,
}: PrecautionChatProps) {
  const copy = CHAT_COPY[lang];
  const [messages, setMessages] = useState<ChatBubble[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const nextIdRef = useRef(1);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isSending]);

  const sendMessage = async (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed || isSending) return;
    if (trimmed.length > 500) {
      setErrorBanner(copy.charLimitHint);
      return;
    }

    setErrorBanner(null);
    const userBubble: ChatBubble = {
      id: `u-${nextIdRef.current++}`,
      role: "user",
      content: trimmed,
    };

    const historyPayload = messages
      .filter((m) => !m.isError)
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userBubble]);
    setInput("");
    setIsSending(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 18_000);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          message: trimmed,
          history: historyPayload,
          context: {
            riskLevel: cityLevel,
            city: cityName,
            lang,
            topic: "Flood & Monsoon Precautions",
          },
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        reply?: string;
        error?: string;
      };

      if (res.status === 429) {
        setErrorBanner(data.error || copy.rateLimitedMsg);
        return;
      }

      if (!res.ok) {
        if (data.reply) {
          setMessages((prev) => [
            ...prev,
            {
              id: `a-${nextIdRef.current++}`,
              role: "assistant",
              content: data.reply as string,
              isError: true,
            },
          ]);
        } else {
          setErrorBanner(data.error || copy.genericErrorMsg);
        }
        return;
      }

      if (data.reply) {
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${nextIdRef.current++}`,
            role: "assistant",
            content: data.reply as string,
          },
        ]);
      } else {
        setErrorBanner(copy.genericErrorMsg);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setErrorBanner(copy.timeoutMsg);
      } else {
        setErrorBanner(copy.genericErrorMsg);
      }
    } finally {
      clearTimeout(timeoutId);
      setIsSending(false);
      inputRef.current?.focus();
    }
  };

  const handleClear = () => {
    setMessages([]);
    setErrorBanner(null);
    inputRef.current?.focus();
  };

  return (
    <section
      aria-label={copy.title}
      className="rounded-2xl bg-slate-900/85 border border-cyan-500/30 p-4 space-y-3"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">{copy.title}</h3>
            <p className="text-[11px] text-slate-400">{copy.subtitle}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleClear}
          disabled={messages.length === 0 && !errorBanner}
          aria-label={copy.clearLabel}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Trash2 className="w-3 h-3" />
          <span>{copy.clearLabel}</span>
        </button>
      </div>

      {/* Suggested Question Chips */}
      <div className="flex flex-wrap gap-1.5" aria-label="Suggested safety questions">
        {copy.suggestions.map((question) => (
          <button
            key={question}
            type="button"
            disabled={isSending}
            onClick={() => sendMessage(question)}
            className="text-left text-[11px] px-2.5 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700/90 text-cyan-200 border border-slate-700 hover:border-cyan-500/40 disabled:opacity-50 transition-colors"
          >
            {question}
          </button>
        ))}
      </div>

      {/* Messages Area */}
      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        className="max-h-72 min-h-[120px] overflow-y-auto rounded-xl bg-slate-950/70 border border-slate-800 p-3 space-y-2.5"
      >
        {messages.length === 0 && !isSending ? (
          <p className="text-xs text-slate-400 text-center py-4">
            {copy.emptyPrompt}
          </p>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === "user";
            const mentionsEmergency =
              !isUser && EMERGENCY_MENTION_RE.test(msg.content);

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[90%] rounded-2xl px-3 py-2 ${
                    isUser
                      ? "bg-cyan-500 text-slate-950 font-medium text-xs sm:text-sm rounded-br-sm"
                      : msg.isError
                        ? "bg-amber-950/60 border border-amber-500/40 text-amber-100 rounded-bl-sm"
                        : "bg-slate-800/95 border border-slate-700 text-slate-100 rounded-bl-sm"
                  }`}
                >
                  {isUser ? (
                    <p className="text-xs sm:text-sm whitespace-pre-wrap break-words">
                      {msg.content}
                    </p>
                  ) : (
                    <SafeMarkdown text={msg.content} />
                  )}
                </div>

                {mentionsEmergency && (
                  <a
                    href="tel:112"
                    className="mt-1.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-red-400"
                  >
                    <PhoneCall className="w-3.5 h-3.5" />
                    <span>{copy.callEmergencyCta}</span>
                  </a>
                )}
              </div>
            );
          })
        )}

        {isSending && (
          <div className="flex items-center gap-2 text-xs text-cyan-300 bg-slate-800/70 border border-slate-700/80 rounded-xl px-3 py-2 w-fit">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>{copy.thinking}</span>
          </div>
        )}
      </div>

      {/* Error / Rate-limit Banner */}
      {errorBanner && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl bg-red-950/60 border border-red-500/40 px-3 py-2 text-xs text-red-200"
        >
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <span>{errorBanner}</span>
        </div>
      )}

      {/* Input Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void sendMessage(input);
        }}
        className="flex items-center gap-2"
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          maxLength={500}
          disabled={isSending}
          onChange={(e) => setInput(e.target.value)}
          placeholder={copy.placeholder}
          aria-label={copy.placeholder}
          className="flex-1 min-w-0 rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={isSending || !input.trim()}
          aria-label={copy.sendLabel}
          className="inline-flex items-center justify-center rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-3 py-2 min-h-[38px] min-w-[42px] disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-300"
        >
          {isSending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </form>

      {/* Always-visible Emergency Disclaimer */}
      <p className="text-[11px] text-slate-400 text-center">
        {copy.disclaimer}
      </p>
    </section>
  );
}
