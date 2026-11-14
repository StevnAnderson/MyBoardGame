/**
 * Play-mode state for the small starter map.
 *
 * The board is three hex columns wide and five rows deep. Player A starts on the
 * top edge and Player B on the bottom edge; the left and right edges carry the
 * mineral and gas nodes. A turn lets each unmoved unit step to one adjacent hex,
 * then ending the turn lets Workers standing on a resource node harvest it.
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
  /** A unit may make one move per turn. */
  moved: boolean;
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

/** Everything a player can do on their turn, plus resigning the match. */
export type PlayAction =
  | { type: "move"; unitId: string; col: number; row: number }
  | { type: "endTurn" }
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

export function canMoveTo(state: PlayState, unit: PlayUnit, col: number, row: number): boolean {
  if (unit.owner !== state.active || unit.moved || unit.typeId === "base") return false;
  if (!inBounds(col, row)) return false;
  if (!isAdjacent(unit, { col, row })) return false;
  return unitAt(state, col, row) === undefined;
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

/**
 * Apply an action on behalf of one player. Used by the online match: the host
 * runs this for both sides, so an out-of-turn or forged move is simply ignored.
 */
export function applyPlayAction(
  state: PlayState,
  player: Player,
  action: PlayAction,
): PlayState {
  if (state.winner) return state;

  if (action.type === "forfeit") {
    const winner = otherPlayer(player);
    return {
      ...state,
      winner,
      log: [
        ...state.log,
        `${PLAYER_LABEL[player]} forfeited. ${PLAYER_LABEL[winner]} wins.`,
      ].slice(-6),
    };
  }

  if (state.active !== player) return state;
  if (action.type === "endTurn") return endTurn(state);

  const unit = unitById(state, action.unitId);
  if (!unit || unit.owner !== player) return state;
  return moveUnit(state, action.unitId, action.col, action.row);
}
