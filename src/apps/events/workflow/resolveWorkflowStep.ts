import type { WebhookEvent } from "../../../lib/webhook/normalizeWebhook";
import type { WorkflowDefinitionMeta } from "./getWorkflowDefinitionMeta";
import { getRelationIdsFromPageProperty, getPage } from "../notion";

function readTitlePlain(props: Record<string, any>, name: string): string {
  const p = props[name];
  if (!p || typeof p !== "object") return "";
  if ((p as any).type === "title") {
    const title = Array.isArray((p as any).title) ? (p as any).title : [];
    return title.map((t: any) => t.plain_text || t.text?.content || "").join("").trim();
  }
  return "";
}

function readRichTextPlain(props: Record<string, any>, name: string): string {
  const p = props[name];
  if (!p || typeof p !== "object") return "";
  const type = (p as any).type;
  if (type === "rich_text" || type === "text") {
    const rt = Array.isArray((p as any).rich_text) ? (p as any).rich_text : [];
    return rt.map((t: any) => t.plain_text || t.text?.content || "").join("").trim();
  }
  return "";
}

function readNumber(props: Record<string, any>, name: string): number | null {
  const p = props[name];
  if (!p || typeof p !== "object") return null;
  if ((p as any).type !== "number") return null;
  const value = (p as any).number;
  return typeof value === "number" ? value : null;
}

export async function resolveWorkflowStepId(args: {
  def: WorkflowDefinitionMeta;
  webhookEvent: WebhookEvent;
  stateValue: string;
}): Promise<{ workflowStepId: string | null; resolveMode: "scan_relation" | "match_state_value" | "none" }> {
  const { def, webhookEvent, stateValue } = args;

  const stepIds = await getRelationIdsFromPageProperty(def.id, def.workflowStepsPropId);
  const stepIdSet = new Set(stepIds.map((s) => s));

  if (def.workflowType === "multi_object") {
    for (const prop of Object.values(webhookEvent.properties)) {
      if (!prop || typeof prop !== "object") continue;
      if ((prop as any).type !== "relation") continue;
      const rels = Array.isArray((prop as any).relation) ? (prop as any).relation : [];
      for (const rel of rels) {
        if (rel && typeof rel.id === "string" && stepIdSet.has(rel.id)) {
          return { workflowStepId: rel.id, resolveMode: "scan_relation" };
        }
      }
    }
    return { workflowStepId: null, resolveMode: "none" };
  }

  for (const stepId of stepIds) {
    const stepPage = await getPage(stepId);
    const labelTitle = readTitlePlain(stepPage.properties, "Label Name");
    const label = labelTitle || readRichTextPlain(stepPage.properties, "Label Name");
    const n = readNumber(stepPage.properties, "Workflow Step");

    if (label && label.trim() === stateValue.trim()) {
      return { workflowStepId: stepId, resolveMode: "match_state_value" };
    }
    const stateN = Number(stateValue);
    if (Number.isFinite(stateN) && n !== null && n === stateN) {
      return { workflowStepId: stepId, resolveMode: "match_state_value" };
    }
  }

  return { workflowStepId: null, resolveMode: "none" };
}

