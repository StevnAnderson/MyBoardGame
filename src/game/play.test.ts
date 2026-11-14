import { describe, expect, it } from "vitest";
import {
  MAP_COLS,
  MAP_ROWS,
  MAP_TILES,
  canMoveTo,
  canUnitMoveTo,
  createInitialState,
  endTurn,
  harvestFor,
  isAdjacent,
  moveUnit,
  neighbors,
  resolveRound,
  tileAt,
  unitAt,
  unitById,
  unitsAt,
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

  it("cannot move bases or enemy units, and keeps enemy-held hexes closed", () => {
    const state = createInitialState();
    const base = unitById(state, "a-base");
    const enemy = unitById(state, "b-worker");
    if (!base || !enemy) throw new Error("missing units");

    expect(canMoveTo(state, base, 1, 1)).toBe(false);
    expect(canMoveTo(state, enemy, 2, 3)).toBe(false);

    // Put Player B's Worker next to Player A's Worker and try to step in.
    const blockaded = {
      ...state,
      units: state.units.map((unit) =>
        unit.id === "b-worker" ? { ...unit, col: 0, row: 1 } : unit,
      ),
    };
    const worker = unitById(blockaded, "a-worker");
    if (!worker) throw new Error("missing worker");
    expect(canUnitMoveTo(blockaded, worker, 0, 1)).toBe(false);
  });

  it("lets allied pieces stack on the same hex", () => {
    const state = createInitialState();
    const soldier = unitById(state, "a-soldier");
    if (!soldier) throw new Error("missing soldier");

    // A's soldier at C1 can join A's base at B1.
    expect(canMoveTo(state, soldier, 1, 0)).toBe(true);
    const moved = moveUnit(state, soldier.id, 1, 0);
    expect(unitsAt(moved, 1, 0).map((unit) => unit.id).sort()).toEqual([
      "a-base",
      "a-soldier",
    ]);
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

describe("simultaneous rounds", () => {
  it("moves both players' units in the same round and harvests for both", () => {
    const state = createInitialState();

    const next = resolveRound(state, {
      a: [
        { unitId: "a-worker", col: 0, row: 1 },
        { unitId: "a-soldier", col: 2, row: 1 },
      ],
      b: [
        { unitId: "b-worker", col: 2, row: 3 },
        { unitId: "b-soldier", col: 0, row: 3 },
      ],
    });

    expect(unitById(next, "a-worker")).toMatchObject({ col: 0, row: 1 });
    expect(unitById(next, "a-soldier")).toMatchObject({ col: 2, row: 1 });
    expect(unitById(next, "b-worker")).toMatchObject({ col: 2, row: 3 });
    expect(unitById(next, "b-soldier")).toMatchObject({ col: 0, row: 3 });
    expect(next.stock).toEqual({
      a: { minerals: 1, gas: 0 },
      b: { minerals: 1, gas: 0 },
    });
    expect(next.turn).toBe(2);
    expect(unitById(next, "a-worker")?.moved).toBe(false);
  });

  it("lets several allied units enter the same hex in one round", () => {
    const state = createInitialState();
    const units = state.units.map((unit) => {
      if (unit.id === "a-worker") return { ...unit, col: 0, row: 1 };
      if (unit.id === "a-soldier") return { ...unit, col: 2, row: 1 };
      return unit;
    });

    const next = resolveRound(
      { ...state, units },
      {
        a: [
          { unitId: "a-worker", col: 1, row: 1 },
          { unitId: "a-soldier", col: 1, row: 1 },
        ],
        b: [],
      },
    );

    expect(unitsAt(next, 1, 1).map((unit) => unit.id).sort()).toEqual([
      "a-soldier",
      "a-worker",
    ]);
  });

  it("harvests once per Worker stacked on a resource node", () => {
    const state = createInitialState();
    const units = [
      ...state.units.map((unit) =>
        unit.id === "a-worker" ? { ...unit, col: 0, row: 1 } : unit,
      ),
      { id: "a-worker-2", owner: "a" as const, typeId: "worker" as const, col: 0, row: 1, moved: false },
    ];
    const stacked = { ...state, units };

    expect(harvestFor(stacked, "a")).toEqual({ minerals: 2, gas: 0 });
  });

  it("ignores forged, impossible and duplicate moves", () => {
    const state = createInitialState();

    const next = resolveRound(state, {
      a: [
        // Not Player A's unit.
        { unitId: "b-worker", col: 2, row: 3 },
        // Bases never move.
        { unitId: "a-base", col: 1, row: 1 },
        // Not adjacent.
        { unitId: "a-worker", col: 2, row: 2 },
        // The first move for the soldier is kept; the second is ignored.
        { unitId: "a-soldier", col: 2, row: 1 },
        { unitId: "a-soldier", col: 0, row: 0 },
      ],
      b: [],
    });

    expect(unitById(next, "b-worker")).toMatchObject({ col: 2, row: 4 });
    expect(unitById(next, "a-base")).toMatchObject({ col: 1, row: 0 });
    expect(unitById(next, "a-worker")).toMatchObject({ col: 0, row: 0 });
    expect(unitById(next, "a-soldier")).toMatchObject({ col: 2, row: 1 });
    expect(next.turn).toBe(2);
  });

  it("cancels both moves when the players contest the same hex", () => {
    const state = createInitialState();
    const units = state.units.map((unit) => {
      if (unit.id === "a-worker") return { ...unit, col: 1, row: 2 };
      if (unit.id === "b-worker") return { ...unit, col: 2, row: 3 };
      return unit;
    });

    const next = resolveRound(
      { ...state, units },
      {
        a: [{ unitId: "a-worker", col: 2, row: 2 }],
        b: [{ unitId: "b-worker", col: 2, row: 2 }],
      },
    );

    expect(unitById(next, "a-worker")).toMatchObject({ col: 1, row: 2 });
    expect(unitById(next, "b-worker")).toMatchObject({ col: 2, row: 3 });
    expect(next.log.some((line) => line.includes("Contested"))).toBe(true);
  });

  it("advances the round when both sides hold position", () => {
    const state = createInitialState();

    const next = resolveRound(state, { a: [], b: [] });

    expect(next.turn).toBe(2);
    expect(next.units).toEqual(state.units);
    expect(next.stock).toEqual(state.stock);
  });
});
