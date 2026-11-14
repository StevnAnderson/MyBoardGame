import { describe, expect, it } from "vitest";
import {
  applyDamage,
  damageProfile,
  iterateBattle,
  resolveBattle,
} from "./battle";
import { createArmy, createCard } from "./cards";

const setup = (a: ReturnType<typeof createArmy>, b: ReturnType<typeof createArmy>) => ({
  a: { label: "Army A", cards: a, hasRetreatHex: true },
  b: { label: "Army B", cards: b, hasRetreatHex: true },
});

const ORDER = { retreats: { a: [], b: [] as string[] }, skips: { a: [], b: [] as string[] } };

describe("applyDamage", () => {
  it("targets the front card by default, even when it is non-threatening", () => {
    const refinery = createCard("refinery", "r1");
    const soldier = createCard("soldier", "s1");

    const result = applyDamage([refinery, soldier], 2);

    expect(refinery.hp).toBe(3);
    expect(soldier.hp).toBe(3);
    expect(result.line.map((entry) => entry.choice)).toEqual(["target", "target"]);
    expect(result.forfeited).toBe(0);
  });

  it("skips cards the defender marked Skip and moves to the next card", () => {
    const worker = createCard("worker", "w1");
    const soldier = createCard("soldier", "s1");

    const result = applyDamage([worker, soldier], 2, { skips: [worker.uid] });

    expect(worker.hp).toBe(1);
    expect(soldier.hp).toBe(1);
    expect(result.line[0]).toMatchObject({ uid: worker.uid, choice: "skip", dealt: 0 });
    expect(result.line[1]).toMatchObject({ uid: soldier.uid, choice: "target", dealt: 2 });
  });

  it("cannot skip threatening cards", () => {
    const soldier = createCard("soldier", "s1");

    const result = applyDamage([soldier], 2, { skips: [soldier.uid] });

    expect(soldier.hp).toBe(1);
    expect(result.line[0]).toMatchObject({ choice: "target", dealt: 2 });
  });

  it("walks the line once and loses any leftover damage", () => {
    const army = [createCard("worker", "w1"), createCard("soldier", "s1")];

    const result = applyDamage(army, 9);

    expect(army.map((card) => card.hp)).toEqual([0, 0]);
    expect(result.applications).toHaveLength(2);
    expect(result.forfeited).toBe(5);
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

  it("never targets retreated or destroyed cards", () => {
    const worker = createCard("worker", "w1");
    worker.retreated = true;
    const soldier = createCard("soldier", "s1");
    soldier.hp = 0;
    const refinery = createCard("refinery", "r1");

    const result = applyDamage([worker, soldier, refinery], 2);

    expect(worker.hp).toBe(1);
    expect(soldier.hp).toBe(0);
    expect(refinery.hp).toBe(3);
    expect(result.line.map((entry) => entry.choice)).toEqual([
      "skip",
      "skip",
      "target",
    ]);
    expect(result.forfeited).toBe(0);
  });

  it("returns the whole line in order with HP, choice and damage", () => {
    const army = [
      createCard("refinery", "r1"),
      createCard("soldier", "s1"),
      createCard("base", "b1"),
    ];

    const result = applyDamage(army, 4);

    expect(
      result.line.map((entry) => ({
        uid: entry.uid,
        hp: entry.hpAfter,
        choice: entry.choice,
        dealt: entry.dealt,
      })),
    ).toEqual([
      { uid: "r1", hp: 1, choice: "target", dealt: 4 },
      { uid: "s1", hp: 3, choice: "target", dealt: 0 },
      { uid: "b1", hp: 8, choice: "target", dealt: 0 },
    ]);
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
        createArmy([
          "worker",
          "worker",
          "worker",
          "soldier",
          "soldier",
          "soldier",
          "walker",
          "walker",
        ]),
      ),
    );

    expect(result.startingUnits).toEqual({ a: 4, b: 8 });
    expect(result.outnumber?.source).toBe("b");
    expect(result.outnumber?.total).toBe(2);
    expect(result.outnumber?.line).toHaveLength(4);
  });

  it("gives one unopposed loop against an army reduced to structures", () => {
    const result = resolveBattle(setup(createArmy(["artillery"]), createArmy(["refinery"])));

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
    expect(a.map((card) => card.retreated)).toEqual([undefined, undefined]);
  });
});

