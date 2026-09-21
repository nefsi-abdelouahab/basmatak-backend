import { Injectable, Logger } from '@nestjs/common';

export type AppLogLevel = 'error' | 'warn' | 'log' | 'debug' | 'verbose';

const LEVEL_PRIORITY: Record<AppLogLevel, number> = {
  error: 1,
  warn: 2,
  log: 3,
  debug: 4,
  verbose: 5,
};

function resolveConfiguredLevel(): AppLogLevel {
  const raw = String(process.env.LOG_LEVEL ?? 'log').toLowerCase();
  return (LEVEL_PRIORITY[raw as AppLogLevel] ? raw : 'log') as AppLogLevel;
}

/**
 * App-wide logger whose output is controlled by `LOG_LEVEL`
 * (default `log`). Messages below the configured level are dropped.
 */
@Injectable()
export class AppLogger extends Logger {
  private readonly threshold: number;

  constructor(context?: string) {
    super(context ?? 'AppLogger');
    this.threshold = LEVEL_PRIORITY[resolveConfiguredLevel()];
  }

  private enabled(level: AppLogLevel): boolean {
    return LEVEL_PRIORITY[level] <= this.threshold;
  }

  override log(message: any, ...optionalParams: any[]): void {
    if (this.enabled('log')) {
      super.log(message, ...optionalParams);
    }
  }

  override warn(message: any, ...optionalParams: any[]): void {
    if (this.enabled('warn')) {
      super.warn(message, ...optionalParams);
    }
  }

  override error(message: any, ...optionalParams: any[]): void {
    if (this.enabled('error')) {
      super.error(message, ...optionalParams);
    }
  }

  override debug(message: any, ...optionalParams: any[]): void {
    if (this.enabled('debug')) {
      super.debug(message, ...optionalParams);
    }
  }

  override verbose(message: any, ...optionalParams: any[]): void {
    if (this.enabled('verbose')) {
      super.verbose(message, ...optionalParams);
    }
  }

  /** Current effective level (exposed for tests). */
  getLevel(): AppLogLevel {
    return (
      (Object.keys(LEVEL_PRIORITY) as AppLogLevel[]).find(
        (key) => LEVEL_PRIORITY[key] === this.threshold,
      ) ?? 'log'
    );
  }
}
