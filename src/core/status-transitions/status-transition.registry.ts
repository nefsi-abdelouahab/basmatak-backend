import { Injectable } from '@nestjs/common';

export type TransitionPair = readonly [from: string, to: string];

/**
 * Per-entity status transition whitelist registry (roadmap S1).
 * Empty at bootstrap; owning modules (Sessions 6, 7, 10, 11) register their
 * entity's machine.
 */
@Injectable()
export class StatusTransitionRegistry {
  private readonly whitelists = new Map<string, Set<string>>();

  register(entityType: string, transitions: readonly TransitionPair[]): void {
    const set = this.whitelists.get(entityType) ?? new Set<string>();
    for (const [from, to] of transitions) {
      set.add(`${from}->${to}`);
    }
    this.whitelists.set(entityType, set);
  }

  isRegistered(entityType: string): boolean {
    return this.whitelists.has(entityType);
  }

  isAllowed(entityType: string, from: string, to: string): boolean {
    return this.whitelists.get(entityType)?.has(`${from}->${to}`) ?? false;
  }
}
