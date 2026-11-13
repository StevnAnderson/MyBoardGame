import { useMemo, useState } from "react";
import {
  damageProfile,
  resolveBattle,
  totalHp,
  unitCount,
  type BandLog,
  type BattleResult,
  type SideDamage,
} from "../game/battle";
import { createCard } from "../game/cards";
import { getDefinition } from "../game/codex";
import type { Card, Team } from "../game/types";
import { useLocalStorage } from "../lib/useLocalStorage";
import {
  Glyph,
  RANGE_NAME,
  SectionHeading,
  Tag,
  typeColor,
} from "./ui";

const UNIT_IDS = ["worker", "soldier", "walker", "artillery"];
const STRUCTURE_IDS = ["base", "refinery", "barracks", "factory"];

const PRESET_A = ["walker", "walker", "artillery", "artillery"];
const PRESET_B = [
  "worker",
  "worker",
  "worker",
  "soldier",
  "soldier",
  "soldier",
  "walker",
  "walker",
];

export function BattleLab() {
  const [armyA, setArmyA] = useLocalStorage<Card[]>("mbg.army.a", []);
  const [armyB, setArmyB] = useLocalStorage<Card[]>("mbg.army.b", []);
  const [retreatA, setRetreatA] = useLocalStorage("mbg.retreat.a", true);
  const [retreatB, setRetreatB] = useLocalStorage("mbg.retreat.b", true);
  const [result, setResult] = useState<BattleResult | null>(null);

  const updateA = (next: (cards: Card[]) => Card[]) => {
    setArmyA(next);
    setResult(null);
  };
  const updateB = (next: (cards: Card[]) => Card[]) => {
    setArmyB(next);
    setResult(null);
  };

  const outnumber = useMemo(() => previewOutnumber(armyA, armyB), [armyA, armyB]);
  const canResolve = armyA.length > 0 && armyB.length > 0;

  return (
    <div className="stack">
      <SectionHeading eyebrow="Playtest tool" title="Battle Lab">
        <div className="heading-actions">
          <button
            className="btn ghost"
            onClick={() => {
              setArmyA(PRESET_A.map((typeId) => createCard(typeId)));
              setArmyB(PRESET_B.map((typeId) => createCard(typeId)));
              setResult(null);
            }}
          >
            Load rules example
          </button>
          <button
            className="btn ghost"
            onClick={() => {
              setArmyA([]);
              setArmyB([]);
              setResult(null);
            }}
          >
            Clear
          </button>
        </div>
      </SectionHeading>

      <div className="battle-grid">
        <ArmyPanel
          team="a"
          title="Army A"
          cards={armyA}
          onChange={updateA}
          hasRetreatHex={retreatA}
          onRetreatHexChange={(value) => {
            setRetreatA(value);
            setResult(null);
          }}
        />
        <ArmyPanel
          team="b"
          title="Army B"
          cards={armyB}
          onChange={updateB}
          hasRetreatHex={retreatB}
          onRetreatHexChange={(value) => {
            setRetreatB(value);
            setResult(null);
          }}
        />
      </div>

      <div className="resolve-bar">
        <div className="resolve-info">
          {outnumber ? (
            <span className="outnumber-preview">
              <strong>{outnumber.source === "a" ? "Army A" : "Army B"}</strong> outnumbers{` `}
              {outnumber.source === "a" ? "Army B" : "Army A"} and deals{" "}
              <strong>{outnumber.amount}</strong> damage before the loop.
            </span>
          ) : (
            <span className="muted small">
              No outnumber bonus. Damage resolves long → mid → melee, simultaneously.
            </span>
          )}
        </div>
        <button
          className="btn primary"
          disabled={!canResolve}
          onClick={() =>
            setResult(
              resolveBattle({
                a: { label: "Army A", cards: armyA, hasRetreatHex: retreatA },
                b: { label: "Army B", cards: armyB, hasRetreatHex: retreatB },
              }),
            )
          }
        >
          Resolve battle
        </button>
      </div>

      {result ? (
        <ResultPanel result={result} />
      ) : (
        <div className="empty-state">
          <span className="empty-glyph" aria-hidden="true">
            ⚔
          </span>
          <p>
            Build two armies, then resolve. Mark units as retreating to see how a rout
            plays out.
          </p>
        </div>
      )}
    </div>
  );
}

