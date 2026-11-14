export type ChessVariantId = "amazons" | "pferdeaeppel";
export type ChessPlayer = "white" | "black";
export type ChessPhase = "move" | "shoot";

export interface ChessPiece {
  id: string;
  owner: ChessPlayer;
  col: number;
  row: number;
}

export interface ChessVariantState {
  variant: ChessVariantId;
  pieces: ChessPiece[];
  arrows: string[];
  destroyed: string[];
  active: ChessPlayer;
  phase: ChessPhase;
  selectedId: string | null;
  winner: ChessPlayer | null;
}

export const CHESS_FILES = "abcdefgh";
export const CHESS_RANKS = "87654321";

export function squareId(col: number, row: number): string {
  return `${col},${row}`;
}

export function squareName(col: number, row: number): string {
  return `${CHESS_FILES[col] ?? "?"}${CHESS_RANKS[row] ?? "?"}`;
}

export function createChessVariant(variant: ChessVariantId): ChessVariantState {
  if (variant === "amazons") {
    return {
      variant,
      pieces: [
        { id: "white-a2", owner: "white", col: 0, row: 6 },
        { id: "white-e1", owner: "white", col: 4, row: 7 },
        { id: "white-h3", owner: "white", col: 7, row: 5 },
        { id: "black-a6", owner: "black", col: 0, row: 2 },
        { id: "black-d8", owner: "black", col: 3, row: 0 },
        { id: "black-h7", owner: "black", col: 7, row: 1 },
      ],
      arrows: [], destroyed: [], active: "white", phase: "move", selectedId: null, winner: null,
    };
  }
  return {
    variant,
    pieces: [
      { id: "white-knight", owner: "white", col: 0, row: 7 },
      { id: "black-knight", owner: "black", col: 7, row: 0 },
    ],
    arrows: [], destroyed: [], active: "white", phase: "move", selectedId: null, winner: null,
  };
}

function pieceAt(state: ChessVariantState, col: number, row: number): ChessPiece | undefined {
  return state.pieces.find((piece) => piece.col === col && piece.row === row);
}

function blocked(state: ChessVariantState, col: number, row: number): boolean {
  const id = squareId(col, row);
  return state.arrows.includes(id) || state.destroyed.includes(id);
}

function queenMoves(state: ChessVariantState, piece: ChessPiece): string[] {
  const moves: string[] = [];
  const directions: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  for (const [dc, dr] of directions) {
    let col = piece.col + dc;
    let row = piece.row + dr;
    while (col >= 0 && col < 8 && row >= 0 && row < 8 && !blocked(state, col, row) && !pieceAt(state, col, row)) {
      moves.push(squareId(col, row));
      col += dc;
      row += dr;
    }
  }
  return moves;
}

function knightMoves(state: ChessVariantState, piece: ChessPiece): string[] {
  return [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]
    .map(([dc, dr]) => squareId(piece.col + dc!, piece.row + dr!))
    .filter((id) => {
      const [col, row] = id.split(",").map(Number);
      return col! >= 0 && col! < 8 && row! >= 0 && row! < 8 && !blocked(state, col!, row!) && !pieceAt(state, col!, row!);
    });
}

export function legalMoves(state: ChessVariantState, piece: ChessPiece): string[] {
  return state.variant === "amazons" ? queenMoves(state, piece) : knightMoves(state, piece);
}

export function legalArrows(state: ChessVariantState, piece: ChessPiece): string[] {
  if (state.variant !== "amazons") return [];
  const temporary = { ...state, pieces: state.pieces.map((entry) => entry.id === piece.id ? piece : entry) };
  return queenMoves(temporary, piece);
}

export function selectOrMove(state: ChessVariantState, col: number, row: number): ChessVariantState {
  if (state.winner || state.phase !== "move") return state;
  const selected = state.selectedId ? state.pieces.find((piece) => piece.id === state.selectedId) : undefined;
  if (!selected) {
    const clicked = pieceAt(state, col, row);
    return clicked?.owner === state.active ? { ...state, selectedId: clicked.id } : state;
  }
  if (selected.col === col && selected.row === row) return { ...state, selectedId: null };
  const destination = squareId(col, row);
  if (!legalMoves(state, selected).includes(destination)) {
    const clicked = pieceAt(state, col, row);
    return clicked?.owner === state.active ? { ...state, selectedId: clicked.id } : state;
  }

  const pieces = state.pieces.map((piece) => piece.id === selected.id ? { ...piece, col, row } : piece);
  if (state.variant === "amazons") return { ...state, pieces, phase: "shoot", selectedId: selected.id };

  const destroyed = [...state.destroyed, squareId(selected.col, selected.row)];
  const nextActive = opponent(state.active);
  const next = { ...state, pieces, destroyed, active: nextActive, selectedId: null };
  return hasLegalMove(next, nextActive) ? next : { ...next, winner: state.active };
}

export function shootArrow(state: ChessVariantState, col: number, row: number): ChessVariantState {
  if (state.variant !== "amazons" || state.phase !== "shoot" || state.winner) return state;
  const piece = state.pieces.find((entry) => entry.id === state.selectedId);
  if (!piece || !legalArrows(state, piece).includes(squareId(col, row))) return state;
  const arrows = [...state.arrows, squareId(col, row)];
  const nextActive = opponent(state.active);
  const next = { ...state, arrows, active: nextActive, phase: "move" as const, selectedId: null };
  return hasLegalMove(next, nextActive) ? next : { ...next, winner: state.active };
}

function hasLegalMove(state: ChessVariantState, player: ChessPlayer): boolean {
  return state.pieces.some((piece) => piece.owner === player && legalMoves(state, piece).length > 0);
}

function opponent(player: ChessPlayer): ChessPlayer {
  return player === "white" ? "black" : "white";
}
