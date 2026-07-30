# LIVI

[Play LIVI in your browser](https://livi-organism.vercel.app) — public, no
account required, and camera mode works on supported mobile browsers.

[View the public source on GitHub](https://github.com/JaronKBragg7337/livi-organism).

LIVI is a playable proof of a persistent artificial-organism companion. Its
body is a living cell lattice rather than a fixed growth animation: nutrients
diffuse through connected cells, metabolism consumes energy, healthy edges
divide, weak regions decay, and starvation can collapse the body into a
recoverable dormant seed.

The organism also has a lightweight adaptive field. Seeded traits influence
curiosity, sociability, appetite, resilience, playfulness, growth, and
locomotion. Small mutations can occur when cells divide, so two long-lived
organisms can develop differently.

Care is part of the simulation:

- Feed places a nutrient mote that LIVI senses, approaches, consumes, and
  distributes through its body.
- Petting builds bond, trust, and touch memory.
- Play changes joy, movement, and care history.
- A resilience-based lifespan moves from hatchling to elder, then preserves the
  organism as a recoverable legacy seed.
- Achievements and care earn in-world Motes. Motes buy functional feeders,
  toys, nests, and habitat rooms—never real-money purchases.
- New blob friends are discovered from meals, growth, and bonding, and their
  visits affect joy, friendship, and gifts.
- Time away is simulated on return, including energy use, damage, dormancy,
  and recovery.
- AR room mode uses the device camera as a privacy-first local background.
  Real plane detection, anchors, occlusion, and persistent room locations are
  still ahead; see [docs/MOBILE_ARCHITECTURE.md](./docs/MOBILE_ARCHITECTURE.md)
  for the packaging decision and its reasoning.
- The optional Blob Commons adds cross-device recovery, public organism
  profiles, visits, gifts, and friendship requests. Local play remains
  account-free, and profiles are private until their caregiver publishes them.
- The Simulation Lab can checkpoint a local organism, advance its lifetime,
  trigger growth or starvation, and test dormant-seed recovery.
- A surviving lone cell can germinate after sustained nourishment. The
  emergency Pulse Capsule accelerates recovery but never replaces biological
  growth, and every organism receives one free first dose.
- LIVI keeps permanent formative memories and compact daily care rhythms. Those
  memories alter recovery, behavior, preferences, and what later generations
  inherit. Every day you have shared stays remembered for the life of the
  organism; only the individual timestamps of distant days are folded away, so
  a multi-year save stays comfortably inside mobile browser storage limits.
- Optional signed-in continuity uses immutable save revisions, restore history,
  offline queues, and explicit conflict choices instead of destructive
  last-write-wins replacement.
- Natural old age can resolve into a new legacy generation carrying the
  relationship forward. Rare Monthlight Serum can extend a generation twice,
  using earned Motes only.

By default, organism state and memory stay in browser storage on the current
device. Cloud continuity is opt-in. A public profile includes only the blob name,
phenotype, life phase, cell count, bond, room, badges, and simulated traits.
Email addresses, camera frames, room imagery, and location are never public.
Camera frames are not uploaded or stored.

## Develop locally

```bash
npm install
npm run dev
```

Then open the local URL printed by the development server. Camera mode requires
a secure context (HTTPS) or localhost.

The local organism, manual export/import, care loop, store, friends, and
Simulation Lab work without cloud configuration. To enable the optional
Commons, provide `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, then apply the migrations in
`supabase/migrations`.

## Architecture

- `app/LiviCompanion.tsx` — cellular ecology, persistence, adaptive behavior,
  lifespan, economy, care loop, camera mode, sound, and procedural rendering.
- `app/LifeHub.tsx` and `app/lifeData.ts` — friends, achievements, store,
  feeder, rooms, toys, the Simulation Lab, and visible update history.
- `app/CloudCommons.tsx` and `app/cloud.ts` — optional identity, encrypted
  revisioned recovery, conflict preservation, restore history,
  privacy-filtered public profiles, visits, gifts, friendship requests, and
  manual save transfer.
- `app/LivingContinuity.tsx` — germination, emergency medicine, memory journal,
  and lineage presentation.
- `app/globals.css` — responsive habitat and companion interface.
- `supabase/migrations` — versioned Commons schema, indexes, constraints,
  explicit API privileges, and row-level security policies.
- `tests/rendered-html.test.mjs` — production-render and capability checks.

The browser build is the vertical slice. The next production layer extracts the
simulation into a portable, deterministic TypeScript core and keeps rendering,
AR tracking, and UI as separate consumers of the same organism state. Keeping a
single canonical simulation is what protects save compatibility and the
biological rules; the reasoning is in
[docs/MOBILE_ARCHITECTURE.md](./docs/MOBILE_ARCHITECTURE.md).

## Releases and license

Past changes are preserved in the in-app **Life Hub → History** view and in
[CHANGELOG.md](./CHANGELOG.md). The complete project is dedicated to the public
domain under [CC0 1.0 Universal](./LICENSE), so anyone can use, remix, publish,
or build on LIVI without asking permission. The deliberately deferred
stress-testing and research backlog is in
[docs/NEXT_AI_HANDOFF.md](./docs/NEXT_AI_HANDOFF.md).
