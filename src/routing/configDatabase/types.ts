export interface DispatchPredicate {
  /**
   * Map of property name -> expected string value (equality match).
   * Property names correspond to Notion property names on the origin database.
   */
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
  fanoutMappings: FanoutMapping[];
  routes: DispatchRoute[];
}


