import { useEffect, useRef, useState } from "react";
import { getDefinition } from "../game/codex";
import {
  MAP_COLS,
  MAP_ROWS,
  MAP_TILES,
  PLAYER_LABEL,
  UNIT_LABEL,
  canMoveTo,
  canUnitMoveTo,
  createInitialState,
  endTurn,
  harvestFor,
  hexId,
  moveUnit,
  otherPlayer,
  resolveRound,
  tileLabel,
  unitAt,
  unitById,
  type MapTile,
  type PlayMove,
  type PlayState,
  type PlayUnit,
  type Player,
} from "../game/play";
import {
  CODE_LENGTH,
  hostMatch,
  joinMatch,
  normalizeCode,
  type MatchHandle,
} from "../lib/match";
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

/**
 * The Play tab opens on a matching screen. Hosting reserves a short code;
 * joining connects to that code and hands the board to both players. The
 * local hotseat games from earlier versions are still reachable through
 * "Practice locally".
 */
export function Play() {
  const [practice, setPractice] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (practice) {
    return <PracticePlay onBack={() => setPractice(false)} />;
  }

  return (
    <MatchFlow
      notice={notice}
      onNotice={setNotice}
      onPractice={() => setPractice(true)}
    />
  );
}

function MatchFlow({
  notice,
  onNotice,
  onPractice,
}: {
  notice: string | null;
  onNotice: (notice: string | null) => void;
  onPractice: () => void;
}) {
  const [match, setMatch] = useState<MatchHandle | null>(null);
  const [state, setState] = useState<PlayState | null>(null);
  const [hostCode, setHostCode] = useState<string | null>(null);
  const [busy, setBusy] = useState<"host" | "join" | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [opponentReady, setOpponentReady] = useState(false);

  const matchRef = useRef<MatchHandle | null>(null);
  const stateRef = useRef<PlayState | null>(null);
  const pendingRef = useRef<{ a: PlayMove[] | null; b: PlayMove[] | null }>({
    a: null,
    b: null,
  });

  const rememberState = (next: PlayState | null) => {
    if (!next || next.turn !== stateRef.current?.turn) {
      pendingRef.current = { a: null, b: null };
      setOpponentReady(false);
    }
    stateRef.current = next;
    setState(next);
  };

  const resolveIfReady = (handle: MatchHandle) => {
    const current = stateRef.current;
    const pending = pendingRef.current;
    if (!current || !pending.a || !pending.b) return;

    const next = resolveRound(current, { a: pending.a, b: pending.b });
    pendingRef.current = { a: null, b: null };
    rememberState(next);
    handle.send({ kind: "state", state: next });
  };

  const submitMoves = (moves: PlayMove[]) => {
    const handle = matchRef.current;
    if (!handle) return;

    if (handle.role === "host") {
      pendingRef.current.a = moves;
      // Let the guest know the host is waiting on them. If the guest submitted
      // first, the round resolves right away instead.
      if (!pendingRef.current.b) handle.send({ kind: "ready", player: "a" });
      resolveIfReady(handle);
      return;
    }

    handle.send({ kind: "action", action: { type: "submit", moves } });
  };

  const finish = (reason: string, leaveDelay = 0) => {
    const current = matchRef.current;
    matchRef.current = null;
    if (current) {
      // The match is over locally; late transport events must not overwrite
      // the result (for example "opponent left" after a forfeit).
      current.onPaired = null;
      current.onState = null;
      current.onMessage = null;
      current.onEnd = null;
      current.onError = null;
    }
    rememberState(null);
    setMatch(null);
    setHostCode(null);
    setBusy(null);
    onNotice(reason);

    if (leaveDelay > 0) {
      window.setTimeout(() => current?.leave(), leaveDelay);
    } else {
      current?.leave();
    }
  };

  useEffect(
    () => () => {
      matchRef.current?.leave();
    },
    [],
  );

  const host = async () => {
    setError(null);
    onNotice(null);
    setBusy("host");
    setHostCode(null);

    try {
      const handle = await hostMatch(createInitialState());
      matchRef.current = handle;
      setHostCode(handle.code);

      handle.onPaired = () => {
        if (handle.startState) rememberState(handle.startState);
        setBusy(null);
        setMatch(handle);
      };
      handle.onState = (next) => rememberState(next);
      handle.onMessage = (message) => {
        if (message.kind !== "action" || message.action.type !== "submit") return;
        pendingRef.current.b = message.action.moves;
        setOpponentReady(true);
        resolveIfReady(handle);
      };
      handle.onEnd = (reason) => finish(reason);
      handle.onError = (message) => setError(message);
    } catch (err) {
      setBusy(null);
      setError(err instanceof Error ? err.message : "Could not host a game.");
    }
  };

  const cancelHost = () => {
    const current = matchRef.current;
    matchRef.current = null;
    current?.leave();
    setHostCode(null);
    setBusy(null);
  };

  const join = async (event: React.FormEvent) => {
    event.preventDefault();
    const code = normalizeCode(joinCode);
    if (code.length !== CODE_LENGTH) {
      setError(`Enter the full ${CODE_LENGTH}-character game code.`);
      return;
    }

    setError(null);
    onNotice(null);
    setBusy("join");

    try {
      const handle = await joinMatch(code);
      matchRef.current = handle;
      handle.onState = (next) => {
        rememberState(next);
        setBusy(null);
        setMatch(handle);
      };
      handle.onMessage = (message) => {
        if (message.kind === "ready") setOpponentReady(true);
      };
      handle.onEnd = (reason) => finish(reason);
      handle.onError = (message) => setError(message);

      // A fast host can send the welcome before the callbacks above exist.
      if (handle.lastState) {
        rememberState(handle.lastState);
        setBusy(null);
        setMatch(handle);
      }
    } catch (err) {
      setBusy(null);
      setError(err instanceof Error ? err.message : "Could not join that game.");
    }
  };

  if (match && state) {
    return (
      <OnlineStarter
        match={match}
        state={state}
        opponentReady={opponentReady}
        onSubmit={submitMoves}
        onFinish={finish}
      />
    );
  }

  return (
    <div className="stack">
      <SectionHeading eyebrow="Two-player skirmish" title="Play">
        <Tag>{match ? "connected" : "matchmaking"}</Tag>
      </SectionHeading>

      <section className="panel match-panel">
        <div className="match-hero">
          <span className="eyebrow">Host or join</span>
          <h2>Get both players on the same board</h2>
          <p className="muted">
            One player hosts a game and shares the five-character code. The other
            enters that code to join. The board opens for both of you as soon as
            you are paired.
          </p>
        </div>

        {notice && (
          <p className="match-notice" role="status">
            {notice}
          </p>
        )}

        <div className="match-grid">
          <div className="match-card">
            <h3>Host Game</h3>
            <p className="muted small">
              Create a room together, then send the code to your opponent.
            </p>
            {hostCode ? (
              <div className="match-waiting">
                <span className="match-code" aria-label={`Game code ${hostCode}`}>
                  {hostCode}
                </span>
                <span className="muted small">Waiting for your opponent…</span>
                <button className="btn ghost" type="button" onClick={cancelHost}>
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className="btn primary"
                type="button"
                onClick={host}
                disabled={busy !== null}
              >
                {busy === "host" ? "Creating room…" : "Host Game"}
              </button>
            )}
          </div>

          <div className="match-card">
            <h3>Join Game</h3>
            <p className="muted small">Enter the code the host gave you.</p>
            <form className="match-join" onSubmit={join}>
              <input
                className="match-code-input"
                value={joinCode}
                onChange={(event) => setJoinCode(normalizeCode(event.target.value))}
                placeholder="CODE"
                aria-label="Game code"
                maxLength={CODE_LENGTH}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
              />
              <button
                className="btn"
                type="submit"
                disabled={
                  busy !== null || normalizeCode(joinCode).length !== CODE_LENGTH
                }
              >
                {busy === "join" ? "Joining…" : "Join Game"}
              </button>
            </form>
          </div>
        </div>

        {error && (
          <p className="match-error" role="alert">
            {error}
          </p>
        )}

        <div className="match-footer">
          <span className="muted small">
            Paired players connect directly. Tabs in this browser pair locally.
          </span>
          <button className="btn ghost" type="button" onClick={onPractice}>
            Practice locally
          </button>
        </div>
      </section>
    </div>
  );
}

