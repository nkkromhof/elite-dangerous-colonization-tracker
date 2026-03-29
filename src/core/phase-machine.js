import { getConstruction, updateConstructionPhase } from '../db/repositories/construction-repo.js';

const VALID_TRANSITIONS = {
  scanning:   ['collection'],
  collection: ['done'],
  done:       [],
};

export class PhaseMachine {
  /** @param {import('events').EventEmitter} eventBus */
  constructor(eventBus) {
    this._bus = eventBus;
  }

  transition(constructionId, toPhase) {
    const construction = getConstruction(constructionId);
    if (!construction) throw new Error(`Construction ${constructionId} not found`);
    const allowed = VALID_TRANSITIONS[construction.phase] ?? [];
    if (!allowed.includes(toPhase)) {
      throw new Error(`Invalid phase transition: ${construction.phase} → ${toPhase}`);
    }
    updateConstructionPhase(constructionId, toPhase);
    this._bus.emit('construction:phase_changed', { constructionId, from: construction.phase, to: toPhase });
  }
}
