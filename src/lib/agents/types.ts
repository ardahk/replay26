import type { Order } from "../domain/types";

export type AgentRole = "brewmaster" | "support";

export interface PendingAgentAction {
  type: "approve_qa" | "send_signal";
  payload: unknown;
}

export interface AgentDecision {
  role: AgentRole;
  batchId?: string;
  plan: string[];
  observations: string[];
  toolsUsed: string[];
  message: string;
  provider?: "deepseek" | "deterministic";
  model?: string;
  providerError?: string;
  pendingAction?: PendingAgentAction;
  order?: Order;
}
