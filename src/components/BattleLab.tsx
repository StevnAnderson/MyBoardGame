import { useMemo, useRef, useState } from "react";
import {
  damageProfile,
  iterateBattle,
  totalHp,
  unitCount,
  type BandLog,
  type BattleResult,
  type RetreatChoices,
  type RetreatPrompt,
  type RoundLog,
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

type BattleRunner = Generator<RetreatPrompt, BattleResult, RetreatChoices>;

interface LiveBattle {
  prompt: RetreatPrompt;
  choices: RetreatChoices;
}

function choicesFromPrompt(prompt: RetreatPrompt): RetreatChoices {
  return {
    a: prompt.units.a.filter((unit) => unit.retreating).map((unit) => unit.uid),
    b: prompt.units.b.filter((unit) => unit.retreating).map((unit) => unit.uid),
  };
}

function teamName(team: Team): string {
  return team === "a" ? "Army A" : "Army B";
}

export function BattleLab() {
  const [armyA, setArmyA] = useLocalStorage<Card[]>("mbg.army.a", []);
  const [armyB, setArmyB] = useLocalStorage<Card[]>("mbg.army.b", []);
  const [retreatA, setRetreatA] = useLocalStorage("mbg.retreat.a", true);
  const [retreatB, setRetreatB] = useLocalStorage("mbg.retreat.b", true);
  const [result, setResult] = useState<BattleResult | null>(null);
  const [live, setLive] = useState<LiveBattle | null>(null);
  const runnerRef = useRef<BattleRunner | null>(null);

  const clearBattle = () => {
    runnerRef.current = null;
    setLive(null);
    setResult(null);
  };

  const updateA = (next: (cards: Card[]) => Card[]) => {
    setArmyA(next);
    clearBattle();
  };
  const updateB = (next: (cards: Card[]) => Card[]) => {
    setArmyB(next);
    clearBattle();
  };

  const outnumber = useMemo(() => previewOutnumber(armyA, armyB), [armyA, armyB]);
  const canResolve = armyA.length > 0 && armyB.length > 0;

  const startBattle = () => {
    const runner = iterateBattle({
      a: { label: "Army A", cards: armyA, hasRetreatHex: retreatA },
      b: { label: "Army B", cards: armyB, hasRetreatHex: retreatB },
    });
    const step = runner.next();
    if (step.done) {
      runnerRef.current = null;
      setLive(null);
      setResult(step.value);
      return;
    }
    runnerRef.current = runner;
    setResult(null);
    setLive({ prompt: step.value, choices: choicesFromPrompt(step.value) });
  };

  const resolveRound = () => {
    const runner = runnerRef.current;
    if (!runner || !live) return;
    const step = runner.next(live.choices);
    if (step.done) {
      runnerRef.current = null;
      setLive(null);
      setResult(step.value);
      return;
    }
    setLive({ prompt: step.value, choices: choicesFromPrompt(step.value) });
  };

  const toggleRetreat = (team: Team, uid: string) => {
    setLive((current) => {
      if (!current) return current;
      const selected = new Set(current.choices[team]);
      if (selected.has(uid)) selected.delete(uid);
      else selected.add(uid);
      return {
        ...current,
        choices: { ...current.choices, [team]: [...selected] },
      };
    });
  };

  return (
    <div className="stack">
      <SectionHeading eyebrow="Playtest tool" title="Battle Lab">
        <div className="heading-actions">
          <button
            className="btn ghost"
            onClick={() => {
              setArmyA(PRESET_A.map((typeId) => createCard(typeId)));
              setArmyB(PRESET_B.map((typeId) => createCard(typeId)));
              clearBattle();
            }}
          >
            Load rules example
          </button>
          <button
            className="btn ghost"
            onClick={() => {
              setArmyA([]);
              setArmyB([]);
              clearBattle();
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
            clearBattle();
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
            clearBattle();
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
        <button className="btn primary" disabled={!canResolve} onClick={startBattle}>
          {live ? "Restart battle" : "Resolve battle"}
        </button>
      </div>

      {live ? (
        <LiveBattlePanel
          live={live}
          onToggle={toggleRetreat}
          onContinue={resolveRound}
        />
      ) : result ? (
        <ResultPanel result={result} />
      ) : (
        <div className="empty-state">
          <span className="empty-glyph" aria-hidden="true">
            ⚔
          </span>
          <p>
            Build two armies, then resolve. Retreats can be chosen before the battle
            and again at the start of every round.
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

function LiveBattlePanel({
  live,
  onToggle,
  onContinue,
}: {
  live: LiveBattle;
  onToggle: (team: Team, uid: string) => void;
  onContinue: () => void;
}) {
  const { prompt, choices } = live;
  const retreating = choices.a.length + choices.b.length;

  return (
    <section className="panel result-panel battle-live">
      <header className="result-head">
        <div>
          <span className="eyebrow">Battle in progress</span>
          <h3>Round {prompt.round}</h3>
          <p className="muted">
            Choose which units retreat before this round resolves. Retreating units
            deal no damage and leave after the first band that deals damage.
          </p>
        </div>
      </header>

      {prompt.outnumber && <OutnumberBanner outnumber={prompt.outnumber} />}

      <RetreatChooser prompt={prompt} choices={choices} onToggle={onToggle} />

      {prompt.rounds.length > 0 ? (
        <RoundList rounds={prompt.rounds} />
      ) : (
        <p className="muted small">No damage loops have resolved yet.</p>
      )}

      <div className="live-actions">
        <span className="muted small">
          {retreating === 0
            ? "No units are marked to withdraw."
            : `${retreating} unit${retreating === 1 ? "" : "s"} marked to withdraw.`}
        </span>
        <button className="btn primary" onClick={onContinue}>
          Resolve round {prompt.round}
        </button>
      </div>
    </section>
  );
}

function RetreatChooser({
  prompt,
  choices,
  onToggle,
}: {
  prompt: RetreatPrompt;
  choices: RetreatChoices;
  onToggle: (team: Team, uid: string) => void;
}) {
  return (
    <div className="retreat-grid">
      {(["a", "b"] as Team[]).map((team) => {
        const selected = new Set(choices[team]);
        const canRetreat = prompt.hasRetreatHex[team];

        return (
          <div key={team} className={`retreat-col team-${team}`}>
            <div className="retreat-head">
              <span className="eyebrow">{teamName(team)}</span>
              <span className="muted small">{selected.size} retreating</span>
            </div>

            {!canRetreat && (
              <p className="retreat-warning">
                No legal retreat hex — these units must turn upright and fight.
              </p>
            )}

            {prompt.units[team].length === 0 ? (
              <p className="muted small">No units left.</p>
            ) : (
              <div className="retreat-units">
                {prompt.units[team].map((unit) => {
                  const definition = getDefinition(unit.typeId);
                  const active = selected.has(unit.uid);
                  return (
                    <button
                      key={unit.uid}
                      type="button"
                      className={`retreat-unit${active ? " is-retreating" : ""}`}
                      disabled={!canRetreat}
                      aria-pressed={active}
                      onClick={() => onToggle(team, unit.uid)}
                      style={{ ["--accent" as string]: typeColor(unit.typeId) }}
                    >
                      <Glyph typeId={unit.typeId} size="sm" />
                      <span className="retreat-unit-main">
                        <span className="retreat-unit-name">{definition.name}</span>
                        <span className="muted small">
                          {unit.hp} HP
                          {definition.range ? ` · ${RANGE_NAME[definition.range]}` : ""}
                        </span>
                      </span>
                      <span className="retreat-mark" aria-hidden="true">
                        {active ? "↩" : "＋"}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
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

      {result.outnumber && <OutnumberBanner outnumber={result.outnumber} />}

      <RoundList rounds={result.rounds} />

      <div className="survivor-grid">
        {(["a", "b"] as Team[]).map((team) => (
          <div key={team} className={`survivor-col team-${team}`}>
            <span className="eyebrow">{teamName(team)} survivors</span>
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

function OutnumberBanner({
  outnumber,
}: {
  outnumber: NonNullable<BattleResult["outnumber"]>;
}) {
  return (
    <div className="outnumber-banner">
      <span className="outnumber-title">Outnumber damage</span>
      <span>
        {teamName(outnumber.source)} deals <strong>{outnumber.total}</strong> to{" "}
        {teamName(outnumber.team)} before the loop.
      </span>
      <ApplicationList
        side={{
          team: outnumber.team,
          total: outnumber.total,
          applications: outnumber.applications,
          forfeited: outnumber.forfeited,
        }}
      />
    </div>
  );
}

function RoundList({ rounds }: { rounds: RoundLog[] }) {
  return (
    <ol className="round-list">
      {rounds.map((round, roundIndex) => (
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
          ↩ {retreat.uids.length} unit{retreat.uids.length === 1 ? "" : "s"} of{" "}
          {teamName(retreat.team)} withdrew
        </p>
      ))}
    </div>
  );
}

function ApplicationList({ side }: { side: SideDamage }) {
  if (side.applications.length === 0 && side.forfeited === 0) {
    return <p className="muted small dmg-empty">no targets</p>;
  }
  return (
    <ul className="dmg-list">
      {side.applications.map((application, index) => (
        <li
          key={`${application.uid}-${index}`}
          className={application.destroyed ? "dmg-row destroyed" : "dmg-row"}
        >
          <span className="dmg-name">{getDefinition(application.typeId).name}</span>
          <span className="dmg-hp">
            {application.hpBefore} → {application.hpAfter}
          </span>
          {application.destroyed && <span className="dmg-x">✕</span>}
        </li>
      ))}
      {side.forfeited > 0 && (
        <li className="dmg-row forfeit">{side.forfeited} damage forfeited</li>
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
