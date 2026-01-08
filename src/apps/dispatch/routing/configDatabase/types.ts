export interface DispatchPredicate {
  equals: Record<string, string>;
}

export interface DispatchRoute {
  routeName: string;
  databaseId: string;
  predicate?: DispatchPredicate;
}

export interface FanoutMapping {
  taskDatabaseId: string;
  taskObjectivePropId: string;
  objectiveTasksPropId: string;
  conditionPropertyName?: string;
  conditionValue?: string;
}

export interface DispatchConfigSnapshot {
  routes: DispatchRoute[];
  fanoutMappings: FanoutMapping[];
}


