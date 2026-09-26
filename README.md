# Jev Poker Tutor

Play No-Limit Texas Hold'em against bots or with friends in a private room, while **TypeSafe AI's Jev** watches every action, reads your opponents in real time, and recommends your best move with a full probability distribution over your options.

Jev is a "System One" model. Instead of generating text it returns typed, calibrated decisions, which is a natural fit for poker. A local math engine computes equity, pot odds and EV and hands those facts to Jev. **Jev makes the call.**

## How it works

```
 bot acts ──► /api/read-opponent ──► Jev: aggression (score), looseness (score),
                                          hand strength (score), bluffing? (noul)
                                                   │
                                                   ▼
 your turn ─► math engine ──────────────► opponent ranges narrowed by Jev's reads
              (Monte Carlo equity,               │
               pot odds, SPR, texture,           ▼
               EV per action)          /api/decide ──► Jev: action (choice)
                                                   │    + probability for every option
                                                   ▼
                                  Coach panel · Quiz grading · Hand review
```

- **Coach mode:** Jev's recommendation is highlighted before you act.
- **Quiz mode:** you act first, then your move is graded against Jev's distribution (Best / Good / Questionable / Mistake).
- **Opponent HUD:** live aggression, looseness, hand-strength and bluff reads for every bot, plus a 13×13 heatmap of each opponent's estimated range.
- **Bots:** Rock, TAG, LAG, Calling Station and Maniac, shuffled across seats. Press "Reveal bot styles" to check Jev's reads against the truth.
- **Math-only mode:** without an API key, an EV model makes the decisions, so the app always runs.

## Multiplayer rooms

Create a room from the lobby and send the link (or 5-letter code) to up to five friends. Empty seats can be filled with bots.

- **The room server is the dealer.** Each room is a Cloudflare Durable Object (`party/server.ts`) running the same game engine. It shuffles, deals, validates every action, runs bots and turn timers, and saves the room so it survives restarts.
- **Hidden cards stay hidden.** Each player's browser receives only its own hole cards. Other players' cards arrive only if they're shown down. The deck never leaves the server.
- **Jev is host-only, and visible.** Coaching runs in the host's browser, using the host's own cards plus public actions, so it never needs anyone else's cards. Everyone sees a 🤖 Jev badge while it's on. (It's a UI rule, not a lock: anyone who can reach your deployed Next.js app can call its `/api` routes.)
- **Turn timer:** 30 seconds, then an automatic check or fold. Two timeouts in a row sit a player out until they press "I'm back". Disconnected players get 15 seconds per turn and keep their seat when they reconnect.

## Setup

```bash
npm install
cp .env.example .env.local   # add TYPESAFE_API_KEY to enable Jev
npm run dev                  # http://localhost:3000
npm run dev:rooms            # room server on http://localhost:8787 (needed for multiplayer)
npm test                     # engine, equity, bots, coach and API route tests
```

## Deploying (free tiers)

1. **Room server → Cloudflare:** `npx wrangler login`, then `npm run deploy:rooms`. This prints a host such as `jev-poker-rooms.<you>.workers.dev`.
2. **Web app → Vercel:** import the repo, then set `TYPESAFE_API_KEY` and `NEXT_PUBLIC_PARTY_HOST=<that workers.dev host>`.

## Project layout

| Path | What it does |
| --- | --- |
| `lib/poker/` | Cards, 7-card evaluator, ranges, Monte Carlo equity, bet-size menu, EV model |
| `lib/game/engine.ts` | Pure hold'em state machine: blinds, min-raises, all-ins, side pots, showdown |
| `lib/game/bots.ts` | Five bot personalities |
| `lib/jev/` | Jev question builders, state payloads and the server-side SDK client |
| `lib/coach/analysis.ts` | Glues the math engine, opponent reads and grading together |
| `app/api/` | `decide`, `read-opponent` and `status` routes (keep the API key server-side) |
| `store/game.ts` | Zustand store: runs the solo table, applies room updates, and drives the coaching loop |
| `party/server.ts` | Cloudflare Durable Object room server: seating, dealing, card privacy, timers, persistence |
| `lib/room/` | Shared room protocol, card redaction, and per-browser player identity |
| `components/` | Table, action bar, coach panel, math breakdown, HUD, range grid, hand review |

Play-money practice only. Don't use real-time assistance tools on real-money poker sites.
