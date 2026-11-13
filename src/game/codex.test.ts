import { describe, expect, it } from "vitest";
import { CARD_DEFINITIONS, BUILD_TREE, getDefinition } from "./codex";

describe("codex data", () => {
  it("matches the printed card counts in BoardGame.docx", () => {
    const supplies = Object.fromEntries(
      CARD_DEFINITIONS.map((definition) => [definition.id, definition.supply]),
    );

    expect(supplies).toEqual({
      worker: 12,
      soldier: 12,
      walker: 12,
      artillery: 9,
      base: 6,
      refinery: 5,
      barracks: 8,
      factory: 6,
    });
  });

  it("gives every card a positive supply and a glyph", () => {
    for (const definition of CARD_DEFINITIONS) {
      expect(definition.supply).toBeGreaterThan(0);
      expect(definition.glyph.length).toBeGreaterThan(0);
    }
  });

  it("only unlocks structures that exist", () => {
    for (const node of BUILD_TREE) {
      expect(getDefinition(node.structureId).kind).toBe("structure");
      if (node.unlockedBy) {
        expect(getDefinition(node.unlockedBy).unlocks).toContain(node.structureId);
      }
    }
  });
});
