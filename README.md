# Sector:Gridfall — Companion

A web companion for the hex-and-army board game described in `BoardGame.docx`.
It is a **design and playtest tool**, not a full digital tabletop: it holds the
rules-derived data, resolves battles exactly as written, walks players through a
turn, and includes a small starter map you can actually play.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # rules-engine tests
npm run build    # production build in dist/
```

Node 18+ required. On Windows, if `npm` is blocked by an execution policy, run
commands through `cmd /c "npm ..."`.

## Deploying to Surge

The app is static, so any static host works. With Surge:

```bash
npm run build                 # writes dist/
npx surge dist myboardgame.surge.sh
```

The first run asks for an email and password and creates the Surge account. If you
omit the domain, Surge generates one; you can also point a custom domain at it.
HTTPS is automatic.

`dist/` is gitignored, so always build before publishing. If you later add
client-side routing, copy `dist/index.html` to `dist/200.html` so deep links resolve;
the current version has no routes, so that isn't needed yet.

Watch out for one thing when sharing the link: the checklist, army setups, map
state and notes live in `localStorage`, which is per browser and per device. Two
players opening the same URL get independent state — that's fine for a table-side
tool. The Play tab is the exception: use **Host Game** / **Join Game** to pair two
browsers and share one board state.

## What's in it

**Codex** — every unit and structure with cost, HP, damage, range, threatening
status, supply limit, what it produces and what it unlocks, plus the build tree.

**Battle Lab** — builds two armies and resolves the fight through the full damage
loop. It enforces outnumber damage, simultaneous range bands, a single
front-to-back damage pass, and the unopposed loop against an army reduced to
structures. At the start of every round — the first one included — you choose
which units retreat and mark each non-threatening card **Target** or **Skip**;
threatening cards always take damage, and the marks hold for all three bands that
round. Each pass logs the whole defending line in order: card, remaining HP,
Target/Skip, and damage taken. Damage still left when the line ends is lost.
Destroyed cards stay listed in red, successfully retreated cards grey out and
become untargetable, and adding a card is blocked at its supply limit.

**Turn Flow** — the phase checklist in the order the rules require, plus an
income calculator and a notes pad. Progress and notes are kept in
`localStorage`, so they survive a refresh.

**Play** — opens on a matching screen. One player clicks **Host Game** and shares
the five-character code; the other enters it under **Join Game**. Once paired, the
matching screen gives way to the starter map: three hex columns wide and five rows
deep, with Player A on the top edge and Player B on the bottom edge. Each edge
carries a mineral node and a gas node. An occupied hex shows a dot in its owner's
colour rather than every piece. Click one of your hexes to list everything stacked
there in the hex panel on the left, pick a Worker or Soldier, then click a
highlighted neighbour to queue its move. Enemy hexes only report **Occupied by
enemy** and reveal nothing inside. Any number of allied pieces may share a hex;
enemy-held hexes cannot be entered. Both players plan at the same time, then click
**Submit**. When both sides have submitted, every unit moves at once. Each mobile
unit makes one move per round and Bases never move. If both players pick the same
empty hex, both sides' moves there are cancelled. Every Worker standing on a node
then harvests one of that resource, and the next round begins. Resources are the
score. **Forfeit** declares the opponent the winner and returns both players to
matching. Combat, building and spending come later.

Host and guest connect directly over WebRTC (signalled by the free PeerJS broker).
Tabs in the same browser also pair over `BroadcastChannel`, so a code works offline
on one device and the flow can be tested where WebRTC is unavailable. **Practice
locally** keeps the original hotseat starter map and the Amazons / Pferdeäppel
variants.

## Project layout

```
src/game/types.ts       cards, costs, range bands
src/game/codex.ts       stat blocks transcribed from BoardGame.docx
src/game/battle.ts      the battle rules engine (framework-free, unit tested)
src/game/battle.test.ts damage loop, targeting, outnumber and per-round choices
src/game/play.ts        starter-map movement, stacking, harvesting and rounds
src/game/play.test.ts   map shape, neighbours, movement, harvesting and round resolution
src/lib/match.ts        code matchmaking: PeerJS plus BroadcastChannel fallback
src/game/codex.test.ts    stat blocks and printed card counts
src/components/         Codex, Battle Lab, Turn Flow and Play views
docs/OPEN_QUESTIONS.md  decisions made, assumptions still worth confirming
```

The engines in `src/game/` have no React or DOM dependency. If the app later
moves to async multiplayer or a server, those modules come along unchanged.

## Rules decisions

Settled with the designer:

- **Income** — a worker produces its structure's output: 1 mineral in a Base, 1 gas
  in a Refinery. Unstaffed structures produce nothing.
- **Supply** — the printed card counts are hard per-player limits (12 workers, 12
  soldiers, 12 walkers, 9 artillery, 6 Bases, 8 Barracks, 6 Factories, 5 Refineries).
- **Builds** — every card takes one turn.
- **Retreats** — retreating units deal no damage, are non-threatening, can be
  skipped as targets, and leave after any band that deals damage. You can change
  the retreat list at the start of every round; units that leave stay gone.
- **Targeting** — damage walks the defending line once, front to back.
  Threatening cards always take damage. Non-threatening cards default to Target
  and can be marked Skip for the round. Leftover damage after the end of the line
  is lost.

Everything else the engine had to assume is listed in
[`docs/OPEN_QUESTIONS.md`](docs/OPEN_QUESTIONS.md).

## Scope

The Battle Lab resolves **one army per side**, which is the atomic battle from
the rules. The Play tab is a deliberately tiny two-player skirmish: a fixed 3×5
map, unlimited allied stacking on a hex, one queued move per mobile unit per
round, simultaneous resolution and Worker harvesting. Multi-army conflict chains,
full map adjacency, maneuver tokens, escorting and production timers are not
modelled yet. See the roadmap in the open questions doc.

`BoardGame.docx` remains the source of truth for the rules.
