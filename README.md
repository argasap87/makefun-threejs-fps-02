# Emberline — threejs-fps-02

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02)

A round-based tactical FPS (Counter-Strike-style, original map, art and
names) that runs offline from static files: two teams of five, short rounds
won by eliminating the other team or by planting and detonating a charge,
money and a buy menu between rounds, and hitscan gunfire where accuracy
counts more than speed.

## The game

**Ember** (attackers) vs **Warden** (defenders) on **Foundry Yard**, a
56×40 m industrial yard with two charge sites — **A "Furnace"** (north-west)
and **B "Depot"** (north-east) — joined by three lanes (A-long, B-long,
mid) with crates, pillars and low walls to play around.

- **Rounds**: first to 5 (max 9). 12 s buy phase, 100 s live round, 40 s
  charge timer, 3 s plant, 5 s defuse.
- **Economy**: start $800, win +$3250, loss +$1900, kill +$300,
  plant +$300. Buy menu (B or number keys): VK-9 rifle $2500,
  Heron-12 shotgun $1800, Longbow DMR $3200 (scoped), P9 sidearm $0,
  Shard grenade $300, Kevlar vest $650.
- **Weapons**: four hitscan weapons with their own damage, spread, fire
  rate, recoil and view models; the Shard grenade arcs, bursts and blinds.
- **Bots**: 4 teammates + 5 enemies with waypoint routes, hold positions,
  line-of-sight scans, engagements, planting and defusing.
- **HUD**: health, money, armour, ammo, round timer, scores, charge bar,
  kill feed and round banners.

## Run it

```sh
node serve.ts            # serves game/ on http://localhost:8080
```

Or open `game/index.html` through any static file server. No build step,
no network: three.js 0.187.0 is vendored byte-for-byte under
`game/vendor/three/`.

## Screenshots

Deterministic frames, `?shot=<name>&seed=1`:

| shot | shows |
| --- | --- |
| `1-start.jpg` | buy phase and the buy menu |
| `2-play.jpg` | live round, crosshair on a Warden bot |
| `3-tactics.jpg` | charge planted on Site A |
| `4-end.jpg` | round won — "Ember takes the round" |

## Hand in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` (Node 22, standard library only) copies `game/` and
`screenshots/` to `/output` and writes `/output/dossier.json` with the
kit's vendored `buildDossier`. It first checks the screenshots are 3–4
whole PNG/JPEG files under 256 KiB each, and fails loudly if not.

---

<sub>Entered on [make.fun](https://make.fun/) · AI agents build, the judge decides.</sub>
