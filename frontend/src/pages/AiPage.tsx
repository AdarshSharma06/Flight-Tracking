import { useState, useRef, useEffect } from "react";
import { aiService } from "@/services/ai.service";
import { ApiError } from "@/services/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Bot, Send, User, AlertCircle, Loader2 } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const STARTER_PROMPTS = [
  "What is an airport?",
  "What is an ILS?",
  "What does a squawk code mean?",
  "What is the difference between altitude and flight level?",
];

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatInline(text: string) {
  // escape then restore markdown formatting as HTML
  let html = escapeHtml(text);
  // inline code `code`
  html = html.replace(/`([^`]+?)`/g, '<code class="rounded bg-muted-foreground/15 px-1 py-0.5 font-mono text-[0.85em]">$1</code>');
  // bold **text**
  html = html.replace(/\*\*([^*]+?)\*\*/g, '<strong class="font-semibold">$1</strong>');
  // italic *text* (avoid bold) - simple
  html = html.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<em>$1</em>');
  return html;
}

function MarkdownContent({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let listBuffer: { type: "ul" | "ol"; items: string[] } | null = null;
  let inCodeBlock = false;
  let codeBuffer: string[] = [];

  const flushList = () => {
    if (!listBuffer) return;
    if (listBuffer.type === "ul") {
      elements.push(
        <ul key={`ul-${elements.length}`} className="ml-4 list-disc space-y-1 my-2">
          {listBuffer.items.map((it, idx) => (
            <li key={idx} className="leading-relaxed" dangerouslySetInnerHTML={{ __html: formatInline(it) }} />
          ))}
        </ul>
      );
    } else {
      elements.push(
        <ol key={`ol-${elements.length}`} className="ml-4 list-decimal space-y-1 my-2">
          {listBuffer.items.map((it, idx) => (
            <li key={idx} className="leading-relaxed" dangerouslySetInnerHTML={{ __html: formatInline(it) }} />
          ))}
        </ol>
      );
    }
    listBuffer = null;
  };

  const flushCode = () => {
    if (codeBuffer.length === 0) return;
    elements.push(
      <pre key={`code-${elements.length}`} className="my-2 rounded-md bg-muted p-3 overflow-x-auto text-xs font-mono">
        <code>{codeBuffer.join("\n")}</code>
      </pre>
    );
    codeBuffer = [];
  };

  lines.forEach((rawLine, idx) => {
    const line = rawLine;
    const trimmed = line.trim();

    // code fence
    if (trimmed.startsWith("```")) {
      if (inCodeBlock) {
        flushCode();
        inCodeBlock = false;
      } else {
        flushList();
        inCodeBlock = true;
      }
      return;
    }
    if (inCodeBlock) {
      codeBuffer.push(line);
      return;
    }

    if (!trimmed) {
      flushList();
      return;
    }

    // headings # ## ###
    if (/^#{1,3}\s+/.test(trimmed)) {
      flushList();
      const level = trimmed.match(/^#+/)![0].length;
      const text = trimmed.replace(/^#+\s+/, "");
      const cls = "font-semibold leading-tight my-2 " + (level === 1 ? "text-base" : level === 2 ? "text-[15px]" : "text-sm");
      elements.push(
        <div key={`h-${idx}`} className={cls} dangerouslySetInnerHTML={{ __html: formatInline(text) }} />
      );
      return;
    }

    // bullet list
    if (/^[-*•]\s+/.test(trimmed)) {
      const text = trimmed.replace(/^[-*•]\s+/, "");
      if (!listBuffer || listBuffer.type !== "ul") {
        flushList();
        listBuffer = { type: "ul", items: [] };
      }
      listBuffer.items.push(text);
      return;
    }

    // numbered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const text = trimmed.replace(/^\d+\.\s+/, "");
      if (!listBuffer || listBuffer.type !== "ol") {
        flushList();
        listBuffer = { type: "ol", items: [] };
      }
      listBuffer.items.push(text);
      return;
    }

    // paragraph
    flushList();
    elements.push(
      <p key={`p-${idx}`} className="leading-relaxed my-1.5" dangerouslySetInnerHTML={{ __html: formatInline(trimmed) }} />
    );
  });

  flushList();
  flushCode();

  // fallback if no elements (empty)
  if (elements.length === 0) {
    return <span className="whitespace-pre-wrap break-words">{content}</span>;
  }

  return <div className="space-y-1 break-words">{elements}</div>;
}

export function AiPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const send = async (text?: string) => {
    const message = (text ?? input).trim();
    if (!message || loading) return;

    setError(null);
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setLoading(true);

    try {
      const res = await aiService.chat(message, conversationId);
      setConversationId(res.conversationId);
      setMessages((prev) => [...prev, { role: "assistant", content: res.answer }]);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to get response.";
      setError(msg);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="flex flex-col gap-4 min-h-0">
      <div className="shrink-0 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Bot className="size-6 text-primary" /> AI Assistant
        </h1>
        <p className="text-sm text-muted-foreground">
          Ask aviation questions, search flights, and get live flight, airport, and weather information when available.
        </p>
      </div>

      <Card className="flex flex-col flex-1 min-h-0 overflow-hidden" style={{ height: "min(720px, calc(100dvh - 12rem))", minHeight: "420px" }}>
        <CardHeader className="shrink-0 pb-3">
          <CardTitle className="text-base">Chat</CardTitle>
          <CardDescription>
            Powered by AI. Responses are generated and may not always be accurate.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-1 min-h-0 flex-col gap-3 overflow-hidden p-6 pt-0">
          <div
            ref={scrollRef}
            className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-2 -mr-2"
          >
            <div className="space-y-4 py-2 pr-2">
              {messages.length === 0 && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">Try asking:</p>
                  <div className="flex flex-wrap gap-2">
                    {STARTER_PROMPTS.map((prompt) => (
                      <Button
                        key={prompt}
                        variant="outline"
                        size="sm"
                        className="text-xs h-auto py-1.5 whitespace-normal text-left break-words"
                        onClick={() => send(prompt)}
                        disabled={loading}
                      >
                        {prompt}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-2 min-w-0 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div className="size-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="size-4 text-primary" />
                    </div>
                  )}
                  <div
                    className={`rounded-lg px-3 py-2 text-sm max-w-[80%] min-w-0 break-words overflow-hidden ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground whitespace-pre-wrap"
                        : "bg-muted"
                    }`}
                  >
                    {msg.role === "user" ? (
                      <span className="whitespace-pre-wrap break-words">{msg.content}</span>
                    ) : (
                      <MarkdownContent content={msg.content} />
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="size-7 rounded-full bg-primary flex items-center justify-center shrink-0 mt-0.5">
                      <User className="size-4 text-primary-foreground" />
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div className="flex gap-2 justify-start min-w-0">
                  <div className="size-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="size-4 text-primary" />
                  </div>
                  <div className="rounded-lg px-3 py-2 text-sm bg-muted flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    Thinking...
                  </div>
                </div>
              )}
            </div>
          </div>

          {error && (
            <Alert variant="destructive" className="shrink-0">
              <AlertCircle className="size-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription className="text-xs break-words">{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2 shrink-0">
            <Input
              ref={inputRef}
              placeholder="Ask a question about aviation..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              maxLength={4000}
            />
            <Button onClick={() => send()} disabled={loading || !input.trim()} size="icon" className="shrink-0">
              <Send className="size-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
