import { describe, expect, it } from "vitest";
import {
  MAP_COLS,
  MAP_ROWS,
  MAP_TILES,
  applyPlayAction,
  canMoveTo,
  createInitialState,
  endTurn,
  harvestFor,
  isAdjacent,
  moveUnit,
  neighbors,
  tileAt,
  unitAt,
  unitById,
} from "./play";

describe("starter map", () => {
  it("is three hexes wide with minerals and gas on both side edges", () => {
    expect(MAP_COLS).toBe(3);
    expect(MAP_TILES).toHaveLength(MAP_COLS * MAP_ROWS);

    const minerals = MAP_TILES.filter((tile) => tile.resource === "minerals");
    const gas = MAP_TILES.filter((tile) => tile.resource === "gas");
    expect(minerals).toHaveLength(2);
    expect(gas).toHaveLength(2);

    const leftEdge = MAP_TILES.filter((tile) => tile.col === 0 && tile.resource);
    const rightEdge = MAP_TILES.filter((tile) => tile.col === 2 && tile.resource);
    expect(leftEdge.map((tile) => tile.resource).sort()).toEqual(["gas", "minerals"]);
    expect(rightEdge.map((tile) => tile.resource).sort()).toEqual(["gas", "minerals"]);
  });

  it("starts the players on opposite edges", () => {
    const state = createInitialState();
    const aUnits = state.units.filter((unit) => unit.owner === "a");
    const bUnits = state.units.filter((unit) => unit.owner === "b");

    expect(aUnits.every((unit) => unit.row === 0)).toBe(true);
    expect(bUnits.every((unit) => unit.row === MAP_ROWS - 1)).toBe(true);
    expect(state.active).toBe("a");
    expect(state.turn).toBe(1);
  });

  it("starts each Worker next to a mineral node", () => {
    const state = createInitialState();
    for (const worker of state.units.filter((unit) => unit.typeId === "worker")) {
      const adjacent = neighbors(worker.col, worker.row)
        .map((coord) => tileAt(coord.col, coord.row))
        .some((tile) => tile?.resource === "minerals");
      expect(adjacent).toBe(true);
    }
  });
});

describe("hex neighbours", () => {
  it("has six neighbours away from the edge", () => {
    expect(neighbors(1, 2)).toHaveLength(6);
  });

  it("clips neighbours at the board edge", () => {
    expect(neighbors(1, 0)).toHaveLength(4);
    expect(neighbors(0, 0)).toHaveLength(2);
    expect(isAdjacent({ col: 0, row: 0 }, { col: 0, row: 1 })).toBe(true);
    expect(isAdjacent({ col: 0, row: 0 }, { col: 2, row: 2 })).toBe(false);
  });
});

describe("movement", () => {
  it("moves an active unit one adjacent hex and blocks a second move", () => {
    const state = createInitialState();
    const worker = unitById(state, "a-worker");
    if (!worker) throw new Error("missing worker");

    const moved = moveUnit(state, worker.id, worker.col, worker.row + 1);

    expect(unitById(moved, worker.id)).toMatchObject({ col: 0, row: 1, moved: true });
    expect(moveUnit(moved, worker.id, 0, 2)).toBe(moved);
  });

  it("cannot move bases, enemy units, or onto an occupied hex", () => {
    const state = createInitialState();
    const base = unitById(state, "a-base");
    const soldier = unitById(state, "a-soldier");
    const enemy = unitById(state, "b-worker");
    if (!base || !soldier || !enemy) throw new Error("missing units");

    expect(canMoveTo(state, base, 1, 1)).toBe(false);
    expect(canMoveTo(state, enemy, 2, 3)).toBe(false);
    // A's soldier at C1 cannot step onto A's own base at B1.
    expect(canMoveTo(state, soldier, 1, 0)).toBe(false);
  });

  it("cannot move to a non-adjacent hex", () => {
    const state = createInitialState();
    const soldier = unitById(state, "a-soldier");
    if (!soldier) throw new Error("missing soldier");

    expect(canMoveTo(state, soldier, 2, 2)).toBe(false);
  });
});

describe("turns and harvesting", () => {
  it("collects resources for Workers standing on a node when the turn ends", () => {
    let state = createInitialState();
    const worker = unitById(state, "a-worker");
    if (!worker) throw new Error("missing worker");

    state = moveUnit(state, worker.id, worker.col, worker.row + 1);
    expect(tileAt(0, 1)?.resource).toBe("minerals");
    expect(harvestFor(state, "a")).toEqual({ minerals: 1, gas: 0 });

    state = endTurn(state);

    expect(state.stock.a).toEqual({ minerals: 1, gas: 0 });
    expect(state.active).toBe("b");
    expect(state.turn).toBe(1);
    expect(unitById(state, "a-worker")?.moved).toBe(true);
    expect(unitById(state, "b-worker")?.moved).toBe(false);
  });

  it("counts a completed round after Player B ends their turn", () => {
    let state = createInitialState();
    state = endTurn(state);
    expect(state.turn).toBe(1);

    state = endTurn(state);
    expect(state.turn).toBe(2);
    expect(state.active).toBe("a");
  });

  it("gives the incoming player a fresh move without stacking resources", () => {
    let state = createInitialState();
    const worker = unitById(state, "a-worker");
    if (!worker) throw new Error("missing worker");

    state = moveUnit(state, worker.id, worker.col, worker.row + 1);
    state = endTurn(state); // B's turn, A worker harvests
    state = endTurn(state); // back to A

    expect(state.stock.a).toEqual({ minerals: 1, gas: 0 });
    expect(unitById(state, "a-worker")?.moved).toBe(false);
    expect(unitAt(state, 0, 1)?.id).toBe(worker.id);
  });
});

describe("online match actions", () => {
  it("applies an active player's move through the action wrapper", () => {
    const state = createInitialState();

    const moved = applyPlayAction(state, "a", {
      type: "move",
      unitId: "a-worker",
      col: 0,
      row: 1,
    });

    expect(unitById(moved, "a-worker")).toMatchObject({ col: 0, row: 1, moved: true });
    expect(moved).not.toBe(state);
  });

  it("ignores moves made out of turn or on behalf of the opponent", () => {
    const state = createInitialState();

    expect(
      applyPlayAction(state, "b", {
        type: "move",
        unitId: "a-worker",
        col: 0,
        row: 1,
      }),
    ).toBe(state);

    expect(
      applyPlayAction(state, "a", {
        type: "move",
        unitId: "b-soldier",
        col: 0,
        row: 3,
      }),
    ).toBe(state);
  });

  it("ends the turn only for the active player", () => {
    const state = createInitialState();

    expect(applyPlayAction(state, "b", { type: "endTurn" })).toBe(state);

    const next = applyPlayAction(state, "a", { type: "endTurn" });
    expect(next.active).toBe("b");
  });

  it("forfeits at any time and declares the other player the winner", () => {
    const state = createInitialState();

    const resigned = applyPlayAction(state, "b", { type: "forfeit" });

    expect(resigned.winner).toBe("a");
    expect(resigned.active).toBe("a");
    expect(resigned.log.at(-1)).toMatch(/Player B forfeited/i);
    // Once there is a winner, further actions are ignored.
    expect(
      applyPlayAction(resigned, "a", { type: "endTurn" }),
    ).toBe(resigned);
  });
});
