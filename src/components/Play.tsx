import { useState } from "react";
import { getDefinition } from "../game/codex";
import {
  MAP_COLS,
  MAP_ROWS,
  MAP_TILES,
  PLAYER_LABEL,
  UNIT_LABEL,
  canMoveTo,
  createInitialState,
  endTurn,
  harvestFor,
  moveUnit,
  tileLabel,
  unitAt,
  unitById,
  type MapTile,
  type PlayState,
  type Player,
} from "../game/play";
import { useLocalStorage } from "../lib/useLocalStorage";
import { SectionHeading, Tag, typeColor } from "./ui";
import { ChessVariants } from "./ChessVariants";
import type { ChessVariantId } from "../game/chessVariants";

const HEX_W = 76;
const HEX_H = 88;
const ROW_STEP = HEX_H * 0.75;

const BOARD_W = MAP_COLS * HEX_W + HEX_W / 2;
const BOARD_H = (MAP_ROWS - 1) * ROW_STEP + HEX_H;

const RESOURCE_GLYPH = {
  minerals: "◆",
  gas: "▲",
} as const;

function stockSummary(gained: { minerals: number; gas: number }): string {
  const parts: string[] = [];
  if (gained.minerals > 0) {
    parts.push(`${gained.minerals} mineral${gained.minerals === 1 ? "" : "s"}`);
  }
  if (gained.gas > 0) {
    parts.push(`${gained.gas} gas`);
  }
  return parts.length > 0 ? parts.join(" + ") : "nothing";
}

type PlayMode = "starter" | ChessVariantId;

