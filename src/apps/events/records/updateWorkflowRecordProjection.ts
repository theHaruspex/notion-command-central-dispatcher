import { updatePage } from "../notion";
import type { RequestContext } from "../../../lib/logging";
import { dateIso } from "../util/notionProps";

export async function updateWorkflowRecordProjection(args: {
  ctx: RequestContext;
  workflowRecordId: string;
  eventTimeIso: string;
}): Promise<void> {
  await updatePage(args.ctx, {
    pageId: args.workflowRecordId,
    properties: {
      "Last Event Time": dateIso(args.eventTimeIso),
    },
  });
}

