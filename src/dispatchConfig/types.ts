export interface DispatchPredicate {
  statusEquals?: string;
}

export interface DispatchRoute {
  routeName: string;
  databaseId: string;
  predicate?: DispatchPredicate;
}


