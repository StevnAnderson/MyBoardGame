import type { CardDefinition, RangeBand } from "./types";

/**
 * Stat blocks transcribed from BoardGame.docx.
 *
 * Structures — Name: HP / threatening / produces / unlocks
 *   Base      8  yes  workers, minerals  refinery, barracks
 *   Refinery  5  no   gas                 -
 *   Barracks  5  no   soldiers, walkers   factory
 *   Factory   5  no   artillery           -
 *
 * Units — Name: HP / threatening / damage / range
 *   Worker     1  no   1  melee
 *   Soldier    3  yes  2  melee
 *   Walker     2  yes  3  mid
 *   Artillery  5  yes  8  long
 */
export const CARD_DEFINITIONS: CardDefinition[] = [
  {
    id: "worker",
    name: "Worker",
    kind: "unit",
    cost: { minerals: 2, gas: 0 },
    hp: 1,
    damage: 1,
    range: "melee",
    threatening: false,
    supply: 12,
    blurb:
      "Garrisons a structure to generate income, and constructs new structures. Fragile — keep it out of the line.",
    glyph: "⚒",
  },
  {
    id: "soldier",
    name: "Soldier",
    kind: "unit",
    cost: { minerals: 3, gas: 0 },
    hp: 3,
    damage: 2,
    range: "melee",
    threatening: true,
    supply: 12,
    blurb: "Cheap, durable line infantry. The backbone of any melee push.",
    glyph: "⚔",
  },
  {
    id: "walker",
    name: "Walker",
    kind: "unit",
    cost: { minerals: 5, gas: 1 },
    hp: 2,
    damage: 3,
    range: "mid",
    threatening: true,
    supply: 12,
    blurb: "Mid-range skirmisher: hits before melee, but folds quickly under focused fire.",
    glyph: "⬢",
  },
  {
    id: "artillery",
    name: "Artillery",
    kind: "unit",
    cost: { minerals: 8, gas: 1 },
    hp: 5,
    damage: 8,
    range: "long",
    threatening: true,
    supply: 9,
    blurb: "Long-range siege. Devastating at range, helpless once the enemy closes.",
    glyph: "✦",
  },
  {
    id: "base",
    name: "Base",
    kind: "structure",
    cost: { minerals: 8, gas: 0 },
    hp: 8,
    damage: 0,
    range: null,
    threatening: true,
    supply: 6,
    produces: ["workers", "minerals"],
    unlocks: ["refinery", "barracks"],
    blurb: "Your foothold. Produces Workers and minerals. Losing it ends your game.",
    glyph: "⌂",
  },
  {
    id: "refinery",
    name: "Refinery",
    kind: "structure",
    cost: { minerals: 3, gas: 0 },
    hp: 5,
    damage: 0,
    range: null,
    threatening: false,
    supply: 5,
    produces: ["gas"],
    blurb: "Gives +1 gas income. Requires a Worker garrison to operate.",
    glyph: "◈",
  },
  {
    id: "barracks",
    name: "Barracks",
    kind: "structure",
    cost: { minerals: 5, gas: 0 },
    hp: 5,
    damage: 0,
    range: null,
    threatening: false,
    supply: 8,
    produces: ["soldiers", "walkers"],
    unlocks: ["factory"],
    blurb: "Trains Soldiers and Walkers. Unlocks the Factory.",
    glyph: "▥",
  },
  {
    id: "factory",
    name: "Factory",
    kind: "structure",
    cost: { minerals: 6, gas: 2 },
    hp: 5,
    damage: 0,
    range: null,
    threatening: false,
    supply: 6,
    produces: ["artillery"],
    blurb: "Builds Artillery — your only long-range unit. Gas-hungry.",
    glyph: "⚙",
  },
];

export const CARD_BY_ID: Record<string, CardDefinition> = Object.fromEntries(
  CARD_DEFINITIONS.map((definition) => [definition.id, definition]),
);

export function getDefinition(typeId: string): CardDefinition {
  const definition = CARD_BY_ID[typeId];
  if (!definition) throw new Error(`Unknown card type: ${typeId}`);
  return definition;
}

export const RANGE_ORDER: RangeBand[] = ["long", "mid", "melee"];

export const RANGE_LABEL: Record<RangeBand, string> = {
  long: "Long range",
  mid: "Mid range",
  melee: "Melee",
};

export const RANGE_SHORT: Record<RangeBand, string> = {
  long: "LNG",
  mid: "MID",
  melee: "MEL",
};

/** Build-tree tiers used by the Codex view. */
export const BUILD_TREE: { structureId: string; unlockedBy: string | null }[] = [
  { structureId: "base", unlockedBy: null },
  { structureId: "refinery", unlockedBy: "base" },
  { structureId: "barracks", unlockedBy: "base" },
  { structureId: "factory", unlockedBy: "barracks" },
];
