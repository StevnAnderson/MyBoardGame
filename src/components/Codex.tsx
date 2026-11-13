import { CARD_DEFINITIONS, getDefinition } from "../game/codex";
import type { CardDefinition } from "../game/types";
import { CostBadge, Glyph, RangeTag, SectionHeading, Stat, Tag, typeColor } from "./ui";

const TREE_ROWS: { id: string; depth: number }[] = [
  { id: "base", depth: 0 },
  { id: "refinery", depth: 1 },
  { id: "barracks", depth: 1 },
  { id: "factory", depth: 2 },
];

export function Codex() {
  const units = CARD_DEFINITIONS.filter((definition) => definition.kind === "unit");
  const structures = CARD_DEFINITIONS.filter((definition) => definition.kind === "structure");

  return (
    <div className="stack">
      <SectionHeading eyebrow="Reference" title="Codex">
        <span className="muted small">
          All cards build in one turn · limits are per player
        </span>
      </SectionHeading>

      <section className="panel tree-panel">
        <div className="panel-head">
          <h3>Build tree</h3>
          <span className="muted small">Structures never move once placed</span>
        </div>
        <div className="tree">
          {TREE_ROWS.map((row) => (
            <BuildRow key={row.id} {...row} />
          ))}
        </div>
      </section>

      <section className="stack">
        <div className="grid-title">
          <h3>Units</h3>
          <span className="muted small">{units.length} cards</span>
        </div>
        <div className="card-grid">
          {units.map((definition) => (
            <CodexCard key={definition.id} definition={definition} />
          ))}
        </div>
      </section>

      <section className="stack">
        <div className="grid-title">
          <h3>Structures</h3>
          <span className="muted small">{structures.length} cards</span>
        </div>
        <div className="card-grid">
          {structures.map((definition) => (
            <CodexCard key={definition.id} definition={definition} />
          ))}
        </div>
      </section>
    </div>
  );
}

function BuildRow({ id, depth }: { id: string; depth: number }) {
  const definition = getDefinition(id);
  return (
    <div className="tree-row" data-depth={depth} style={{ ["--depth" as string]: depth }}>
      <div className="tree-node">
        <Glyph typeId={id} size="sm" />
        <span className="tree-name">{definition.name}</span>
        <CostBadge cost={definition.cost} />
      </div>
      {definition.produces && definition.produces.length > 0 && (
        <div className="tree-produces">
          <span className="muted small">produces</span>
          {definition.produces.map((item) => (
            <Tag key={item}>{item}</Tag>
          ))}
        </div>
      )}
    </div>
  );
}

function CodexCard({ definition }: { definition: CardDefinition }) {
  const accent = typeColor(definition.id);
  return (
    <article className="codex-card" style={{ ["--accent" as string]: accent }}>
      <header className="codex-card-head">
        <Glyph typeId={definition.id} />
        <div className="codex-card-title">
          <h4>{definition.name}</h4>
          <span className="muted small">
            {definition.kind === "unit" ? "Unit" : "Structure"} · limit{" "}
            {definition.supply}
          </span>
        </div>
        <CostBadge cost={definition.cost} />
      </header>

      <p className="blurb">{definition.blurb}</p>

      <div className="stat-row">
        <Stat label="HP" value={definition.hp} />
        {definition.kind === "unit" ? (
          <>
            <Stat label="Damage" value={definition.damage} />
            <Stat label="Range" value={<RangeTag range={definition.range} />} />
          </>
        ) : (
          <Stat label="Damage" value="—" />
        )}
        <Stat
          label="Threatening"
          value={
            definition.threatening ? (
              <Tag tone="warn">Yes</Tag>
            ) : (
              <Tag tone="good">No</Tag>
            )
          }
        />
      </div>

      {(definition.kind === "structure" || definition.unlocks) && (
        <div className="codex-meta">
          {definition.produces && definition.produces.length > 0 && (
            <div className="meta-line">
              <span className="muted small">Produces</span>
              <div className="tag-row">
                {definition.produces.map((item) => (
                  <Tag key={item}>{item}</Tag>
                ))}
              </div>
            </div>
          )}
          {definition.unlocks && definition.unlocks.length > 0 && (
            <div className="meta-line">
              <span className="muted small">Unlocks</span>
              <div className="tag-row">
                {definition.unlocks.map((item) => (
                  <Tag key={item} tone="accent">
                    {item}
                  </Tag>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
