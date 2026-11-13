/** Core game types. Kept framework-free so the rules engine can be tested in isolation. */

export type RangeBand = "melee" | "mid" | "long";
export type CardKind = "unit" | "structure";
export type Team = "a" | "b";

export interface Cost {
  minerals: number;
  gas: number;
}

export interface CardDefinition {
  id: string;
  name: string;
  kind: CardKind;
  cost: Cost;
  hp: number;
  damage: number;
  /** null for structures — they never attack. */
  range: RangeBand | null;
  threatening: boolean;
  /** Physical cards in the box — a hard per-player cap. */
  supply: number;
  /** What this card can build or generate (structures only). */
  produces?: string[];
  /** What this card unlocks in the build tree (structures only). */
  unlocks?: string[];
  blurb: string;
  glyph: string;
}

/** A card on the table: a pointer to a definition plus per-instance state. */
export interface Card {
  uid: string;
  typeId: string;
  hp: number;
  /** Units only. Marked by turning the card 90° before a battle is revealed. */
  retreating: boolean;
  /** Permanently out of this battle after a successful retreat. */
  retreated?: boolean;
}
