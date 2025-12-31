export interface DispatchPredicate {
  statusEquals?: string;
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
}

export interface DispatchConfigSnapshot {
  fanoutMappings: FanoutMapping[];
  routes: DispatchRoute[];
}