interface ArmyPanelProps {
  team: Team;
  title: string;
  cards: Card[];
  onChange: (next: (cards: Card[]) => Card[]) => void;
  hasRetreatHex: boolean;
  onRetreatHexChange: (value: boolean) => void;
}

function ArmyPanel({
  team,
  title,
  cards,
  onChange,
  hasRetreatHex,
  onRetreatHexChange,
}: ArmyPanelProps) {
  const units = unitCount(cards);
  const hp = totalHp(cards);
  const profile = damageProfile(cards);

  const add = (typeId: string) => onChange((current) => [...current, createCard(typeId)]);
  const remove = (uid: string) => onChange((current) => current.filter((c) => c.uid !== uid));
  const setHp = (uid: string, delta: number) =>
    onChange((current) =>
      current.map((card) => {
        if (card.uid !== uid) return card;
        const max = getDefinition(card.typeId).hp;
        return { ...card, hp: Math.min(max, Math.max(1, card.hp + delta)) };
      }),
    );
  const toggleRetreat = (uid: string) =>
    onChange((current) =>
      current.map((card) =>
        card.uid === uid ? { ...card, retreating: !card.retreating } : card,
      ),
    );

  return (
    <section className={`panel army-panel team-${team}`}>
      <header className="army-head">
        <h3>{title}</h3>
        <div className="army-totals">
          <Tag tone={team === "a" ? "team-a" : "team-b"}>{units} units</Tag>
          <Tag>{hp} HP</Tag>
        </div>
      </header>

      <div className="profile-row">
        {(["long", "mid", "melee"] as const).map((band) => (
          <div key={band} className={`profile-cell range-${band}`}>
            <span className="profile-band">{RANGE_NAME[band]}</span>
            <span className="profile-value">{profile[band]}</span>
          </div>
        ))}
      </div>

      {cards.length === 0 ? (
        <p className="muted small army-empty">No cards yet — add some below.</p>
      ) : (
        <ul className="unit-list">
          {cards.map((card, index) => (
            <UnitRow
              key={card.uid}
              card={card}
              index={index}
              onRemove={() => remove(card.uid)}
              onStep={(delta) => setHp(card.uid, delta)}
              onToggleRetreat={() => toggleRetreat(card.uid)}
            />
          ))}
        </ul>
      )}

      <div className="add-strip">
        <span className="muted small">Add unit</span>
        <div className="chip-row">
          {UNIT_IDS.map((typeId) => (
            <AddChip
              key={typeId}
              typeId={typeId}
              used={cards.filter((card) => card.typeId === typeId).length}
              onAdd={() => add(typeId)}
            />
          ))}
        </div>
        <span className="muted small">Add structure</span>
        <div className="chip-row">
          {STRUCTURE_IDS.map((typeId) => (
            <AddChip
              key={typeId}
              typeId={typeId}
              used={cards.filter((card) => card.typeId === typeId).length}
              onAdd={() => add(typeId)}
            />
          ))}
        </div>
      </div>

      <label className="toggle-line">
        <input
          type="checkbox"
          checked={hasRetreatHex}
          onChange={(event) => onRetreatHexChange(event.target.checked)}
        />
        <span>
          Has a legal retreat hex
          <span className="muted small">
            {" "}
            — uncheck to see units forced to turn upright and fight
          </span>
        </span>
      </label>
    </section>
  );
}