describe("round target choices", () => {
  it("prompts with the entire army in order, including structures", () => {
    const steps = iterateBattle(
      setup(createArmy(["refinery", "soldier", "base"]), createArmy(["soldier", "walker"])),
    );

    const first = steps.next();
    if (first.done) throw new Error("expected a round 1 prompt");

    expect(first.value.round).toBe(1);
    expect(first.value.armies.a.map((card) => card.typeId)).toEqual([
      "refinery",
      "soldier",
      "base",
    ]);
    // Only units are retreat options; structures stay in the line.
    expect(first.value.units.a.map((card) => card.typeId)).toEqual(["soldier"]);
  });

  it("uses the round's Skip marks for every band", () => {
    const refinery = createCard("refinery", "r1");
    const soldier = createCard("soldier", "s1");
    const artillery = createCard("artillery", "a1");

    const steps = iterateBattle({
      a: { label: "Army A", cards: [artillery], hasRetreatHex: true },
      b: { label: "Army B", cards: [refinery, soldier], hasRetreatHex: true },
    });

    const first = steps.next();
    if (first.done) throw new Error("expected a round 1 prompt");

    const final = steps.next({
      retreats: { a: [], b: [] },
      skips: { a: [], b: [refinery.uid] },
    });
    if (!final.done) throw new Error("expected the battle to finish");

    const longRange = final.value.rounds
      .find((round) => round.index === 1)
      ?.bands.find((band) => band.band === "long");
    const attack = longRange?.damage.find((side) => side.source === "a");

    expect(attack?.total).toBe(8);
    expect(attack?.forfeited).toBe(5);
    expect(attack?.line[0]).toMatchObject({
      uid: refinery.uid,
      choice: "skip",
      dealt: 0,
      hpAfter: 5,
    });
    expect(attack?.line[1]).toMatchObject({
      uid: soldier.uid,
      choice: "target",
      dealt: 3,
      destroyed: true,
    });
  });

  it("keeps retreated cards in the roster but stops targeting them", () => {
    const retreating = createCard("soldier", "r1");
    retreating.retreating = true;
    const holding = createCard("soldier", "s1");
    const enemy = createCard("soldier", "e1");

    const steps = iterateBattle({
      a: { label: "Army A", cards: [retreating, holding], hasRetreatHex: true },
      b: { label: "Army B", cards: [enemy], hasRetreatHex: true },
    });

    const first = steps.next();
    if (first.done) throw new Error("expected a round 1 prompt");

    const second = steps.next({
      retreats: { a: [retreating.uid], b: [] },
      skips: { a: [], b: [] },
    });
    if (second.done) throw new Error("expected a round 2 prompt");

    expect(second.value.round).toBe(2);
    expect(second.value.armies.a.map((card) => card.uid)).toEqual([
      retreating.uid,
      holding.uid,
    ]);
    expect(second.value.armies.a[0]?.retreated).toBe(true);
    expect(second.value.units.a.map((card) => card.uid)).toEqual([holding.uid]);

    const final = steps.next(ORDER);
    if (!final.done) throw new Error("expected the battle to finish");

    const melee = final.value.rounds
      .find((round) => round.index === 2)
      ?.bands.find((band) => band.band === "melee");
    const defence = melee?.damage.find((side) => side.source === "b");

    expect(defence?.line[0]).toMatchObject({
      uid: retreating.uid,
      retreated: true,
      choice: "skip",
      dealt: 0,
    });
    expect(defence?.line[1]).toMatchObject({
      uid: holding.uid,
      choice: "target",
      dealt: 2,
    });
  });
});

describe("between-round retreats", () => {
  it("prompts for retreats after outnumber damage, before the first band", () => {
    const steps = iterateBattle(
      setup(
        createArmy(["walker", "walker", "artillery", "artillery"]),
        createArmy([
          "worker",
          "worker",
          "worker",
          "soldier",
          "soldier",
          "soldier",
          "walker",
          "walker",
        ]),
      ),
    );

    const first = steps.next();
    if (first.done) throw new Error("expected a retreat prompt");

    expect(first.value.round).toBe(1);
    expect(first.value.outnumber?.total).toBe(2);
    expect(first.value.rounds).toHaveLength(0);
    // The outnumber hit destroyed one of A's walkers before the prompt.
    expect(first.value.units.a).toHaveLength(3);
    expect(first.value.units.b).toHaveLength(8);
  });

  it("lets a unit retreat at the start of a later round", () => {
    const steps = iterateBattle(
      setup(
        createArmy(["soldier", "soldier", "soldier", "soldier"]),
        createArmy(["soldier", "soldier", "soldier"]),
      ),
    );

    const first = steps.next();
    if (first.done) throw new Error("expected a round 1 prompt");
    expect(first.value.round).toBe(1);

    const second = steps.next(ORDER);
    if (second.done) throw new Error("expected a round 2 prompt");
    expect(second.value.round).toBe(2);
    expect(second.value.rounds).toHaveLength(1);
    expect(second.value.units.a).toHaveLength(2);

    const withdrawing = second.value.units.a[1];
    if (!withdrawing) throw new Error("missing unit");

    const final = steps.next({
      retreats: { a: [withdrawing.uid], b: [] },
      skips: { a: [], b: [] },
    });
    if (!final.done) throw new Error("expected the battle to finish");

    const roundTwo = final.value.rounds.find((round) => round.index === 2);
    const melee = roundTwo?.bands.find((band) => band.band === "melee");
    expect(melee?.damage[0]?.total).toBe(2);
    expect(melee?.retreats).toContainEqual({
      team: "a",
      uids: [withdrawing.uid],
    });
  });
});