function OnlineStarter({
  match,
  state,
  opponentReady,
  onSubmit,
  onFinish,
}: {
  match: MatchHandle;
  state: PlayState;
  opponentReady: boolean;
  onSubmit: (moves: PlayMove[]) => void;
  onFinish: (reason: string, leaveDelay?: number) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PlayMove[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const me = match.player;
  const opponent = otherPlayer(me);
  const selected = selectedId ? unitById(state, selectedId) : undefined;
  const orders = draft
    .map((move) => ({ move, unit: unitById(state, move.unitId) }))
    .filter(
      (entry): entry is { move: PlayMove; unit: PlayUnit } =>
        entry.unit !== undefined,
    );

  // A new round means both plans resolved; clear the local submission.
  useEffect(() => {
    setSelectedId(null);
    setDraft([]);
    setSubmitted(false);
  }, [state.turn]);

  const removeOrder = (unitId: string) => {
    setDraft((current) => current.filter((move) => move.unitId !== unitId));
  };

  const onTileClick = (tile: MapTile) => {
    if (submitted) return;

    const clicked = unitAt(state, tile.col, tile.row);
    if (clicked && clicked.owner === me && clicked.typeId !== "base") {
      setSelectedId((current) => (current === clicked.id ? null : clicked.id));
      return;
    }

    if (!selected) return;
    if (!canUnitMoveTo(state, selected, tile.col, tile.row)) return;

    const target = hexId(tile.col, tile.row);
    const takenByAlly = draft.some(
      (move) => move.unitId !== selected.id && hexId(move.col, move.row) === target,
    );
    if (takenByAlly) return;

    setDraft((current) => [
      ...current.filter((move) => move.unitId !== selected.id),
      { unitId: selected.id, col: tile.col, row: tile.row },
    ]);
    setSelectedId(null);
  };

  const submit = () => {
    if (submitted) return;
    setSubmitted(true);
    setSelectedId(null);
    onSubmit(draft);
  };

  const forfeit = () => {
    const winner = otherPlayer(me);
    match.send({ kind: "forfeit", player: me });
    onFinish(
      `${PLAYER_LABEL[me]} forfeited. ${PLAYER_LABEL[winner]} wins.`,
      250,
    );
  };

  const status = submitted
    ? `Orders submitted. Waiting for ${PLAYER_LABEL[opponent]}…`
    : opponentReady
      ? `${PLAYER_LABEL[opponent]} has submitted. Send your orders when ready.`
      : selected
        ? `${UNIT_LABEL[selected.typeId]} selected — click a highlighted neighbour.`
        : orders.length > 0
          ? `${orders.length} order${orders.length === 1 ? "" : "s"} queued. Submit when ready.`
          : "Select a unit, then click a highlighted neighbouring hex to queue a move.";

  return (
    <div className="stack">
      <SectionHeading eyebrow={`Online match · ${match.code}`} title="Play">
        <div className="heading-actions">
          <Tag tone={me === "a" ? "team-a" : "team-b"}>
            You are {PLAYER_LABEL[me]}
          </Tag>
          <Tag>{me === "a" ? "top edge" : "bottom edge"}</Tag>
        </div>
      </SectionHeading>

      <div className="play-layout">
        <section className="panel play-board-panel">
          <header className="play-status">
            <div>
              <span className="eyebrow">Round {state.turn} · simultaneous</span>
              <h3 className={`play-owner owner-${me}`}>
                {submitted ? "Orders locked" : "Plan your moves"}
              </h3>
              <p className="muted small">{status}</p>
            </div>
            <div className="play-status-tags">
              <Tag tone={me === "a" ? "team-a" : "team-b"}>
                {submitted ? "you submitted" : "you are planning"}
              </Tag>
              {opponentReady && !submitted && (
                <Tag tone={opponent === "a" ? "team-a" : "team-b"}>
                  {PLAYER_LABEL[opponent]} submitted
                </Tag>
              )}
            </div>
          </header>

          <StarterBoard
            state={state}
            selectedId={selectedId}
            onTileClick={onTileClick}
            draft={draft}
            disabled={submitted}
            canReach={(unit, col, row) => {
              if (
                draft.some(
                  (move) =>
                    move.unitId !== unit.id &&
                    move.col === col &&
                    move.row === row,
                )
              ) {
                return false;
              }
              return canUnitMoveTo(state, unit, col, row);
            }}
          />

          <div className="play-actions">
            <span className="muted small">
              {orders.length > 0
                ? `${orders.length} order${orders.length === 1 ? "" : "s"} queued. Workers harvest when both players submit.`
                : "Queue one move per unit, then submit. Workers harvest when the round resolves."}
            </span>
            <div className="play-action-buttons">
              <button className="btn danger" type="button" onClick={forfeit}>
                Forfeit
              </button>
              <button
                className="btn primary"
                type="button"
                onClick={submit}
                disabled={submitted}
              >
                {submitted ? "Submitted" : "Submit"}
              </button>
            </div>
          </div>
        </section>

        <aside className="stack play-aside">
          <PlayStocks state={state} />
          <section className="panel">
            <div className="panel-head">
              <h3>Orders</h3>
              <span className="muted small">{orders.length} queued</span>
            </div>
            {orders.length === 0 ? (
              <p className="muted small">
                No moves queued. You can submit to hold position.
              </p>
            ) : (
              <ul className="play-orders">
                {orders.map(({ move, unit }) => (
                  <li key={unit.id} className={`play-order owner-${unit.owner}`}>
                    <span className="play-order-move">
                      <strong>{UNIT_LABEL[unit.typeId]}</strong>{" "}
                      {tileLabel(unit.col, unit.row)} → {tileLabel(move.col, move.row)}
                    </span>
                    <button
                      className="play-order-remove"
                      type="button"
                      onClick={() => removeOrder(unit.id)}
                      disabled={submitted}
                      aria-label={`Remove order for ${UNIT_LABEL[unit.typeId]} at ${tileLabel(unit.col, unit.row)}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <PlayLog state={state} />
          <section className="panel">
            <div className="panel-head">
              <h3>Online match</h3>
              <span className="muted small">code {match.code}</span>
            </div>
            <ul className="play-help">
              <li>Both players plan at the same time.</li>
              <li>
                Select each Worker or Soldier and click an adjacent empty hex. Each
                unit can make one move per round.
              </li>
              <li>
                Submit your orders. When both players have submitted, every unit
                moves at once and Workers harvest.
              </li>
              <li>
                If both players enter the same hex, both of those moves are
                cancelled.
              </li>
              <li>
                Forfeit declares {PLAYER_LABEL[opponent]} the winner and returns
                both players to the matching screen.
              </li>
              <li>If the connection drops, the tab returns to matchmaking.</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

function StarterBoard({
  state,
  selectedId,
  onTileClick,
  canReach,
  draft = [],
  disabled = false,
}: {
  state: PlayState;
  selectedId: string | null;
  onTileClick: (tile: MapTile) => void;
  canReach: (unit: PlayUnit, col: number, row: number) => boolean;
  draft?: PlayMove[];
  disabled?: boolean;
}) {
  const selected = selectedId ? unitById(state, selectedId) : undefined;

  return (
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
          const movable =
            selected && !disabled
              ? canReach(selected, tile.col, tile.row)
              : false;
          const isSelected = Boolean(unit && selectedId === unit.id);
          const draftTarget = draft.find(
            (move) => move.col === tile.col && move.row === tile.row,
          );
          const draftUnit = draftTarget
            ? unitById(state, draftTarget.unitId)
            : undefined;
          const draftSource = unit
            ? draft.find((move) => move.unitId === unit.id)
            : undefined;
          const classes = [
            "hex-tile",
            tile.resource ? `has-resource resource-${tile.resource}` : "",
            movable ? "is-move" : "",
            isSelected ? "is-selected" : "",
            unit ? `has-unit owner-${unit.owner}` : "",
            draftTarget ? "is-draft-target" : "",
            draftSource ? "is-draft-source" : "",
            disabled ? "is-locked" : "",
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
              }${draftTarget ? `, queued move to ${tileLabel(tile.col, tile.row)}` : ""}`}
            >
              <span className="hex-face">
                {tile.resource && (
                  <span className={`hex-resource ${tile.resource}`} aria-hidden="true">
                    {RESOURCE_GLYPH[tile.resource]}
                  </span>
                )}
                {unit && (
                  <span
                    className={`hex-unit owner-${unit.owner}${unit.moved ? " is-moved" : ""}${draftSource ? " is-queued" : ""}`}
                  >
                    <span className="hex-unit-glyph" aria-hidden="true">
                      {getDefinition(unit.typeId).glyph}
                    </span>
                    <span className="hex-unit-name">{UNIT_LABEL[unit.typeId]}</span>
                  </span>
                )}
                {draftTarget && draftUnit && (
                  <span
                    className={`hex-draft-marker owner-${draftUnit.owner}`}
                    aria-hidden="true"
                  >
                    →
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
  );
}

function PlayStocks({ state }: { state: PlayState }) {
  return (
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
  );
}

function PlayLog({ state }: { state: PlayState }) {
  return (
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
  );
}

function PracticePlay({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<PlayMode>("starter");
  const modes: { id: PlayMode; label: string }[] = [
    { id: "starter", label: "Starter Skirmish" },
    { id: "amazons", label: "Amazons" },
    { id: "pferdeaeppel", label: "Pferdeäppel" },
  ];

  return (
    <div className="stack">
      <div className="practice-bar">
        <span className="eyebrow">Practice locally</span>
        <button className="btn ghost" type="button" onClick={onBack}>
          Back to matchmaking
        </button>
      </div>
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

          <StarterBoard
            state={state}
            selectedId={selectedId}
            onTileClick={onTileClick}
            canReach={(unit, col, row) => canMoveTo(state, unit, col, row)}
          />

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
          <PlayStocks state={state} />
          <PlayLog state={state} />
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
