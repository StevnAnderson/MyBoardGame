# Rules decisions and open questions

Where `BoardGame.docx` is silent or ambiguous, the app has to pick a reading. This
file records what has been decided and what still needs table time. Each decision
maps to a small, tested piece of `src/game/battle.ts`, `src/game/play.ts` or
`src/game/codex.ts`.

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
after outnumber damage. Units that leave are kept in the roster as retreated
cards: greyed out, untargetable, and excluded from fighting and from survivors.

**Targeting is a per-round choice.** Damage walks the defending line once, front
to back. Threatening cards always take damage and cannot be skipped.
Non-threatening cards default to Target but the defender may mark any of them
Skip at the start of the round; skipped cards are bypassed and the damage moves
on to the next card. The marks apply to all three bands in that round and reset
at the start of the next one. Damage left over after the end of the line is lost.

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

**Damage assignment is a defender choice, not an attacker policy.** Each pass
walks the line once; threatening cards must take damage, non-threatening cards
follow the Target/Skip marks set at the start of the round. Damage that reaches
the end of the line is forfeited, and the log says so.

**Retreats and target marks are chosen per round.** Units marked in the Battle
Lab start round 1 as retreating; the round-start prompt lets either side add or
remove marks and flip Target/Skip before each round's bands resolve. A retreat
declared with no legal hex is ignored for that round and the units turn upright.
Units that leave are gone for later rounds and stay visible as greyed-out,
untargetable cards.

**Range bands are combat math, not board reach.** Damage goes to an adjacent army
regardless of band; long range does not shoot two hexes away.

**Play mode is a starter map, not the full game.** The Play tab uses a fixed 3×5
odd-r hex grid with Player A on the top edge and Player B on the bottom edge, and
one mineral node plus one gas node on each side edge. Each mobile unit makes one
move per turn to an adjacent, unoccupied hex; Bases never move. Ending a turn lets
each Worker on a resource node harvest one of that resource. Combat, building and
spending are intentionally absent; resources are just a running score. The board
is shared by two paired players: the host is authoritative, the guest sends
actions, and either side can forfeit. Matching codes are 5 characters.

**Real-time transport is peer-to-peer.** Cross-device games use WebRTC with the
public PeerJS broker for the initial handshake; no game state touches a server.
The trade-off is that restrictive networks can block the connection, and the
public broker is a third-party dependency. Same-browser tabs fall back to
`BroadcastChannel`, which also makes the flow usable offline. Async/resumable
play would still need a server.

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
3. **Map layer** — grow the Play map into the real thing: variable boards, armies
   as stacks, maneuver tokens, conflict detection and battle hand-off. The starter
   3×5 map and its movement/harvest rules are the first slice.
4. **Async play** — server-backed, resumable turns so a game can survive both
   players closing their tabs. Live play is already peer-to-peer; persistence and
   matchmaking without a shared code would need a backend.
