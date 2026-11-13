# Rules decisions and open questions

Where `BoardGame.docx` is silent or ambiguous, the app has to pick a reading. This
file records what has been decided and what still needs table time. Each decision
maps to a small, tested piece of `src/game/battle.ts` or `src/game/codex.ts`.

## Settled

**Income** — a worker produces whatever its structure does. One mineral per worker
in a Base, one gas per worker in a Refinery. Unstaffed structures produce nothing.
The Turn Flow income panel reflects exactly this.

**Supply** — the printed card counts are a hard per-player limit:

| Card | Limit | Card | Limit |
| --- | --- | --- | --- |
| Worker | 12 | Base | 6 |
| Soldier | 12 | Barracks | 8 |
| Walker | 12 | Factory | 6 |
| Artillery | 9 | Refinery | 5 |

The Battle Lab disables an "add" chip at the cap, and the Codex shows the limit on
every card.

**Build times** — everything builds in one turn. You pay during the Construction
phase and the card is ready at the start of your next turn, so "Advance
construction" became "Complete construction".

**Retreats** — retreating units deal no damage. They become non-threatening, can be
skipped as targets, and leave after any band that deals damage. This keeps the
structures-only clause consistent: a side that withdraws everything and leaves
buildings behind does not shoot back. Retreats can be chosen before the battle
starts and again at the start of every round — the first round prompt appears
after outnumber damage.

## Engine assumptions still worth confirming

These are implemented and tested, but they are readings rather than decisions.

**Outnumber counting.** Living units count, including units currently marked
retreating; structures never count and are not counted as "units" in the comparison.

**Outnumber targeting.** The free damage follows the normal front-to-back targeting
rules, so it can be split across the line and can hit structures in the way.

**Outnumber rounding.** `(larger − smaller) ÷ 2`, rounded down, applied only when the
larger side has at least double the smaller side's units. Ties do nothing.

**Structures-only loop.** Exactly one unopposed loop (long, mid, melee), then the
battle ends. Surviving structures do not hold the hex.

**Both sides reduced to structures.** Treated as a draw; the defender keeps the
contested hex, consistent with "the attacking force stays on their adjacent hex".

**Damage assignment is effectively mandatory.** The forfeit rule exists in the
engine and is unit-tested, but the default attacker policy never forfeits — an
optimal player always has a better target than wasting damage.

**Retreats are chosen per round.** Units marked in the Battle Lab start round 1 as
retreating; the round-start prompt lets either side add or remove marks before each
round's bands resolve. A retreat declared with no legal hex is ignored for that
round and the units turn upright. Units that leave are gone for later rounds.

**Range bands are combat math, not board reach.** Damage goes to an adjacent army
regardless of band; long range does not shoot two hexes away.

## Still open

**Repair.** "Can repair" is mentioned once, with no cost or rate. Not modelled.

**Maneuver tokens.** How many a player gets per turn is not stated.

**Stacking.** No limit is given for armies per hex, or for combining two armies.

**Randomness.** Conflicts and battles resolve in random order. A physical game uses
a die; an app needs a seed both players can verify. Not modelled, because the Battle
Lab resolves a single fight on demand.

**Worker combat.** Workers deal 1 melee damage and are non-threatening. That is a
real, interesting choice on the battlefield — worth confirming it is intended rather
than an artefact of filling in the template.

## Roadmap

Ordered by how much each adds to a playtest:

1. **Batch simulation** — run a matchup 1,000 times and report win rates. Fastest
   route to balancing costs without table time.
2. **Multi-army battles** — conflict chains, damage split across adjacent armies,
   outnumber across whole teams.
3. **Map layer** — hex board, armies, maneuver tokens, conflict detection.
4. **Async play** — server-backed turns so a game can be played remotely.
