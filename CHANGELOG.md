# Changelog

All notable changes to LIVI are preserved here and in the app under **Life
Hub → History**.

## [0.5.0] - 2026-07-29

### Added

- Natural single-cell seed germination: a healthy, well-fed lone core can bud
  back into a viable cellular scaffold without an item.
- The earned-Mote Pulse Capsule emergency treatment, including one free first
  dose, temporary stem-cell protection, a visible biological scar, and a
  permanent revival memory.
- Revisioned automatic cloud continuity with device-aware conflict handling,
  immutable restore history, idempotent writes, and local-first offline safety.
- Client-encrypted private save envelopes with recovery-key and enrolled-device
  access paths; public Commons traits remain deliberately separate.
- Permanent episodic memories and compact daily routine memories covering care,
  preferences, absences, friends, collapse, recovery, blooms, and mutation.
- Legacy generations that carry forward personality, bond, achievements,
  formative memories, and lineage while beginning in a genuinely new body.
- The rare Monthlight Serum, purchasable only with earned Motes and capped at
  two 30-day lifespan extensions per generation.

### Changed

- Cloud recovery now preserves divergent timelines instead of silently choosing
  the last writer.
- Accounts remain optional and no-login local play still starts instantly.
- Starvation collapse, emergency revival, natural old age, and generational
  succession now have distinct biological rules and memories.

### Privacy

- Camera frames, room imagery, audio, and precise location remain device-local
  and are excluded from memory and sync payloads.
- New cloud records are owner-scoped with row-level security and explicit Data
  API privileges.

## [0.4.0] - 2026-07-29

### Added

- Optional email-based cloud recovery that never blocks account-free local
  play.
- The Blob Commons: opt-in public organism profiles, privacy-filtered traits,
  daily visits, nutrient/play gifts, and friendship requests.
- Local JSON export/import for account-free backups and transfers.
- A Simulation Lab with temporary checkpoints, accelerated aging, starvation
  pulses, nutrient blooms, and dormant-seed testing.
- A versioned Supabase schema with row-level security, integrity constraints,
  supporting indexes, and explicit Data API privileges.

### Privacy

- New profiles default to private at the database layer.
- Full organism saves are readable only by their owner.
- Public profiles exclude email, camera imagery, room imagery, and location.
- Daily visit uniqueness and friendship participation are enforced by the
  database rather than trusted to browser UI.

## [0.3.0] - 2026-07-29

### Added

- A resilience-based natural lifespan with hatchling, young, mature, elder,
  and legacy-seed phases.
- Discoverable blob friends with visits, friendship, emotional effects, and
  occasional Mote gifts.
- Care achievements with visible progress and Mote rewards.
- A no-real-money Blob Store for the automatic Nutrient Feeder, functional
  toys, a recovery nest, and habitat rooms.
- Persistent Mote currency earned from meals, play, touch routines,
  achievements, and friends.
- A six-hour automatic feeder schedule that continues from saved timestamps.
- In-app release history and save migration for every new life-system field.
- CC0 1.0 Universal public-domain dedication.

### Changed

- Toys and rooms now change behavior or recovery rather than acting as purely
  cosmetic unlocks.
- Natural aging now interacts with cell health late in life and resolves into
  the same recoverable core used by dormancy.

## [0.2.0] - 2026-07-29

### Changed

- Expanded the cellular field from 23×23 to 35×35.
- Raised practical organism growth from roughly 250 to roughly 880 cells.
- Changed food seeking from placement order to nearest-food selection.
- Added automatic migration for organisms saved on the smaller field.

## [0.1.0] - 2026-07-28

### Added

- Cellular metabolism, nutrient diffusion, growth, starvation, decay,
  recovery, and dormancy.
- Adaptive traits, mutation, food seeking, feed, pet, play, bonding, offline
  life, procedural rendering, and camera AR mode.
- Private on-device persistence and the first public browser experience.
