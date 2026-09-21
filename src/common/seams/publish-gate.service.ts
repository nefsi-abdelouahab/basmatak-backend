import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface PublishGateEvaluation {
  locked: boolean;
  /** Business code when locked (e.g. `PUBLISH_GATE_LOCKED`). */
  code?: string;
}

/**
 * Extension seam for the publish gate (roadmap A7/F9).
 * Owned by Session 13 (real per-organization pending-opportunity count reading
 * `publishGate.maxPendingOpportunities` from system_settings).
 *
 * Default (until S13): unlocked unless `PUBLISH_GATE_ENABLED=true`, in which
 * case the demo path reports `PUBLISH_GATE_LOCKED`.
 */
@Injectable()
export class PublishGateService {
  constructor(private readonly config: ConfigService) {}

  async evaluate(_organization: {
    id: string;
  }): Promise<PublishGateEvaluation> {
    const enabled =
      String(this.config.get('PUBLISH_GATE_ENABLED', false)).toLowerCase() ===
      'true';
    if (enabled) {
      return { locked: true, code: 'PUBLISH_GATE_LOCKED' };
    }
    return { locked: false };
  }
}
