import type { AgentDecision } from "./types";

interface DeepSeekMessage {
  role: "system" | "user";
  content: string;
}

interface DeepSeekResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      reasoning_content?: string | null;
    };
  }>;
  model?: string;
  error?: {
    message?: string;
  };
}

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-flash";

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function systemPrompt(role: AgentDecision["role"]): string {
  const shared =
    "You are an agentic brewery copilot. Use the supplied tool plan and observations as ground truth. Do not invent tool results. Keep the answer concise, operational, and action-oriented. Never claim you already performed a pending action unless the supplied decision says it was confirmed. Return plain text only: no Markdown, no bullets, no bold markers, no headings.";
  if (role === "support") {
    return `${shared} You are customer-safe: do not expose internal alarms, QA task ids, workflow internals, or sensor failure details.`;
  }
  return `${shared} You are operator-facing: you may discuss alarms, telemetry, QA tasks, and workflow signals.`;
}

function userPrompt(userMessage: string, decision: AgentDecision): string {
  return [
    `User asked: ${userMessage}`,
    `Local copilot response: ${decision.message}`,
    `Plan: ${decision.plan.join(" | ") || "none"}`,
    `Tools used: ${decision.toolsUsed.join(", ") || "none"}`,
    `Observations: ${decision.observations.join(" | ") || "none"}`,
    decision.pendingAction
      ? `Pending action proposed: ${decision.pendingAction.type}. Mention that operator confirmation is required.`
      : "Pending action proposed: none.",
    "Rewrite the local copilot response so it feels like a proactive agent. Return one short plain-text paragraph only, at least 12 words, with a complete final sentence."
  ].join("\n");
}

function fallbackRewritePrompt(userMessage: string, decision: AgentDecision): string {
  return [
    `User asked: ${userMessage}`,
    `Ground truth answer: ${decision.message}`,
    decision.pendingAction
      ? `The answer must say operator confirmation is required for ${decision.pendingAction.type}.`
      : "No action is pending.",
    "Write one concise plain-text sentence of at least 12 words. Do not use Markdown."
  ].join("\n");
}

function cleanProviderMessage(value: string): string {
  const cleaned = value
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^["']|["']$/g, "")
    .trim();
  if (!cleaned) return cleaned;
  return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
}

function qualityError(message: string): string | null {
  if (!message) return "DeepSeek returned an empty message";
  const words = message.split(/\s+/).filter(Boolean);
  if (words.length < 8) return "DeepSeek returned a clipped message";
  if (/\b(and|or|the|to|for|with|of|a|an|is|are)\.$/i.test(message)) {
    return "DeepSeek returned an incomplete message";
  }
  return null;
}

async function callDeepSeek(messages: DeepSeekMessage[]): Promise<{ message: string; model: string }> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not set");

  const baseUrl = trimSlash(process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL);
  const model = process.env.DEEPSEEK_MODEL || DEFAULT_MODEL;
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.1,
      max_tokens: 280
    })
  });
  const json = (await response.json().catch(() => ({}))) as DeepSeekResponse;
  if (!response.ok) {
    throw new Error(json.error?.message ?? `DeepSeek request failed with ${response.status}`);
  }
  const message = cleanProviderMessage(json.choices?.[0]?.message?.content?.trim() ?? "");
  const badMessage = qualityError(message);
  if (badMessage) throw new Error(badMessage);
  return { message, model: json.model ?? model };
}

async function callDeepSeekWithRetry(userMessage: string, decision: AgentDecision): Promise<{ message: string; model: string }> {
  try {
    return await callDeepSeek([
      { role: "system", content: systemPrompt(decision.role) },
      { role: "user", content: userPrompt(userMessage, decision) }
    ]);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      (!error.message.includes("empty message") &&
        !error.message.includes("clipped message") &&
        !error.message.includes("incomplete message"))
    ) {
      throw error;
    }
    return callDeepSeek([
      { role: "system", content: systemPrompt(decision.role) },
      { role: "user", content: fallbackRewritePrompt(userMessage, decision) }
    ]);
  }
}

export async function enhanceWithDeepSeek(userMessage: string, decision: AgentDecision): Promise<AgentDecision> {
  if (!process.env.DEEPSEEK_API_KEY) {
    return { ...decision, provider: "deterministic" };
  }

  try {
    const result = await callDeepSeekWithRetry(userMessage, decision);
    return {
      ...decision,
      message: result.message,
      provider: "deepseek",
      model: result.model
    };
  } catch (error) {
    return {
      ...decision,
      provider: "deterministic",
      providerError: error instanceof Error ? error.message : String(error)
    };
  }
}
