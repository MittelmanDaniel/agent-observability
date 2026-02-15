export type RunSource = "claude_sdk" | "custom" | "oz" | "stagehand" | "trace";

export interface Run {
  id: string;
  source: RunSource;
  task: string;
  status: string;
  started_at: string;
  ended_at: string;
  // SWE-Agent dataset fields
  model_name?: string;
  exit_status?: string;
  generated_patch?: string;
  eval_score?: number | null;
  eval_passed?: number;
  eval_failed?: number;
  eval_errors?: number;
  eval_total?: number;
  // TRACE dataset specific fields
  trace_label?: string;
  trace_label_description?: string;
  trace_trajectory_id?: string;
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
  | "assistant"
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
