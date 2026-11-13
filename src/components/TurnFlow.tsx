import { useLocalStorage } from "../lib/useLocalStorage";
import { SectionHeading, Tag } from "./ui";

interface Step {
  id: string;
  title: string;
  detail: string;
  loop?: string;
}

interface Phase {
  id: string;
  name: string;
  tone: "amber" | "cyan" | "red";
  blurb: string;
  steps: Step[];
}

const PHASES: Phase[] = [
  {
    id: "construction",
    name: "Construction phase",
    tone: "amber",
    blurb: "Every player plans at the same time. Order matters.",
    steps: [
      {
        id: "income",
        title: "Collect income",
        detail:
          "One mineral per worker in your Base. One gas per worker in a Refinery. Garrisoned workers may also repair.",
      },
      {
        id: "advance",
        title: "Complete construction",
        detail: "Everything begun last turn finishes now — flip it face-up.",
        loop: "1-turn builds",
      },
      {
        id: "begin",
        title: "Begin construction / train units",
        detail:
          "Spend minerals and gas. Everything you start completes at the start of your next turn.",
      },
      {
        id: "maneuver",
        title: "Place maneuver tokens",
        detail: "Secretly commit one token to each army you want to move this turn.",
      },
      {
        id: "ready",
        title: "Place ready token",
        detail: "Lock in your base for the turn. No more changes once ready.",
      },
    ],
  },
  {
    id: "conflict",
    name: "Conflict phase",
    tone: "cyan",
    blurb: "Reveal, move everything that is not blocked, then fight what is.",
    steps: [
      {
        id: "reveal",
        title: "Reveal maneuver tokens",
        detail: "All committed maneuvers flip at the same time.",
      },
      {
        id: "identify",
        title: "Identify conflicted hexes",
        detail:
          "A hex is in conflict if an army is trying to enter it and an enemy holds it.",
      },
      {
        id: "move",
        title: "Move non-conflicted armies",
        detail: "Resolve every move that passes the conflict check.",
      },
      {
        id: "recheck",
        title: "Re-check conflicts",
        detail: "Any army that moved may have created a new conflict — go back and check.",
        loop: "if anything moved",
      },
      {
        id: "battle",
        title: "Resolve one random conflict",
        detail:
          "Pick a conflicted hex at random, fight the battle, then re-check. Repeat until no conflicts remain, then the turn ends.",
        loop: "repeat until clear",
      },
    ],
  },
  {
    id: "battle",
    name: "Battle phase",
    tone: "red",
    blurb: "Run this sequence for each battle, in random order.",
    steps: [
      {
        id: "organize",
        title: "Organize the army",
        detail:
          "Arrange front and back lines in secret. Mark any units you want to retreat.",
      },
      {
        id: "show",
        title: "Reveal participating armies",
        detail: "Both sides flip their lines at the same time.",
      },
      {
        id: "outnumber",
        title: "Apply outnumber damage",
        detail:
          "(larger team − smaller team) ÷ 2, rounded down, if one team has at least double the units.",
      },
      {
        id: "loop",
        title: "Run the damage loop",
        detail:
          "Long range → mid range → melee, all simultaneous. After melee, hide and rearrange, then start again.",
        loop: "repeat",
      },
      {
        id: "retreats",
        title: "Move retreated units",
        detail:
          "Retreating units leave after any range phase that deals damage, and move to the declared retreat hex.",
      },
    ],
  },
];

const ALL_STEPS = PHASES.flatMap((phase) => phase.steps.map((step) => step.id));

export function TurnFlow() {
  const [done, setDone] = useLocalStorage<Record<string, boolean>>("mbg.turn.done", {});
  const [baseWorkers, setBaseWorkers] = useLocalStorage("mbg.income.base", 0);
  const [refineryWorkers, setRefineryWorkers] = useLocalStorage("mbg.income.refinery", 0);
  const [notes, setNotes] = useLocalStorage("mbg.turn.notes", "");

  const completed = ALL_STEPS.filter((id) => done[id]).length;
  const progress = ALL_STEPS.length === 0 ? 0 : (completed / ALL_STEPS.length) * 100;

  const minerals = baseWorkers;
  const gas = refineryWorkers;

  const toggle = (id: string) =>
    setDone((current) => ({ ...current, [id]: !current[id] }));

  return (
    <div className="stack">
      <SectionHeading eyebrow="At the table" title="Turn flow">
        <span className="muted small">
          {completed} of {ALL_STEPS.length} steps done
        </span>
      </SectionHeading>

      <div className="progress-track" aria-hidden="true">
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>

      <div className="turn-layout">
        <div className="stack">
          {PHASES.map((phase) => (
            <section key={phase.id} className={`panel phase-panel tone-${phase.tone}`}>
              <header className="phase-head">
                <div>
                  <h3>{phase.name}</h3>
                  <p className="muted small">{phase.blurb}</p>
                </div>
              </header>
              <ol className="step-list">
                {phase.steps.map((step, index) => {
                  const isDone = Boolean(done[step.id]);
                  return (
                    <li key={step.id} className={`step${isDone ? " is-done" : ""}`}>
                      <label className="step-check">
                        <input
                          type="checkbox"
                          checked={isDone}
                          onChange={() => toggle(step.id)}
                        />
                        <span className="step-number">{index + 1}</span>
                      </label>
                      <div className="step-body">
                        <div className="step-title">
                          <span>{step.title}</span>
                          {step.loop && <Tag tone="accent">{step.loop}</Tag>}
                        </div>
                        <p className="step-detail">{step.detail}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>

        <aside className="stack turn-aside">
          <section className="panel">
            <div className="panel-head">
              <h3>Income</h3>
              <span className="muted small">per turn</span>
            </div>
            <div className="income-inputs">
              <label className="field">
                <span>Workers in Base</span>
                <input
                  type="number"
                  min={0}
                  value={baseWorkers}
                  onChange={(event) =>
                    setBaseWorkers(Math.max(0, Number(event.target.value) || 0))
                  }
                />
              </label>
              <label className="field">
                <span>Workers in Refinery</span>
                <input
                  type="number"
                  min={0}
                  value={refineryWorkers}
                  onChange={(event) =>
                    setRefineryWorkers(Math.max(0, Number(event.target.value) || 0))
                  }
                />
              </label>
            </div>
            <div className="income-totals">
              <div className="income-cell minerals">
                <span className="income-symbol" aria-hidden="true">
                  ◆
                </span>
                <span className="income-value">{minerals}</span>
                <span className="income-label">minerals</span>
              </div>
              <div className="income-cell gas">
                <span className="income-symbol" aria-hidden="true">
                  ▲
                </span>
                <span className="income-value">{gas}</span>
                <span className="income-label">gas</span>
              </div>
            </div>
            <p className="muted small">
              A worker produces whatever its structure does: 1 mineral in a Base, 1 gas
              in a Refinery. Unstaffed structures produce nothing.
            </p>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h3>Notes</h3>
              <span className="muted small">saved locally</span>
            </div>
            <textarea
              className="notes"
              rows={8}
              placeholder="Maneuvers, deals, reminders for next turn…"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </section>

          <button
            className="btn ghost"
            onClick={() => {
              setDone({});
              setNotes("");
            }}
          >
            Reset turn
          </button>
        </aside>
      </div>
    </div>
  );
}
