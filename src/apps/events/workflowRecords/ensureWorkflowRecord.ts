import { normalizeNotionId } from "../../../lib/notion/utils";
import { createPage, queryDatabase } from "../notion";
import { dateIso, rt, title } from "../util/notionProps";

export interface EnsureWorkflowRecordArgs {
  workflowRecordsDbId: string;
  workflowDefinitionId: string;
  originPageId: string;
  originPageName: string;
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
  const originPageIdKey = normalizeNotionId(args.originPageId);

  const findData = await queryDatabase(args.workflowRecordsDbId, {
    body: {
      filter: {
        and: [
          {
            property: "Workflow Definition",
            relation: { contains: args.workflowDefinitionId },
          },
          {
            property: "Origin Page ID",
            rollup: {
              any: {
                rich_text: { equals: originPageIdKey },
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

  const name = `${args.originPageName || originPageIdKey} — ${args.workflowDefinitionId}`;

  const created = await createPage({
    parentDatabaseId: args.workflowRecordsDbId,
    properties: {
      title: title(name),
      "Workflow Definition": { relation: [{ id: args.workflowDefinitionId }] },
      "Created At": dateIso(args.eventTimeIso),
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


