# MyBoardGame — Companion

A web companion for the hex-and-army board game described in `BoardGame.docx`.
It is a **design and playtest tool**, not a full digital tabletop: it holds the
rules-derived data, resolves battles exactly as written, and walks players through
a turn.

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

Watch out for one thing when sharing the link: the checklist, army setups and notes
live in `localStorage`, which is per browser and per device. Two players opening the
same URL get independent state — that's fine for a table-side tool, but it is not
shared game state.

## What's in it

**Codex** — every unit and structure with cost, HP, damage, range, threatening
status, supply limit, what it produces and what it unlocks, plus the build tree.

**Battle Lab** — builds two armies and resolves the fight through the full damage
loop. It enforces outnumber damage, simultaneous range bands, front-to-back
targeting (threatening cards must take damage, non-threatening cards can be
skipped), excess-damage carry-over, retreats, and the unopposed loop against an
army reduced to structures. Every application is logged so you can see exactly
why an army lost. Adding a card is blocked at its supply limit.

**Turn Flow** — the phase checklist in the order the rules require, plus an
income calculator and a notes pad. Progress and notes are kept in
`localStorage`, so they survive a refresh.

## Project layout

```
src/game/types.ts       cards, costs, range bands
src/game/codex.ts       stat blocks transcribed from BoardGame.docx
src/game/battle.ts      the rules engine (framework-free, unit tested)
src/game/battle.test.ts damage loop, targeting, outnumber and retreat rules
src/game/codex.test.ts    stat blocks and printed card counts
src/components/         Codex, Battle Lab, Turn Flow views
docs/OPEN_QUESTIONS.md  decisions made, assumptions still worth confirming
```

The engine in `src/game/battle.ts` has no React or DOM dependency. If the app
later moves to async multiplayer or a server, that module comes along unchanged.

## Rules decisions

Settled with the designer:

- **Income** — a worker produces its structure's output: 1 mineral in a Base, 1 gas
  in a Refinery. Unstaffed structures produce nothing.
- **Supply** — the printed card counts are hard per-player limits (12 workers, 12
  soldiers, 12 walkers, 9 artillery, 6 Bases, 8 Barracks, 6 Factories, 5 Refineries).
- **Builds** — every card takes one turn.
- **Retreats** — retreating units deal no damage and can be skipped as targets.

Everything else the engine had to assume is listed in
[`docs/OPEN_QUESTIONS.md`](docs/OPEN_QUESTIONS.md).

## Scope

The Battle Lab resolves **one army per side**, which is the atomic battle from
the rules. Multi-army conflict chains, map adjacency, maneuver tokens, escorting
and production timers are not modelled yet. See the roadmap in the open
questions doc.

`BoardGame.docx` remains the source of truth for the rules.
