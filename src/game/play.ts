/**
 * Play-mode state for the small starter map.
 *
 * The board is three hex columns wide and five rows deep. Player A starts on the
 * top edge and Player B on the bottom edge; the left and right edges carry the
 * mineral and gas nodes. Both players plan at the same time: each mobile unit
 * may step to one adjacent hex, then both plans resolve together. Workers
 * standing on a resource node harvest at the end of the round.
 *
 * This is deliberately framework-free so the movement/harvest rules can be
 * tested without React.
 */

export type Player = "a" | "b";
export type ResourceType = "minerals" | "gas";
export type PlayUnitType = "base" | "worker" | "soldier";

export interface HexCoord {
  col: number;
  row: number;
}

export interface MapTile extends HexCoord {
  id: string;
  resource: ResourceType | null;
}

export interface PlayUnit extends HexCoord {
  id: string;
  owner: Player;
  typeId: PlayUnitType;
  /** A unit may make one move per round. */
  moved: boolean;
}

/** One unit's planned step for the coming round. */
export interface PlayMove {
  unitId: string;
  col: number;
  row: number;
}

/** Both players' plans for a round. The host pairs these up before resolving. */
export interface RoundSubmissions {
  a: PlayMove[];
  b: PlayMove[];
}

export interface Stock {
  minerals: number;
  gas: number;
}

export interface PlayState {
  units: PlayUnit[];
  active: Player;
  turn: number;
  stock: Record<Player, Stock>;
  log: string[];
  /** Set when a player forfeits the online match. */
  winner: Player | null;
}

/** Everything a player can send during an online match. */
export type PlayAction =
  | { type: "submit"; moves: PlayMove[] }
  | { type: "forfeit" };

export const MAP_COLS = 3;
export const MAP_ROWS = 5;

export const PLAYER_LABEL: Record<Player, string> = {
  a: "Player A",
  b: "Player B",
};

export const UNIT_LABEL: Record<PlayUnitType, string> = {
  base: "Base",
  worker: "Worker",
  soldier: "Soldier",
};

const RESOURCES: { col: number; row: number; resource: ResourceType }[] = [
  // Both side edges carry one mineral and one gas node.
  { col: 0, row: 1, resource: "minerals" },
  { col: 2, row: 1, resource: "gas" },
  { col: 0, row: 3, resource: "gas" },
  { col: 2, row: 3, resource: "minerals" },
];

export function hexId(col: number, row: number): string {
  return `${col},${row}`;
}

export function tileLabel(col: number, row: number): string {
  return `${"ABC"[col] ?? "?"}${row + 1}`;
}

export function inBounds(col: number, row: number): boolean {
  return col >= 0 && col < MAP_COLS && row >= 0 && row < MAP_ROWS;
}

export const MAP_TILES: MapTile[] = Array.from({ length: MAP_ROWS }, (_, row) =>
  Array.from({ length: MAP_COLS }, (_, col) => {
    const resource = RESOURCES.find(
      (entry) => entry.col === col && entry.row === row,
    )?.resource;
    return {
      id: hexId(col, row),
      col,
      row,
      resource: resource ?? null,
    };
  }),
).flat();

export function tileAt(col: number, row: number): MapTile | undefined {
  if (!inBounds(col, row)) return undefined;
  return MAP_TILES.find((tile) => tile.col === col && tile.row === row);
}

/**
 * Pointy-top hexes use staggered (odd-r) rows: odd rows sit half a hex to the
 * right. Each row therefore has a different pair of upper/lower neighbours.
 */
export function neighbors(col: number, row: number): HexCoord[] {
  const deltas: Array<[number, number]> =
    row % 2 === 0
      ? [
          [-1, 0],
          [1, 0],
          [-1, -1],
          [0, -1],
          [-1, 1],
          [0, 1],
        ]
      : [
          [-1, 0],
          [1, 0],
          [0, -1],
          [1, -1],
          [0, 1],
          [1, 1],
        ];
  return deltas
    .map(([dc, dr]) => ({ col: col + dc, row: row + dr }))
    .filter((coord) => inBounds(coord.col, coord.row));
}

export function unitAt(state: PlayState, col: number, row: number): PlayUnit | undefined {
  return state.units.find((unit) => unit.col === col && unit.row === row);
}

