export type RoutePlan =
  | {
      kind: "noop";
      matchedRouteNames: string[];
      originDatabaseIdKey: string;
      originPageId: string;
    }
  | {
      kind: "single";
      matchedRouteNames: string[];
      originDatabaseIdKey: string;
      originPageId: string;
    }
  | {
      kind: "fanout";
      matchedRouteNames: string[];
      originDatabaseIdKey: string;
      originTaskId: string;
      taskObjectivePropId: string;
      objectiveTasksPropId: string;
      recomputeCommandName: string;
    };


