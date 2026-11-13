import { describe, expect, it } from "vitest";
import {
  applyDamage,
  damageProfile,
  resolveBattle,
  smartTargetPolicy,
  type TargetPolicy,
} from "./battle";
import { createArmy, createCard } from "./cards";

const setup = (a: ReturnType<typeof createArmy>, b: ReturnType<typeof createArmy>) => ({
  a: { label: "Army A", cards: a, hasRetreatHex: true },
  b: { label: "Army B", cards: b, hasRetreatHex: true },
});

describe("applyDamage", () => {
  it("skips non-threatening cards when the damage would be wasted", () => {
    const refinery = createCard("refinery", "r1");
    const soldier = createCard("soldier", "s1");

    const result = applyDamage([refinery, soldier], 2);

    expect(refinery.hp).toBe(5);
    expect(soldier.hp).toBe(1);
    expect(result.forfeited).toBe(0);
  });

  it("must hit threatening cards once it reaches them", () => {
    const refinery = createCard("refinery", "r1");
    const base = createCard("base", "b1");

    applyDamage([refinery, base], 4);

    expect(refinery.hp).toBe(5);
    expect(base.hp).toBe(4);
  });

  it("carries excess damage down the line", () => {
    const army = [
      createCard("worker", "w1"),
      createCard("soldier", "s1"),
      createCard("soldier", "s2"),
    ];

    const result = applyDamage(army, 5);

    expect(army.map((card) => card.hp)).toEqual([0, 0, 2]);
    expect(result.applications).toHaveLength(3);
    expect(result.forfeited).toBe(0);
  });

  it("forfeits damage when the attacker declines every target", () => {
    const never: TargetPolicy = () => false;
    const army = [createCard("soldier", "s1")];

    const result = applyDamage(army, 6, never);

    expect(army[0]?.hp).toBe(3);
    expect(result.forfeited).toBe(6);
  });

  it("pours damage into the line when no threatening cards remain", () => {
    const army = [createCard("refinery", "r1"), createCard("factory", "f1")];

    applyDamage(army, 7);

    expect(army[0]?.hp).toBe(0);
    expect(army[1]?.hp).toBe(3);
  });
});

describe("damage profile", () => {
  it("buckets units by range band", () => {
    const army = createArmy(["soldier", "soldier", "walker", "artillery"]);
    expect(damageProfile(army)).toEqual({ long: 8, mid: 3, melee: 4 });
  });
});

describe("resolveBattle", () => {
  it("resolves simultaneous melee so both sides can die", () => {
    const result = resolveBattle(setup(createArmy(["soldier"]), createArmy(["soldier"])));

    expect(result.outnumber).toBeNull();
    expect(result.winner).toBe("draw");
    expect(result.survivors.a).toHaveLength(0);
    expect(result.survivors.b).toHaveLength(0);
  });

  it("applies outnumber damage before the loop, using the rules example", () => {
    // A: 2 walkers + 2 artillery = 4 units. B: 3 workers + 3 soldiers + 2 walkers = 8 units.
    // B is doubled, so B deals (8 - 4) / 2 = 2 damage first.
    const result = resolveBattle(
      setup(
        createArmy(["walker", "walker", "artillery", "artillery"]),
        createArmy(["worker", "worker", "worker", "soldier", "soldier", "soldier", "walker", "walker"]),
      ),
    );

    expect(result.startingUnits).toEqual({ a: 4, b: 8 });
    expect(result.outnumber?.source).toBe("b");
    expect(result.outnumber?.total).toBe(2);
  });

  it("gives one unopposed loop against an army reduced to structures", () => {
    const result = resolveBattle(
      setup(createArmy(["artillery"]), createArmy(["refinery"])),
    );

    expect(result.winner).toBe("a");
    expect(result.rounds.some((round) => round.note?.includes("structures"))).toBe(true);
    expect(result.survivors.b).toHaveLength(0);
  });

  it("withdraws retreating units once a band deals damage", () => {
    const a = createArmy(["soldier", "soldier"]);
    const retreating = a[1];
    if (!retreating) throw new Error("missing card");
    retreating.retreating = true;

    const result = resolveBattle(setup(a, createArmy(["soldier"])));

    const firstRetreat = result.rounds
      .flatMap((round) => round.bands)
      .flatMap((band) => band.retreats)
      .find((retreat) => retreat.team === "a");
    expect(firstRetreat?.uids).toEqual([retreating.uid]);
  });

  it("lets both armies walk away when everything is retreating", () => {
    const a = createArmy(["soldier"]);
    const b = createArmy(["soldier"]);
    a[0]!.retreating = true;
    b[0]!.retreating = true;

    const result = resolveBattle(setup(a, b));

    expect(result.winner).toBe("draw");
    expect(result.reason).toMatch(/retreated/i);
  });

  it("turns a retreat upright when there is no legal hex", () => {
    const a = createArmy(["soldier"]);
    a[0]!.retreating = true;

    const result = resolveBattle({
      a: { label: "Army A", cards: a, hasRetreatHex: false },
      b: { label: "Army B", cards: createArmy(["soldier"]), hasRetreatHex: true },
    });

    expect(result.rounds[0]?.note).toMatch(/no legal hex/i);
    const melee = result.rounds
      .find((round) => round.index === 1)
      ?.bands.find((band) => band.band === "melee");
    expect(melee?.damage[0]?.total).toBe(2);
  });

  it("does not let retreating units deal damage", () => {
    const a = createArmy(["artillery"]);
    a[0]!.retreating = true;

    const result = resolveBattle(setup(a, createArmy(["soldier"])));

    expect(result.survivors.b[0]?.hp).toBe(3);
  });

  it("is deterministic and does not mutate its input", () => {
    const a = createArmy(["soldier", "walker"]);
    const b = createArmy(["soldier"]);

    resolveBattle(setup(a, b));

    expect(a.map((card) => card.hp)).toEqual([3, 2]);
    expect(smartTargetPolicy).toBeTypeOf("function");
  });
});
