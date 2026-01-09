let tail: Promise<unknown> = Promise.resolve();

export function enqueueEventsJob<T>(fn: () => Promise<T>): Promise<T> {
  const run = tail.then(fn, fn) as Promise<T>;
  tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}


