import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';

/** Canonical maintenance keys (owned by settings-expansion, Session 13). */
export const MAINTENANCE_ENABLED_KEY = 'maintenance.enabled';
export const MAINTENANCE_MESSAGE_KEY = 'maintenance.message';

export interface MaintenanceState {
  enabled: boolean;
  message: string;
}

/**
 * Runtime maintenance gate state (settings-expansion, Session 13).
 * Reads/writes the canonical `maintenance.*` keys through `SettingsService`
 * (same key name/shape Session 8's analytics queue reads — that read is
 * untouched). `setState` is single-flight, mirroring the `internal/jobs`
 * mutex: overlapping toggles execute the write exactly once.
 */
@Injectable()
export class MaintenanceService {
  private inFlight: Promise<MaintenanceState> | null = null;

  constructor(private readonly settings: SettingsService) {}

  async getState(): Promise<MaintenanceState> {
    const [enabled, message] = await Promise.all([
      this.settings.get<boolean>(MAINTENANCE_ENABLED_KEY, false),
      this.settings.get<string>(MAINTENANCE_MESSAGE_KEY, ''),
    ]);
    return {
      enabled: enabled === true,
      message: typeof message === 'string' ? message : '',
    };
  }

  async isEnabled(): Promise<boolean> {
    return (await this.getState()).enabled;
  }

  setState(enabled: boolean, message?: string): Promise<MaintenanceState> {
    if (this.inFlight) {
      return this.inFlight;
    }
    const execution = this.execute(enabled, message);
    this.inFlight = execution;
    void execution.finally(() => {
      this.inFlight = null;
    });
    return execution;
  }

  private async execute(
    enabled: boolean,
    message?: string,
  ): Promise<MaintenanceState> {
    await this.settings.set(MAINTENANCE_ENABLED_KEY, enabled);
    if (message !== undefined) {
      await this.settings.set(MAINTENANCE_MESSAGE_KEY, message);
    }
    return this.getState();
  }
}
