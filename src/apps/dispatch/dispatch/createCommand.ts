import { createPage } from "../notion";

export interface CreateCommandArgs {
  commandsDbId: string;
  titlePropNameOrId: string | null;
  commandTitle: string;
  triggerKeyPropId: string;
  triggerKeyValue: string;
  directiveCommandPropId?: string | null;
  directiveCommandValues?: string[];
  targetRelationPropId: string;
  targetPageId: string;
}

export async function createCommand(args: CreateCommandArgs): Promise<void> {
  const {
    commandsDbId,
    titlePropNameOrId,
    commandTitle,
    triggerKeyPropId,
    triggerKeyValue,
    directiveCommandPropId,
    directiveCommandValues,
    targetRelationPropId,
    targetPageId,
  } = args;

  const properties: Record<string, any> = {
    [targetRelationPropId]: {
      relation: [{ id: targetPageId }],
    },
    [triggerKeyPropId]: {
      rich_text: [
        {
          text: {
            content: triggerKeyValue,
          },
        },
      ],
    },
  };

  if (directiveCommandPropId && directiveCommandValues && directiveCommandValues.length > 0) {
    properties[directiveCommandPropId] = {
      multi_select: directiveCommandValues.map((name) => ({ name })),
    };
  }

  // Preserve existing title semantics: either use an explicit title property or "Name".
  const titlePropKey = titlePropNameOrId || "Name";
  properties[titlePropKey] = {
    title: [
      {
        text: {
          content: commandTitle,
        },
      },
    ],
  };

  await createPage({
    parentDatabaseId: commandsDbId,
    properties,
  });
}