export function unitById(state: PlayState, id: string): PlayUnit | undefined {
  return state.units.find((unit) => unit.id === id);
}

export function createInitialState(): PlayState {
  return {
    units: [
      { id: "a-base", owner: "a", typeId: "base", col: 1, row: 0, moved: false },
      { id: "a-worker", owner: "a", typeId: "worker", col: 0, row: 0, moved: false },
      { id: "a-soldier", owner: "a", typeId: "soldier", col: 2, row: 0, moved: false },
      { id: "b-base", owner: "b", typeId: "base", col: 1, row: 4, moved: false },
      { id: "b-worker", owner: "b", typeId: "worker", col: 2, row: 4, moved: false },
      { id: "b-soldier", owner: "b", typeId: "soldier", col: 0, row: 4, moved: false },
    ],
    active: "a",
    turn: 1,
    stock: {
      a: { minerals: 0, gas: 0 },
      b: { minerals: 0, gas: 0 },
    },
    log: ["Player A starts on the top edge. Select a unit, then click a neighbouring hex."],
    winner: null,
  };
}

export function otherPlayer(player: Player): Player {
  return player === "a" ? "b" : "a";
}

export function isAdjacent(from: HexCoord, to: HexCoord): boolean {
  return neighbors(from.col, from.row).some(
    (coord) => coord.col === to.col && coord.row === to.row,
  );
}

export function canUnitMoveTo(
  state: PlayState,
  unit: PlayUnit,
  col: number,
  row: number,
): boolean {
  if (unit.moved || unit.typeId === "base") return false;
  if (!inBounds(col, row)) return false;
  if (!isAdjacent(unit, { col, row })) return false;
  return unitAt(state, col, row) === undefined;
}

export function canMoveTo(state: PlayState, unit: PlayUnit, col: number, row: number): boolean {
  if (unit.owner !== state.active) return false;
  return canUnitMoveTo(state, unit, col, row);
}

export function moveUnit(
  state: PlayState,
  unitId: string,
  col: number,
  row: number,
): PlayState {
  const unit = unitById(state, unitId);
  if (!unit || !canMoveTo(state, unit, col, row)) return state;

  const message = `${PLAYER_LABEL[unit.owner]} moved ${UNIT_LABEL[unit.typeId]} to ${tileLabel(col, row)}.`;
  return {
    ...state,
    units: state.units.map((entry) =>
      entry.id === unitId ? { ...entry, col, row, moved: true } : entry,
    ),
    log: [...state.log, message].slice(-6),
  };
}

/** Resources the given player's Workers would collect if the turn ended now. */
export function harvestFor(state: PlayState, player: Player): Stock {
  const gained: Stock = { minerals: 0, gas: 0 };
  for (const unit of state.units) {
    if (unit.owner !== player || unit.typeId !== "worker") continue;
    const tile = tileAt(unit.col, unit.row);
    if (tile?.resource) gained[tile.resource] += 1;
  }
  return gained;
}

function describeHarvest(gained: Stock): string {
  const parts: string[] = [];
  if (gained.minerals > 0) {
    parts.push(`${gained.minerals} mineral${gained.minerals === 1 ? "" : "s"}`);
  }
  if (gained.gas > 0) {
    parts.push(`${gained.gas} gas`);
  }
  return parts.length > 0 ? `collected ${parts.join(" and ")}` : "collected nothing";
}

/**
 * Harvest for the active player, reset the incoming player's movement, and pass
 * the turn. Turn numbers count completed rounds (Player B ending their turn).
 */
export function endTurn(state: PlayState): PlayState {
  const gained = harvestFor(state, state.active);
  const next: Player = state.active === "a" ? "b" : "a";
  const message = `${PLAYER_LABEL[state.active]} ${describeHarvest(gained)}. ${PLAYER_LABEL[next]}'s turn.`;

  return {
    ...state,
    units: state.units.map((unit) =>
      unit.owner === next ? { ...unit, moved: false } : unit,
    ),
    stock: {
      ...state.stock,
      [state.active]: {
        minerals: state.stock[state.active].minerals + gained.minerals,
        gas: state.stock[state.active].gas + gained.gas,
      },
    },
    active: next,
    turn: next === "a" ? state.turn + 1 : state.turn,
    log: [...state.log, message].slice(-6),
  };
}