function AddChip({
  typeId,
  used,
  onAdd,
}: {
  typeId: string;
  used: number;
  onAdd: () => void;
}) {
  const definition = getDefinition(typeId);
  const atLimit = used >= definition.supply;
  return (
    <button
      className="chip"
      onClick={onAdd}
      disabled={atLimit}
      style={{ ["--accent" as string]: typeColor(typeId) }}
      title={`${definition.name} — ${definition.cost.minerals} minerals${
        definition.cost.gas ? `, ${definition.cost.gas} gas` : ""
      } · ${used} of ${definition.supply} in play`}
    >
      <span aria-hidden="true">{definition.glyph}</span>
      {definition.name}
      <span className="chip-count">
        {used}/{definition.supply}
      </span>
    </button>
  );
}

function UnitRow({
  card,
  index,
  onRemove,
  onStep,
  onToggleRetreat,
}: {
  card: Card;
  index: number;
  onRemove: () => void;
  onStep: (delta: number) => void;
  onToggleRetreat: () => void;
}) {
  const definition = getDefinition(card.typeId);
  const isUnit = definition.kind === "unit";
  const wounded = card.hp < definition.hp;

  return (
    <li
      className={`unit-row${card.retreating ? " is-retreating" : ""}`}
      style={{ ["--accent" as string]: typeColor(card.typeId) }}
    >
      <span className="unit-index">{index + 1}</span>
      <Glyph typeId={card.typeId} size="sm" />
      <div className="unit-main">
        <span className="unit-name">{definition.name}</span>
        <span className="unit-sub">
          {isUnit ? `${definition.damage} dmg · ${RANGE_NAME[definition.range!]}` : "structure"}
          {card.retreating && " · retreating"}
        </span>
      </div>
      <div className={`hp-stepper${wounded ? " wounded" : ""}`}>
        <button onClick={() => onStep(-1)} aria-label="Lose one HP">
          −
        </button>
        <span className="hp-value">{card.hp}</span>
        <span className="hp-max">/{definition.hp}</span>
        <button onClick={() => onStep(1)} aria-label="Regain one HP">
          +
        </button>
      </div>
      {isUnit ? (
        <button
          className={`icon-btn${card.retreating ? " active" : ""}`}
          onClick={onToggleRetreat}
          title={card.retreating ? "Not retreating" : "Mark retreating"}
          aria-pressed={card.retreating}
        >
          ↩
        </button>
      ) : (
        <span className="icon-btn placeholder" aria-hidden="true" />
      )}
      <button className="icon-btn danger" onClick={onRemove} title="Remove card">
        ✕
      </button>
    </li>
  );
}

function ResultPanel({ result }: { result: BattleResult }) {
  const winnerText =
    result.winner === "draw"
      ? "Draw"
      : result.winner === "a"
        ? "Army A wins"
        : "Army B wins";

  const loops = result.rounds.filter((round) => round.index > 0).length;

  return (
    <section className={`panel result-panel winner-${result.winner}`}>
      <header className="result-head">
        <div>
          <span className="eyebrow">Result</span>
          <h3>{winnerText}</h3>
          <p className="muted">{result.reason}</p>
        </div>
        <div className="result-meta">
          <Tag>
            {loops} damage loop{loops === 1 ? "" : "s"}
          </Tag>
          <Tag>
            {result.startingUnits.a} vs {result.startingUnits.b} units
          </Tag>
        </div>
      </header>

      {result.outnumber && (
        <div className="outnumber-banner">
          <span className="outnumber-title">Outnumber damage</span>
          <span>
            {result.outnumber.source === "a" ? "Army A" : "Army B"} deals{" "}
            <strong>{result.outnumber.total}</strong> to{" "}
            {result.outnumber.team === "a" ? "Army A" : "Army B"} before the loop.
          </span>
          <ApplicationList
            side={{
              team: result.outnumber.team,
              total: result.outnumber.total,
              applications: result.outnumber.applications,
              forfeited: result.outnumber.forfeited,
            }}
          />
        </div>
      )}

      <ol className="round-list">
        {result.rounds.map((round, roundIndex) => (
          <li className="round" key={`${round.index}-${roundIndex}`}>
            <div className="round-head">
              <span className="round-index">
                {round.index > 0 ? `Damage loop ${round.index}` : "Setup"}
              </span>
            </div>
            {round.note && <p className="round-note">{round.note}</p>}
            {round.bands.map((band, bandIndex) => (
              <BandView key={`${band.band}-${bandIndex}`} band={band} />
            ))}
            {round.bands.length === 0 && !round.note && (
              <p className="muted small">No damage dealt.</p>
            )}
          </li>
        ))}
      </ol>

      <div className="survivor-grid">
        {(["a", "b"] as Team[]).map((team) => (
          <div key={team} className={`survivor-col team-${team}`}>
            <span className="eyebrow">{team === "a" ? "Army A" : "Army B"} survivors</span>
            <SurvivorList cards={result.survivors[team]} />
          </div>
        ))}
      </div>

      <p className="rules-footnote">
        Targeting walks the line front-to-back: threatening cards must take damage,
        non-threatening cards are skipped unless the hit would destroy them.
      </p>
    </section>
  );
}

