import { Injectable } from '@nestjs/common';

export type JobHandlerFn = () => Promise<unknown>;

export interface JobHandler {
  name: string;
  run: JobHandlerFn;
}

export interface JobRunResult {
  ok: boolean;
  ran: number;
  results: JobResult[];
}

export interface JobResult {
  name: string;
  ok: boolean;
  error?: string;
}

/**
 * Public extension-seam home for scheduled work (roadmap S1, inventory §0).
 * Empty at bootstrap; Sessions 6, 7 and 13 register handlers. Handlers are
 * responsible for their own idempotency.
 */
@Injectable()
export class JobRegistry {
  private readonly handlersMap = new Map<string, JobHandler>();

  register(name: string, run: JobHandlerFn): void {
    this.handlersMap.set(name, { name, run });
  }

  unregister(name: string): void {
    this.handlersMap.delete(name);
  }

  clear(): void {
    this.handlersMap.clear();
  }

  get handlers(): JobHandler[] {
    return [...this.handlersMap.values()];
  }

  get size(): number {
    return this.handlersMap.size;
  }
}
