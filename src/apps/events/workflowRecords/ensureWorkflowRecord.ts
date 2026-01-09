import { normalizeNotionId } from "../../../lib/notion/utils";
import { createPage, queryDatabase } from "../notion";
import { dateIso, rt, title, urlValue } from "../util/notionProps";

export interface EnsureWorkflowRecordArgs {
  workflowRecordsDbId: string;
  workflowDefinitionId: string;

  // New: workflow instance identity (keyed via rollup on Workflow Records)
  workflowInstancePageId: string;
  workflowInstancePageName: string;
  workflowInstancePageUrl: string | null;

  originDatabaseId: string;
  stateValue: string;
  eventTimeIso: string;
}

export async function ensureWorkflowRecord(args: EnsureWorkflowRecordArgs): Promise<string> {
  const { workflowRecordId } = await ensureWorkflowRecordWithMeta(args);
  return workflowRecordId;
}

export async function ensureWorkflowRecordWithMeta(
  args: EnsureWorkflowRecordArgs,
): Promise<{ workflowRecordId: string; created: boolean }> {
  const workflowInstancePageIdKey = normalizeNotionId(args.workflowInstancePageId);

  const findData = await queryDatabase(args.workflowRecordsDbId, {
    body: {
      filter: {
        and: [
          {
            property: "Workflow Definition",
            relation: { contains: args.workflowDefinitionId },
          },
          {
            property: "Workflow Instance Page ID",
            rollup: {
              any: {
                rich_text: { equals: workflowInstancePageIdKey },
              },
            },
          },
        ],
      },
      page_size: 1,
    },
  });

  const findResults = Array.isArray((findData as any)?.results) ? (findData as any).results : [];
  const existing = findResults[0];
  if (existing && typeof existing.id === "string") {
    return { workflowRecordId: existing.id, created: false };
  }

  const name = `${args.workflowInstancePageName || workflowInstancePageIdKey} — ${args.workflowDefinitionId}`;

  const created = await createPage({
    parentDatabaseId: args.workflowRecordsDbId,
    properties: {
      title: title(name),
      "Workflow Definition": { relation: [{ id: args.workflowDefinitionId }] },
      "Origin Database ID": rt(args.originDatabaseId),
      "Workflow Instance Page Name": rt(args.workflowInstancePageName ?? ""),
      "Workflow Instance Page URL": urlValue(args.workflowInstancePageUrl),
      "Last Event Time": dateIso(args.eventTimeIso),
      "Current Stage": rt(args.stateValue),
    },
  });

  const createdId = typeof (created as any)?.id === "string" ? ((created as any).id as string) : null;
  if (!createdId) {
    throw new Error("Failed to create workflow record: missing id in Notion response");
  }

  return { workflowRecordId: createdId, created: true };
}