function BandView({ band }: { band: BandLog }) {
  const total = band.damage.reduce((sum, side) => sum + side.total, 0);
  return (
    <div className="band">
      <div className="band-head">
        <span className={`band-name range-${band.band}`}>{RANGE_NAME[band.band]}</span>
        <span className="muted small">{total === 0 ? "no damage" : `${total} damage`}</span>
      </div>
      {total > 0 && (
        <div className="band-sides">
          {band.damage.map((side) => (
            <div className={`band-side team-${side.team}`} key={side.team}>
              <div className="band-side-head">
                <span className="band-team">{side.team.toUpperCase()}</span>
                <span className="band-total">{side.total}</span>
              </div>
              <ApplicationList side={side} />
            </div>
          ))}
        </div>
      )}
      {band.retreats.map((retreat) => (
        <p className="retreat-note" key={retreat.team}>
          ↩ {retreat.uids.length} unit{retreat.uids.length === 1 ? "" : "s"} of Army{" "}
          {retreat.team.toUpperCase()} withdrew
        </p>
      ))}
    </div>
  );
}

function ApplicationList({ side }: { side: SideDamage }) {
  if (side.applications.length === 0 && side.forfeited === 0) {
    return <p className="muted small app-empty">no targets</p>;
  }
  return (
    <ul className="app-list">
      {side.applications.map((application, index) => (
        <li
          key={`${application.uid}-${index}`}
          className={application.destroyed ? "app destroyed" : "app"}
        >
          <span className="app-name">{getDefinition(application.typeId).name}</span>
          <span className="app-hp">
            {application.hpBefore} → {application.hpAfter}
          </span>
          {application.destroyed && <span className="app-x">✕</span>}
        </li>
      ))}
      {side.forfeited > 0 && (
        <li className="app forfeit">{side.forfeited} damage forfeited</li>
      )}
    </ul>
  );
}

function SurvivorList({
  cards,
}: {
  cards: { uid: string; typeId: string; hp: number; retreating: boolean }[];
}) {
  if (cards.length === 0) return <p className="muted small">wiped out</p>;
  return (
    <ul className="survivor-list">
      {cards.map((card) => (
        <li key={card.uid} style={{ ["--accent" as string]: typeColor(card.typeId) }}>
          <Glyph typeId={card.typeId} size="sm" />
          <span>{getDefinition(card.typeId).name}</span>
          <span className="muted small">
            {card.hp} HP{card.retreating ? " · retreating" : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

function previewOutnumber(
  a: Card[],
  b: Card[],
): { source: Team; amount: number } | null {
  const aUnits = unitCount(a);
  const bUnits = unitCount(b);
  if (aUnits >= bUnits * 2 && bUnits > 0) {
    return { source: "a", amount: Math.floor((aUnits - bUnits) / 2) };
  }
  if (bUnits >= aUnits * 2 && aUnits > 0) {
    return { source: "b", amount: Math.floor((bUnits - aUnits) / 2) };
  }
  return null;
}
