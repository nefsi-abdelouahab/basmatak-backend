import { Injectable } from '@nestjs/common';
import { JobRegistry, JobRunResult, JobResult } from './job-registry';

/**
 * Idempotent jobs tick (inventory §2.21, roadmap S1).
 * Runs every registered handler with `Promise.allSettled` so a failing
 * handler does not stop the rest; a per-process mutex (single-flight) makes
 * concurrent `run` calls execute handlers only once.
 */
@Injectable()
export class JobsService {
  private inFlight: Promise<JobRunResult> | null = null;

  constructor(private readonly registry: JobRegistry) {}

  run(): Promise<JobRunResult> {
    if (this.inFlight) {
      return this.inFlight;
    }
    const execution = this.execute();
    this.inFlight = execution;
    void execution.finally(() => {
      this.inFlight = null;
    });
    return execution;
  }

  private async execute(): Promise<JobRunResult> {
    const handlers = this.registry.handlers;
    const settled = await Promise.allSettled(
      handlers.map(async (handler) => ({
        name: handler.name,
        value: await handler.run(),
      })),
    );

    const results: JobResult[] = settled.map((outcome, index) => {
      const name = handlers[index].name;
      if (outcome.status === 'fulfilled') {
        return { name, ok: true };
      }
      return { name, ok: false, error: String(outcome.reason) };
    });

    return {
      ok: results.every((result) => result.ok),
      ran: handlers.length,
      results,
    };
  }
}
