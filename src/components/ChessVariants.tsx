import { useMemo } from "react";
import {
  CHESS_FILES,
  CHESS_RANKS,
  createChessVariant,
  legalArrows,
  legalMoves,
  selectOrMove,
  shootArrow,
  squareId,
  squareName,
  type ChessPlayer,
  type ChessVariantId,
  type ChessVariantState,
} from "../game/chessVariants";
import { useLocalStorage } from "../lib/useLocalStorage";
import { SectionHeading, Tag } from "./ui";

const PLAYER_NAME: Record<ChessPlayer, string> = { white: "White", black: "Black" };

export function ChessVariants({ variant }: { variant: ChessVariantId }) {
  const [state, setState] = useLocalStorage<ChessVariantState>(
    `mbg.chess.${variant}`,
    createChessVariant(variant),
  );
  const selected = state.pieces.find((piece) => piece.id === state.selectedId);
  const legal = useMemo(() => {
    if (!selected || state.winner) return [];
    return state.phase === "move" ? legalMoves(state, selected) : legalArrows(state, selected);
  }, [selected, state]);
  const legalSet = new Set(legal);
  const currentVariant = state.variant === variant ? state : createChessVariant(variant);

  const reset = () => setState(createChessVariant(variant));
  const clickSquare = (col: number, row: number) => {
    setState((current) => {
      const compatible = current.variant === variant ? current : createChessVariant(variant);
      return compatible.phase === "shoot"
        ? shootArrow(compatible, col, row)
        : selectOrMove(compatible, col, row);
    });
  };

  const phaseText = variant === "amazons"
    ? currentVariant.phase === "move"
      ? "Move one queen, then shoot an arrow."
      : "Choose an empty square for the arrow."
    : "Move your knight to an unmarked square.";

  return (
    <div className="stack">
      <SectionHeading
        eyebrow="Chess variant"
        title={variant === "amazons" ? "Amazons" : "Pferdeäppel"}
      >
        <div className="heading-actions">
          {currentVariant.winner ? (
            <Tag tone={currentVariant.winner === "white" ? "team-a" : "team-b"}>
              {PLAYER_NAME[currentVariant.winner]} wins
            </Tag>
          ) : (
            <Tag tone={currentVariant.active === "white" ? "team-a" : "team-b"}>
              {PLAYER_NAME[currentVariant.active]} to move
            </Tag>
          )}
          <button className="btn ghost" onClick={reset}>Reset game</button>
        </div>
      </SectionHeading>

      <div className="variant-layout">
        <section className="panel variant-board-panel">
          <div className="variant-status">
            <span className="eyebrow">
              {currentVariant.winner ? `${PLAYER_NAME[currentVariant.winner]} wins` : `${PLAYER_NAME[currentVariant.active]}'s turn`}
            </span>
            <p className="muted small">{currentVariant.winner ? "The other player has no legal move." : phaseText}</p>
          </div>
          <div className="chess-board" role="grid" aria-label={`${variant} chessboard`}>
            {CHESS_RANKS.split("").flatMap((rank, row) =>
              CHESS_FILES.split("").map((file, col) => {
                const id = squareId(col, row);
                const piece = currentVariant.pieces.find((entry) => entry.col === col && entry.row === row);
                const isArrow = currentVariant.arrows.includes(id);
                const isDestroyed = currentVariant.destroyed.includes(id);
                const isSelected = piece?.id === currentVariant.selectedId;
                const isLegal = legalSet.has(id);
                const marker = isArrow ? "🏹🔥" : isDestroyed ? "💩" : piece
                  ? variant === "amazons"
                    ? piece.owner === "white" ? "♕" : "♛"
                    : piece.owner === "white" ? "♘" : "♞"
                  : null;
                return (
                  <button
                    key={id}
                    type="button"
                    role="gridcell"
                    aria-label={`${squareName(col, row)}${piece ? `, ${PLAYER_NAME[piece.owner]} ${variant === "amazons" ? "Amazon" : "knight"}` : isArrow ? ", blocked by a flaming arrow" : isDestroyed ? ", destroyed" : ""}${isLegal ? ", legal destination" : ""}`}
                    className={`chess-square ${(row + col) % 2 === 0 ? "is-light" : "is-dark"}${piece ? ` has-piece owner-${piece.owner}` : ""}${isSelected ? " is-selected" : ""}${isLegal ? (currentVariant.phase === "shoot" ? " is-arrow-target" : " is-legal") : ""}${isArrow ? " is-arrow" : ""}${isDestroyed ? " is-destroyed" : ""}`}
                    onClick={() => clickSquare(col, row)}
                    disabled={Boolean(currentVariant.winner)}
                  >
                    {col === 0 && <span className="chess-rank-label">{rank}</span>}
                    {row === 7 && <span className="chess-file-label">{file}</span>}
                    {marker && <span className={`chess-piece${isArrow ? " arrow-piece" : ""}${isDestroyed ? " destroyed-piece" : ""}`}>{marker}</span>}
                    {isLegal && !piece && !isArrow && !isDestroyed && <span className="legal-dot" />}
                  </button>
                );
              }),
            )}
          </div>
        </section>

        <aside className="panel variant-rules">
          <div className="panel-head"><h3>How to play</h3></div>
          {variant === "amazons" ? (
            <ul className="play-help">
              <li>White starts with queens on a2, e1, and h3. Black starts on a6, d8, and h7.</li>
              <li>Move a queen any distance along a clear rank, file, or diagonal. Queens cannot capture.</li>
              <li>After moving, shoot an arrow along a clear queen line to an empty square. Arrows block that square permanently.</li>
              <li>Queens and arrows cannot pass through queens, arrows, or destroyed squares. The first player with no legal queen move loses.</li>
            </ul>
          ) : (
            <ul className="play-help">
              <li>White starts at a1 and Black at h8, opposite corners.</li>
              <li>Move like a normal knight. The knights cannot capture each other.</li>
              <li>The square a knight leaves is destroyed and cannot be used again.</li>
              <li>A knight may jump over marked squares. The first player with no legal move loses.</li>
            </ul>
          )}
          <div className="variant-legend">
            {variant === "amazons" ? <><span>🏹🔥 Flaming arrow · blocked</span><span>♕ / ♛ Amazon queens</span></> : <><span>💩 Destroyed square</span><span>♘ / ♞ Knights</span></>}
          </div>
        </aside>
      </div>
    </div>
  );
}
