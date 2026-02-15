export type RunSource = "claude_sdk" | "custom" | "oz" | "stagehand";

export interface Run {
  id: string;
  source: RunSource;
  task: string;
  status: string;
  started_at: string;
  ended_at: string;
}

export type EventType =
  | "llm_call"
  | "tool_call"
  | "tool_result"
  | "thought"
  | "error"
  | "user_feedback"
  | "system"
  | "ai"
  | "user";

export interface Event {
  id?: string;
  run_id: string;
  idx: number;
  ts: string;
  type: EventType;
  actor: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface Section {
  id: string;
  run_id: string;
  start_idx: number;
  end_idx: number;
  label: string;
  what_happened: string;
  verdict: "good" | "warning" | "failure";
  root_cause_guess?: string;
  fix_suggestion?: string;
  confidence?: number;
}
