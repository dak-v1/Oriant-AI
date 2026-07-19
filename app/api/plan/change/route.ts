import type { NextRequest } from "next/server";
import { mutate } from "@/lib/server/api";
import {
  addAgent, addCustomAgent, attachSpec, configureAgent, GateError,
  removeAgent, renameAgent, reorderAgent,
} from "@/lib/server/orchestrator";
import type { AgentConfig, AgentSpecAnswers } from "@/lib/contracts";

type ChangeBody =
  | { op: "add"; id: string }
  | { op: "remove"; id: string }
  | { op: "reorder"; fromId: string; toId: string }
  | { op: "rename"; id: string; name: string }
  | { op: "add-custom" }
  | { op: "configure"; id: string; config: AgentConfig }
  | { op: "spec"; id: string; spec: AgentSpecAnswers };

/** Structured plan edits from the planner UI (drag/drop, config, design call). */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as ChangeBody;
  return mutate((db) => {
    switch (body.op) {
      case "add": return addAgent(db, body.id);
      case "remove": return removeAgent(db, body.id);
      case "reorder": return reorderAgent(db, body.fromId, body.toId);
      case "rename": return renameAgent(db, body.id, body.name);
      case "add-custom": { addCustomAgent(db); return; }
      case "configure": return configureAgent(db, body.id, body.config);
      case "spec": return attachSpec(db, body.id, body.spec);
      default: throw new GateError("Unknown plan change.");
    }
  });
}
