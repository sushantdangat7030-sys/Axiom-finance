"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";

type ChatMessage = { role: "user" | "assistant"; text: string };

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: data.reply ?? data.error ?? "No response." },
      ]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", text: "Request failed." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ask about your spending</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ScrollArea className="h-64 rounded-md border p-3">
          {messages.length === 0 && (
            <p className="text-muted-foreground text-sm">
              Try: &quot;how much did I spend on restaurants last month?&quot;
            </p>
          )}
          <div className="flex flex-col gap-3">
            {messages.map((m, i) => (
              <div key={i} className="text-sm">
                <span className="font-medium">{m.role === "user" ? "You: " : "Claude: "}</span>
                <span className="whitespace-pre-wrap">{m.text}</span>
              </div>
            ))}
          </div>
        </ScrollArea>
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask a question about your spending..."
            className="min-h-10"
          />
          <Button onClick={send} disabled={loading}>
            {loading ? "..." : "Send"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
