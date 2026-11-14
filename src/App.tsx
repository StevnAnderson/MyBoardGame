import { useState } from "react";
import { BattleLab } from "./components/BattleLab";
import { Codex } from "./components/Codex";
import { Play } from "./components/Play";
import { TurnFlow } from "./components/TurnFlow";

type Tab = "codex" | "battle" | "turn" | "play";

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "codex", label: "Codex", hint: "units & structures" },
  { id: "battle", label: "Battle Lab", hint: "resolve a fight" },
  { id: "turn", label: "Turn Flow", hint: "phase checklist" },
  { id: "play", label: "Play", hint: "hex skirmish" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("codex");

  return (
    <div className="app">
      <header className="masthead">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ⬡
          </span>
          <div className="brand-text">
            <h1>Sector:Gridfall</h1>
            <p>Companion · playtest kit</p>
          </div>
        </div>

        <nav className="tabs" role="tablist" aria-label="Sections">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              role="tab"
              aria-selected={tab === entry.id}
              className={`tab${tab === entry.id ? " is-active" : ""}`}
              onClick={() => setTab(entry.id)}
            >
              <span className="tab-label">{entry.label}</span>
              <span className="tab-hint">{entry.hint}</span>
            </button>
          ))}
        </nav>
      </header>

      <main className="content">
        {tab === "codex" && <Codex />}
        {tab === "battle" && <BattleLab />}
        {tab === "turn" && <TurnFlow />}
        {tab === "play" && <Play />}
      </main>

      <footer className="footer">
        <span>v0.1 · rules from BoardGame.docx</span>
        <span className="footer-dot" aria-hidden="true">
          ·
        </span>
        <span>Battle Lab covers a single army per side</span>
      </footer>
    </div>
  );
}
