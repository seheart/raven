/**
 * AgentInfo — registry entry for each detected agent (Claude Code, Codex, Ollama, etc.).
 *
 * Lives in its own module so route extractions don't have to import from server.ts.
 */

export interface AgentInfo {
  agent_name: string;
  agent_type: string;
  is_running: boolean;
  last_seen: string;
  models_available: string[];
  requests_handled: number;
  errors: number;
  color: string;
}
