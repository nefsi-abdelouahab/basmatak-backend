import { Inject, Injectable } from '@nestjs/common';
import { Response } from 'express';
import { AI_AGENT_CONFIG } from '../ai-agent.constants';
import { AiAgentSseEventMap, AiAgentSseEventName } from '../ai-agent.types';
import { AiAgentConfig } from '../config/ai-agent.config';

/**
 * One open SSE response. The controller owns the lifecycle and must call
 * `end()` (normal completion) or `abort()` (client gone / failure) exactly once.
 */
export class SseStream {
  private heartbeatTimer?: NodeJS.Timeout;
  private closed = false;
  private closeNotified = false;

  /** Set by `SseWriter` to track active requests. */
  onClosed: () => void = () => undefined;

  constructor(
    private readonly response: Response,
    heartbeatIntervalMs: number,
  ) {
    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders?.();

    if (heartbeatIntervalMs > 0) {
      this.heartbeatTimer = setInterval(() => {
        this.comment('heartbeat');
      }, heartbeatIntervalMs);
      this.heartbeatTimer.unref?.();
    }
  }

  get isClosed(): boolean {
    return (
      this.closed || this.response.writableEnded || this.response.destroyed
    );
  }

  get isHeartbeatActive(): boolean {
    return this.heartbeatTimer !== undefined;
  }

  event<K extends AiAgentSseEventName>(
    name: K,
    payload: AiAgentSseEventMap[K],
  ): boolean {
    return this.write(`event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`);
  }

  /** SSE comment used for keep-alive frames. */
  comment(text: string): boolean {
    return this.write(`: ${text}\n\n`);
  }

  /** Mark the stream closed and stop the heartbeat without ending the socket. */
  abort(): void {
    if (this.closed) return;
    this.closed = true;
    this.stopHeartbeat();
    this.notifyClosed();
  }

  /** Close the heartbeat and end the response when it is still writable. */
  end(): void {
    if (this.closed) return;
    this.closed = true;
    this.stopHeartbeat();
    try {
      if (!this.response.writableEnded && !this.response.destroyed) {
        this.response.end();
      }
    } catch {
      // The socket may already be gone; there is nothing left to clean up.
    } finally {
      this.notifyClosed();
    }
  }

  private write(frame: string): boolean {
    if (this.isClosed) return false;
    try {
      this.response.write(frame);
      return true;
    } catch {
      this.abort();
      return false;
    }
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer === undefined) return;
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
  }

  private notifyClosed(): void {
    if (this.closeNotified) return;
    this.closeNotified = true;
    this.onClosed();
  }
}

/**
 * Factory for per-request SSE streams. The heartbeat interval comes from the
 * injected configuration, so tests can use a short interval while production
 * keeps the 15-second default. Callers must finish quota checks before calling
 * `start()`: once it runs, the response can no longer return a JSON error.
 */
@Injectable()
export class SseWriter {
  private readonly active = new Set<SseStream>();

  constructor(
    @Inject(AI_AGENT_CONFIG) private readonly config: AiAgentConfig,
  ) {}

  start(response: Response): SseStream {
    const stream = new SseStream(response, this.config.heartbeatIntervalMs);
    this.active.add(stream);
    stream.onClosed = () => {
      this.active.delete(stream);
    };
    return stream;
  }

  /** Exposed for cleanup assertions in tests; not part of the HTTP contract. */
  get activeSessionCount(): number {
    return this.active.size;
  }
}
