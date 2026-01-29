import { getPage } from "../notion";
import type { RequestContext } from "../../../lib/logging";

export type WorkflowType = "single_object" | "multi_object";

export interface WorkflowDefinitionMeta {
  id: string;
  enabled: boolean;
  workflowType: WorkflowType;
  containerPropertyName: string | null; // only meaningful for multi_object
  workflowStepsPropId: string;
}

function readCheckbox(props: Record<string, any>, name: string): boolean {
  const p = props[name];
  return !!(p && typeof p === "object" && (p as any).type === "checkbox" && (p as any).checkbox === true);
}

function readSelectName(props: Record<string, any>, name: string): string | null {
  const p = props[name];
  if (!p || typeof p !== "object" || (p as any).type !== "select") return null;
  return ((p as any).select?.name as string | undefined) ?? null;
}

function readRichTextAsPlain(props: Record<string, any>, name: string): string {
  const p = props[name];
  if (!p || typeof p !== "object") return "";
  const type = (p as any).type;
  if (type === "rich_text" || type === "text") {
    const rt = Array.isArray((p as any).rich_text) ? (p as any).rich_text : [];
    return rt.map((t: any) => t.plain_text || t.text?.content || "").join("").trim();
  }
  return "";
}

export async function getWorkflowDefinitionMeta(
  ctx: RequestContext,
  workflowDefinitionId: string,
): Promise<WorkflowDefinitionMeta> {
  const page = await getPage(ctx, workflowDefinitionId);

  const workflowStepsPropId = (page.properties as any)?.["Workflow Steps"]?.id;
  if (typeof workflowStepsPropId !== "string" || !workflowStepsPropId) {
    throw new Error(`Missing Workflow Steps property id for workflow definition ${workflowDefinitionId}`);
  }

  const enabled = readCheckbox(page.properties, "Enabled");

  const workflowTypeRaw = readSelectName(page.properties, "Workflow Type");
  if (!workflowTypeRaw || (workflowTypeRaw !== "single_object" && workflowTypeRaw !== "multi_object")) {
    throw new Error(
      `Invalid Workflow Type "${workflowTypeRaw}" for workflow definition ${workflowDefinitionId}: must be "single_object" or "multi_object"`,
    );
  }
  const workflowType = workflowTypeRaw as WorkflowType;

  const containerPropertyNameRaw = readRichTextAsPlain(page.properties, "Container Property");
  const containerPropertyName = containerPropertyNameRaw || null;

  return {
    id: workflowDefinitionId,
    enabled,
    workflowType,
    containerPropertyName,
    workflowStepsPropId,
  };
}

