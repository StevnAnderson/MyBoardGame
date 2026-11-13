import { getDefinition } from "./codex";
import type { Card } from "./types";

let counter = 0;

/** Create a fresh card instance at full health. Pass a uid for deterministic tests. */
export function createCard(typeId: string, uid?: string): Card {
  const definition = getDefinition(typeId);
  counter += 1;
  return {
    uid: uid ?? `${typeId}-${counter}-${Math.random().toString(36).slice(2, 7)}`,
    typeId,
    hp: definition.hp,
    retreating: false,
  };
}

export function createArmy(typeIds: string[]): Card[] {
  return typeIds.map((typeId) => createCard(typeId));
}

export function cloneCards(cards: Card[]): Card[] {
  return cards.map((card) => ({ ...card }));
}
