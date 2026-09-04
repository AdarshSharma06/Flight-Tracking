import { useState, useRef, useEffect } from "react";
import { aiService } from "@/services/ai.service";
import { ApiError } from "@/services/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
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
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Bot className="size-6 text-primary" /> AI Assistant
        </h1>
        <p className="text-sm text-muted-foreground">
          Ask general aviation questions. This assistant does not have access to live flight data.
        </p>
      </div>

      <Card className="flex flex-col" style={{ height: "calc(100vh - 16rem)" }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Chat</CardTitle>
          <CardDescription>
            Powered by AI. Responses are generated and may not always be accurate.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col gap-3 min-h-0">
          <ScrollArea className="flex-1 pr-4" ref={scrollRef}>
            <div className="space-y-4 py-2">
              {messages.length === 0 && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">Try asking:</p>
                  <div className="flex flex-wrap gap-2">
                    {STARTER_PROMPTS.map((prompt) => (
                      <Button
                        key={prompt}
                        variant="outline"
                        size="sm"
                        className="text-xs h-auto py-1.5"
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
                <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div className="size-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="size-4 text-primary" />
                    </div>
                  )}
                  <div
                    className={`rounded-lg px-3 py-2 text-sm max-w-[80%] whitespace-pre-wrap ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    {msg.content}
                  </div>
                  {msg.role === "user" && (
                    <div className="size-7 rounded-full bg-primary flex items-center justify-center shrink-0 mt-0.5">
                      <User className="size-4 text-primary-foreground" />
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div className="flex gap-2 justify-start">
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
          </ScrollArea>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2">
            <Input
              ref={inputRef}
              placeholder="Ask a question about aviation..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              maxLength={4000}
            />
            <Button onClick={() => send()} disabled={loading || !input.trim()} size="icon">
              <Send className="size-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
