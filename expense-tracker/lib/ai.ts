/** LLM fallback categorizer (batched, cheap model). Absent key → undefined,
 *  and the rule engine handles everything (never blocks the pipeline). */
import Anthropic from "@anthropic-ai/sdk";
import type { AiCategorizer } from "./engine/categorize";

export function aiCategorizer(): AiCategorizer | undefined {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return undefined;
  const client = new Anthropic({ apiKey });

  return async (batch, categoryNames) => {
    const res = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content:
          `Categorize these transactions. Reply with ONLY a JSON array of category names, one per transaction, chosen strictly from: ${categoryNames.join(", ")}.\n` +
          batch.map((t, i) => `${i + 1}. ${t.merchant}${t.description ? ` — ${t.description}` : ""} (${t.amount})`).join("\n"),
      }],
    });
    const text = res.content[0].type === "text" ? res.content[0].text : "[]";
    const m = text.match(/\[[\s\S]*\]/);
    const arr = m ? (JSON.parse(m[0]) as unknown[]) : [];
    return batch.map((_, i) => (typeof arr[i] === "string" ? (arr[i] as string) : null));
  };
}
