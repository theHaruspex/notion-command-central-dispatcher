import type { AutomationEvent, ProcessorResult } from "../types";

/**
 * Fan-out processor.
 *
 * For now this is a stub that performs no Notion API calls.
 * Later commits will implement:
 * - enumerate all tasks for the objective
 * - create Command pages for each task
 */
export async function handleEvent(_event: AutomationEvent): Promise<ProcessorResult> {
  return {
    ok: true,
    created: 0,
    failed: 0,
  };
}


