import { normalizeNotionId } from "../../../lib/notion/utils";
import type { WebhookEvent } from "../../../lib/webhook/normalizeWebhook";
import { getPage } from "../notion";
import { extractFirstRelationIdFromWebhookProperties } from "../ingest/extractRelation";
import { extractTitleFromWebhookProperties } from "../ingest/extractTitleFromProps";
import type { WorkflowDefinitionMeta } from "./getWorkflowDefinitionMeta";
import type { WorkflowInstance } from "../domain";

export class ContainerPropertyNotConfiguredError extends Error {
  constructor() {
    super("container_property_not_configured");
    this.name = "ContainerPropertyNotConfiguredError";
  }
}

export class ContainerRelationMissingError extends Error {
  constructor() {
    super("container_relation_missing");
    this.name = "ContainerRelationMissingError";
  }
}

export async function resolveWorkflowInstance(args: {
  def: WorkflowDefinitionMeta;
  webhookEvent: WebhookEvent;
  originPageName: string;
}): Promise<WorkflowInstance> {
  const { def, webhookEvent, originPageName } = args;

  if (def.workflowType === "single_object") {
    const workflowInstancePageId = webhookEvent.originPageId;
    return {
      workflowInstancePageId,
      workflowInstancePageIdKey: normalizeNotionId(workflowInstancePageId),
      workflowInstancePageName: originPageName,
      workflowInstancePageUrl: webhookEvent.originPageUrl ?? null,
    };
  }

  if (!def.containerPropertyName) {
    throw new ContainerPropertyNotConfiguredError();
  }

  const containerId = extractFirstRelationIdFromWebhookProperties(webhookEvent.properties, def.containerPropertyName);
  if (!containerId) {
    throw new ContainerRelationMissingError();
  }

  const instancePage = await getPage(containerId);
  const workflowInstancePageName = extractTitleFromWebhookProperties(instancePage.properties);

  return {
    workflowInstancePageId: containerId,
    workflowInstancePageIdKey: normalizeNotionId(containerId),
    workflowInstancePageName,
    workflowInstancePageUrl: instancePage.url ?? null,
  };
}