interface AcceptedMove {
  player: Player;
  unit: PlayUnit;
  move: PlayMove;
}

function acceptedMoves(
  state: PlayState,
  player: Player,
  moves: PlayMove[],
): AcceptedMove[] {
  const accepted: AcceptedMove[] = [];
  const claimedUnits = new Set<string>();
  const claimedTargets = new Set<string>();

  for (const move of moves) {
    const unit = unitById(state, move.unitId);
    if (!unit || unit.owner !== player) continue;
    if (claimedUnits.has(unit.id)) continue;
    if (!canUnitMoveTo(state, unit, move.col, move.row)) continue;

    const target = hexId(move.col, move.row);
    if (claimedTargets.has(target)) continue;

    claimedUnits.add(unit.id);
    claimedTargets.add(target);
    accepted.push({ player, unit, move });
  }

  return accepted;
}

/**
 * Resolve a full round from both players' plans.
 *
 * Every unit steps once, at the same time. Destinations are checked against the
 * positions at the start of the round, so units cannot chain through each
 * other. If both players pick the same empty hex, both of those moves are
 * cancelled. Workers then harvest for their own side and the next round begins.
 */
export function resolveRound(
  state: PlayState,
  submissions: RoundSubmissions,
): PlayState {
  if (state.winner) return state;

  const accepted = [
    ...acceptedMoves(state, "a", submissions.a),
    ...acceptedMoves(state, "b", submissions.b),
  ];

  const byTarget = new Map<string, AcceptedMove[]>();
  for (const entry of accepted) {
    const target = hexId(entry.move.col, entry.move.row);
    const group = byTarget.get(target);
    if (group) group.push(entry);
    else byTarget.set(target, [entry]);
  }

  const contested = accepted.filter(
    (entry) => (byTarget.get(hexId(entry.move.col, entry.move.row))?.length ?? 0) > 1,
  );
  const moving = accepted.filter((entry) => !contested.includes(entry));
  const movingByUnit = new Map(moving.map((entry) => [entry.unit.id, entry]));

  const units = state.units.map((unit) => {
    const entry = movingByUnit.get(unit.id);
    return entry
      ? { ...unit, col: entry.move.col, row: entry.move.row, moved: false }
      : { ...unit, moved: false };
  });

  const movedState: PlayState = { ...state, units };
  const gainedA = harvestFor(movedState, "a");
  const gainedB = harvestFor(movedState, "b");

  const log = [...state.log];
  if (moving.length === 0) {
    log.push("Both sides held position.");
  } else {
    for (const player of ["a", "b"] as Player[]) {
      const moves = moving.filter((entry) => entry.player === player);
      if (moves.length === 0) continue;
      const summary = moves
        .map(
          (entry) =>
            `${UNIT_LABEL[entry.unit.typeId]} ${tileLabel(entry.unit.col, entry.unit.row)}→${tileLabel(entry.move.col, entry.move.row)}`,
        )
        .join(", ");
      log.push(`${PLAYER_LABEL[player]} moved ${summary}.`);
    }
  }

  if (contested.length > 0) {
    const targets = Array.from(
      new Set(contested.map((entry) => tileLabel(entry.move.col, entry.move.row))),
    );
    log.push(`Contested ${targets.join(", ")}: both moves cancelled.`);
  }

  for (const player of ["a", "b"] as Player[]) {
    const gained = player === "a" ? gainedA : gainedB;
    if (gained.minerals > 0 || gained.gas > 0) {
      log.push(`${PLAYER_LABEL[player]} ${describeHarvest(gained)}.`);
    }
  }

  log.push(`Round ${state.turn + 1} begins.`);

  return {
    ...movedState,
    turn: state.turn + 1,
    stock: {
      a: {
        minerals: state.stock.a.minerals + gainedA.minerals,
        gas: state.stock.a.gas + gainedA.gas,
      },
      b: {
        minerals: state.stock.b.minerals + gainedB.minerals,
        gas: state.stock.b.gas + gainedB.gas,
      },
    },
    log: log.slice(-6),
  };
}
