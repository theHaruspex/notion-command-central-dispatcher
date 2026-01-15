import { updatePage } from "../notion";
import { dateIso, rt } from "../util/notionProps";

export async function updateWorkflowRecordProjection(args: {
  workflowRecordId: string;
  eventTimeIso: string;
  stateValue: string;
}): Promise<void> {
  await updatePage({
    pageId: args.workflowRecordId,
    properties: {
      "Last Event Time": dateIso(args.eventTimeIso),
      "Current Stage": rt(args.stateValue),
    },
  });
}

