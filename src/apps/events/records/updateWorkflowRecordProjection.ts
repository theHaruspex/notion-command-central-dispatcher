import { updatePage } from "../notion";
import { dateIso } from "../util/notionProps";

export async function updateWorkflowRecordProjection(args: {
  workflowRecordId: string;
  eventTimeIso: string;
}): Promise<void> {
  await updatePage({
    pageId: args.workflowRecordId,
    properties: {
      "Last Event Time": dateIso(args.eventTimeIso),
    },
  });
}