export function Play() {
  const [mode, setMode] = useState<PlayMode>("starter");
  const modes: { id: PlayMode; label: string }[] = [
    { id: "starter", label: "Starter Skirmish" },
    { id: "amazons", label: "Amazons" },
    { id: "pferdeaeppel", label: "Pferdeäppel" },
  ];

  return (
    <div className="stack">
      <nav className="variant-tabs" aria-label="Choose a game variant">
        {modes.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`variant-tab${mode === entry.id ? " is-active" : ""}`}
            aria-pressed={mode === entry.id}
            onClick={() => setMode(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </nav>
      {mode === "starter" ? <StarterPlay /> : <ChessVariants variant={mode} />}
    </div>
  );
}

function StarterPlay() {
  const [state, setState] = useLocalStorage<PlayState>(
    "mbg.play.state",
    createInitialState(),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = selectedId ? unitById(state, selectedId) : undefined;
  const income = harvestFor(state, state.active);
  const readyUnits = state.units.filter(
    (unit) => unit.owner === state.active && unit.typeId !== "base" && !unit.moved,
  ).length;

  const reset = () => {
    setState(createInitialState());
    setSelectedId(null);
  };

  const onTileClick = (tile: MapTile) => {
    const clicked = unitAt(state, tile.col, tile.row);

    if (clicked && clicked.owner === state.active && !clicked.moved && clicked.typeId !== "base") {
      setSelectedId((current) => (current === clicked.id ? null : clicked.id));
      return;
    }

    if (!selected) return;
    const next = moveUnit(state, selected.id, tile.col, tile.row);
    if (next !== state) {
      setState(next);
      setSelectedId(null);
    }
  };

  const finishTurn = () => {
    setState(endTurn(state));
    setSelectedId(null);
  };

  const status = selected
    ? `${UNIT_LABEL[selected.typeId]} selected — click a highlighted neighbour.`
    : readyUnits > 0
      ? `Select a unit to move. ${readyUnits} ready.`
      : "Every mobile unit has moved. End the turn to harvest and pass play.";

  return (
    <div className="stack">
      <SectionHeading eyebrow="Starter skirmish" title="Play">
        <div className="heading-actions">
          <button className="btn ghost" onClick={reset}>
            Reset map
          </button>
        </div>
      </SectionHeading>

      <div className="play-layout">
        <section className="panel play-board-panel">
          <header className="play-status">
            <div>
              <span className="eyebrow">Round {state.turn}</span>
              <h3 className={`play-owner owner-${state.active}`}>
                {PLAYER_LABEL[state.active]}'s turn
              </h3>
              <p className="muted small">{status}</p>
            </div>
            <Tag tone={state.active === "a" ? "team-a" : "team-b"}>
              {state.active === "a" ? "top edge" : "bottom edge"}
            </Tag>
          </header>

          <div className="hex-board-wrap">
            <div
              className="hex-board"
              style={{
                width: BOARD_W,
                height: BOARD_H,
                ["--hex-w" as string]: `${HEX_W}px`,
                ["--hex-h" as string]: `${HEX_H}px`,
              }}
            >
              {MAP_TILES.map((tile) => {
                const unit = unitAt(state, tile.col, tile.row);
                const movable = selected
                  ? canMoveTo(state, selected, tile.col, tile.row)
                  : false;
                const isSelected = Boolean(unit && selectedId === unit.id);
                const classes = [
                  "hex-tile",
                  tile.resource ? `has-resource resource-${tile.resource}` : "",
                  movable ? "is-move" : "",
                  isSelected ? "is-selected" : "",
                  unit ? `has-unit owner-${unit.owner}` : "",
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <button
                    type="button"
                    key={tile.id}
                    className={classes}
                    style={{
                      left: tile.col * HEX_W + (tile.row % 2 === 1 ? HEX_W / 2 : 0),
                      top: tile.row * ROW_STEP,
                      ["--accent" as string]: unit ? typeColor(unit.typeId) : undefined,
                    }}
                    onClick={() => onTileClick(tile)}
                    aria-label={`${tileLabel(tile.col, tile.row)}${tile.resource ? `, ${tile.resource}` : ""}${
                      unit ? `, ${PLAYER_LABEL[unit.owner]} ${UNIT_LABEL[unit.typeId]}` : ""
                    }`}
                  >
                    <span className="hex-face">
                      {tile.resource && (
                        <span className={`hex-resource ${tile.resource}`} aria-hidden="true">
                          {RESOURCE_GLYPH[tile.resource]}
                        </span>
                      )}
                      {unit && (
                        <span
                          className={`hex-unit owner-${unit.owner}${unit.moved ? " is-moved" : ""}`}
                        >
                          <span className="hex-unit-glyph" aria-hidden="true">
                            {getDefinition(unit.typeId).glyph}
                          </span>
                          <span className="hex-unit-name">{UNIT_LABEL[unit.typeId]}</span>
                        </span>
                      )}
                      <span className="hex-coord" aria-hidden="true">
                        {tileLabel(tile.col, tile.row)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="play-actions">
            <span className="muted small">
              Ending the turn collects <strong>{stockSummary(income)}</strong>.
            </span>
            <button className="btn primary" onClick={finishTurn}>
              End {PLAYER_LABEL[state.active]}'s turn
            </button>
          </div>
        </section>

        <aside className="stack play-aside">
          <section className="panel">
            <div className="panel-head">
              <h3>Resources</h3>
              <span className="muted small">harvested</span>
            </div>
            <div className="play-stock-grid">
              {(["a", "b"] as Player[]).map((player) => (
                <div key={player} className={`play-stock owner-${player}`}>
                  <span className="eyebrow">{PLAYER_LABEL[player]}</span>
                  <div className="play-stock-row">
                    <span className="play-stock-symbol minerals" aria-hidden="true">
                      ◆
                    </span>
                    <span className="play-stock-value">{state.stock[player].minerals}</span>
                    <span className="play-stock-label">minerals</span>
                  </div>
                  <div className="play-stock-row">
                    <span className="play-stock-symbol gas" aria-hidden="true">
                      ▲
                    </span>
                    <span className="play-stock-value">{state.stock[player].gas}</span>
                    <span className="play-stock-label">gas</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h3>Log</h3>
              <span className="muted small">last moves</span>
            </div>
            <ol className="play-log">
              {state.log
                .slice()
                .reverse()
                .map((line, index) => (
                  <li key={`${line}-${index}`}>{line}</li>
                ))}
            </ol>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h3>How to play</h3>
            </div>
            <ul className="play-help">
              <li>Select a Worker or Soldier, then click a highlighted neighbouring hex.</li>
              <li>Each unit moves once per turn. Bases hold their edge.</li>
              <li>
                End the turn to harvest: every Worker standing on a ◆ mineral or ▲ gas
                node adds 1 to your stock.
              </li>
              <li>
                Resources are the score for now. Combat, building and income spending
                come later.
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}


