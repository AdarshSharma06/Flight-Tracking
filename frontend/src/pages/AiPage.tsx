import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Cpu, Plane, Zap, Loader2, AlertCircle } from "lucide-react";
import { aiService } from "@/services/ai.service";
import { ApiError } from "@/services/api";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const STARTER_PROMPTS = [
  "What is the current flight from JFK to LHR?",
  "How is the weather at Dubai International?",
  "Tell me about the Boeing 747-8.",
  "Track flight UA123."
];

// Reusing the mechanical parser but adapting class names to be more neutral for the glass-panel
function MarkdownContent({ content }: { content: string }) {
  const elements: React.ReactNode[] = [];
  const lines = content.split("\n");
  let listBuffer: { type: "ul" | "ol"; items: string[] } | null = null;
  let codeBuffer: string[] = [];
  let inCodeBlock = false;

  const flushList = () => {
    if (listBuffer) {
      const idx = elements.length;
      if (listBuffer.type === "ul") {
        elements.push(
          <ul key={`ul-${idx}`} className="list-disc pl-5 my-2 space-y-1">
            {listBuffer.items.map((item, i) => (
              <li key={i} dangerouslySetInnerHTML={{ __html: formatInline(item) }} />
            ))}
          </ul>
        );
      } else {
        elements.push(
          <ol key={`ol-${idx}`} className="list-decimal pl-5 my-2 space-y-1">
            {listBuffer.items.map((item, i) => (
              <li key={i} dangerouslySetInnerHTML={{ __html: formatInline(item) }} />
            ))}
          </ol>
        );
      }
      listBuffer = null;
    }
  };

  const flushCode = () => {
    if (codeBuffer.length > 0) {
      const idx = elements.length;
      elements.push(
        <pre key={`code-${idx}`} className="bg-black/50 border border-white/10 p-3 rounded-md my-2 overflow-x-auto text-xs font-mono text-white/90">
          <code>{codeBuffer.join("\n")}</code>
        </pre>
      );
      codeBuffer = [];
      inCodeBlock = false;
    }
  };

  const formatInline = (text: string) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/`(.*?)`/g, '<code class="bg-black/30 px-1 py-0.5 rounded text-[11px] font-mono">$1</code>');
  };

  lines.forEach((line, i) => {
    const idx = elements.length + i;
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      if (inCodeBlock) {
        flushCode();
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

    if (/^[-*•]\s+/.test(trimmed)) {
      const text = trimmed.replace(/^[-*•]\s+/, "");
      if (!listBuffer || listBuffer.type !== "ul") {
        flushList();
        listBuffer = { type: "ul", items: [] };
      }
      listBuffer.items.push(text);
      return;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const text = trimmed.replace(/^\d+\.\s+/, "");
      if (!listBuffer || listBuffer.type !== "ol") {
        flushList();
        listBuffer = { type: "ol", items: [] };
      }
      listBuffer.items.push(text);
      return;
    }

    flushList();
    elements.push(
      <p key={`p-${idx}`} className="leading-relaxed my-1.5" dangerouslySetInnerHTML={{ __html: formatInline(trimmed) }} />
    );
  });

  flushList();
  flushCode();

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

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    send();
  };

  return (
    <div className="w-full flex-1 flex flex-col h-[100dvh] pt-20 bg-background relative overflow-hidden">
      <div className="absolute inset-0 z-0 flex items-center justify-center opacity-[0.03] pointer-events-none">
        <div className="w-[800px] h-[800px] rounded-full border-[40px] border-primary blur-3xl mix-blend-screen" />
      </div>

      <div className="relative z-10 w-full max-w-4xl mx-auto flex flex-col h-full px-4 pb-6">
        
        <div className="flex items-center gap-3 py-6 shrink-0 border-b border-white/5">
          <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Cpu className="size-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-white">Operations Intelligence</h1>
            <p className="text-[10px] uppercase tracking-widest font-mono text-muted-foreground flex items-center gap-1.5"><Zap className="size-3 text-primary"/> System Active</p>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar py-8 space-y-6 pr-2">
          
          {messages.length === 0 && (
            <div className="space-y-4 mb-8">
              <div className="glass-panel p-6 rounded-2xl">
                <p className="text-sm text-foreground/80 leading-relaxed">
                  I am your Aviation Intelligence system. I can analyze operational delays, evaluate routes, and assist with telemetry data.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {STARTER_PROMPTS.map((prompt) => (
                  <Button
                    key={prompt}
                    variant="outline"
                    size="sm"
                    className="text-xs h-auto py-2 whitespace-normal text-left break-words border-white/10 hover:border-primary/50 transition-colors"
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
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl p-5 ${msg.role === 'user' ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'glass-panel rounded-tl-sm'}`}>
                {msg.role === 'assistant' && (
                  <div className="flex items-center gap-2 mb-3 text-[10px] uppercase tracking-widest font-bold opacity-70">
                    <Plane className="size-3" /> System
                  </div>
                )}
                <div className={`text-sm leading-relaxed ${msg.role === 'user' ? 'text-primary-foreground whitespace-pre-wrap' : 'text-foreground/90'}`}>
                  {msg.role === 'user' ? msg.content : <MarkdownContent content={msg.content} />}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-2xl p-5 glass-panel rounded-tl-sm flex items-center gap-3">
                <Loader2 className="size-4 animate-spin text-primary" />
                <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Synthesizing...</span>
              </div>
            </div>
          )}

          {error && (
            <div className="flex justify-center">
              <div className="max-w-[80%] rounded-2xl p-3 border border-destructive/30 bg-destructive/10 flex items-center gap-3">
                <AlertCircle className="size-4 text-destructive" />
                <span className="text-xs text-destructive">{error}</span>
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 pt-4">
          <form onSubmit={handleSend} className="relative glass-panel-heavy rounded-2xl p-2 shadow-2xl flex items-center gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Query aviation data, flight paths, or meteorological impacts..."
              className="flex-1 bg-transparent border-0 h-12 focus-visible:ring-0 text-sm shadow-none placeholder:text-muted-foreground"
              disabled={loading}
              maxLength={4000}
            />
            <Button type="submit" disabled={loading || !input.trim()} size="icon" className="size-10 shrink-0 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
              <Send className="size-4" />
            </Button>
          </form>
          <div className="text-center mt-3 text-[10px] uppercase tracking-widest text-muted-foreground font-mono">
            Intelligence models can produce inaccurate assessments. Verify critical telemetry.
          </div>
        </div>

      </div>
    </div>
  );
}
