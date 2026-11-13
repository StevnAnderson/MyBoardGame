import type { ReactNode } from "react";
import { getDefinition } from "../game/codex";
import type { Cost, RangeBand } from "../game/types";

const TYPE_COLORS: Record<string, string> = {
  worker: "#9db2c6",
  soldier: "#7fb0ff",
  walker: "#b78cff",
  artillery: "#ffa05e",
  base: "#f2b544",
  refinery: "#57c7c2",
  barracks: "#8bd17c",
  factory: "#d9a5ff",
};

export function typeColor(typeId: string): string {
  return TYPE_COLORS[typeId] ?? "#9db2c6";
}

export function Glyph({
  typeId,
  size = "md",
}: {
  typeId: string;
  size?: "sm" | "md" | "lg";
}) {
  const definition = getDefinition(typeId);
  return (
    <span
      className={`glyph glyph-${size}`}
      style={{ ["--glyph" as string]: typeColor(typeId) }}
      aria-hidden="true"
    >
      {definition.glyph}
    </span>
  );
}

export function CostBadge({ cost }: { cost: Cost }) {
  return (
    <span className="cost-badge">
      <span className="cost-part cost-minerals">
        <span aria-hidden="true">◆</span>
        {cost.minerals}
      </span>
      {cost.gas > 0 && (
        <span className="cost-part cost-gas">
          <span aria-hidden="true">▲</span>
          {cost.gas}
        </span>
      )}
    </span>
  );
}

export function Tag({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "warn" | "good" | "team-a" | "team-b" | "accent";
}) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

export const RANGE_NAME: Record<RangeBand, string> = {
  long: "Long",
  mid: "Mid",
  melee: "Melee",
};

export function RangeTag({ range }: { range: RangeBand | null }) {
  if (range === null) return <span className="muted">—</span>;
  return <span className={`range range-${range}`}>{RANGE_NAME[range]}</span>;
}

export function SectionHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      {children && <div className="section-heading-aside">{children}</div>}
    </div>
  );
}
