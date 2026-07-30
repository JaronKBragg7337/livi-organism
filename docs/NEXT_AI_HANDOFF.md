# LIVI follow-up hardening

LIVI 0.5.1 is the current release. These are intentionally deferred hardening
and research tasks, not missing release features.

## Verified on 2026-07-29 (0.5.1)

Re-verified from a clean clone of `main`, not taken on trust:

- [x] 34 automated tests pass (`npm test`), up from 30 at 0.5.0.
- [x] `vinext build` production build passes; `tsc --noEmit` is clean.
- [x] `npm audit --omit=dev` reports 0 vulnerabilities.
- [x] `https://livi-organism.vercel.app` returns HTTP 200 and the deployed
      bundle really contains the 0.5 systems (germination, Pulse, Monthlight,
      memory journal) — not a stale build.
- [x] The Supabase v0.5 schema is applied and live. Every private table
      (`cloud_save_revisions`, `blob_memory_episodes`, `cloud_devices`,
      `cloud_keyring_revisions`, `cloud_save_heads`, `blob_routine_summaries`,
      `cloud_saves`, `blob_profiles`) returns `[]` to an anonymous publishable
      key, and anonymous writes are rejected. RLS is doing its job.
- [x] The app loads and runs at a 375×812 phone viewport with no console errors.

## Known discrepancies

- The build toolchain is `vinext` 0.0.50 on Vite, not stock Next.js, even
  though `next` is a dependency. This matters for any mobile packaging path
  that assumes `next build` / `next export` semantics. Confirm static-export
  behaviour before committing to a Capacitor wrapper.
- The repository still carries unused scaffold from its template origin:
  `worker/`, `vite.config.ts`, `build/sites-vite-plugin.ts`, `examples/d1/`,
  `drizzle/`, `db/`, `drizzle.config.ts`, `.openai/hosting.json`, and
  `app/chatgpt-auth.ts`. None of it is imported by the organism. Removing it is
  low risk but should be done in its own commit with a green build, because
  `tests/rendered-html.test.mjs` renders `dist/server/index.js`, which the
  worker build produces.
- `public/og.png` is 1.8 MB, which dominates repository size.

## Remaining backlog

1. Multi-device sync chaos tests against disposable accounts: offline edits,
   concurrent purchases, key recovery, key rotation, revision restore, and
   three-way conflicts. **Highest remaining risk.** Nothing in the current
   suite exercises two real devices against real Supabase.
2. ~~Bound multi-year local memory growth.~~ Done in 0.5.1: per-event care
   detail is retained for 45 days and older days keep their aggregates. Still
   open: browser-quota failure and IndexedDB interruption/recovery, and
   confirming the `localStorage` head can be missing or corrupt without losing
   the IndexedDB organism.
3. Repeat the full care, camera, account, recovery, and conflict flows on
   physical iPhones in Safari and Android phones in Chrome, including
   background suspension and low-memory tab eviction. iOS Safari can evict
   unused site data after roughly seven days for non-installed sites, which is
   the single most dangerous durability gap for an account-free player.
4. `persistLocalOrganism` swallows `localStorage` quota failures silently and
   floats the IndexedDB write with `void`. If both paths fail the player gets
   no signal. Make degraded durability observable in the UI.
5. Expand inherited memories into more observable behavior: conditioned
   responses to rooms, toys, friend signals, revival cues, and care-time
   anticipation.
6. Add production error reporting and synthetic monitoring without collecting
   camera frames, precise location, room imagery, or private decrypted saves.
7. Keep dependency review current. The production audit is clean; development
   tooling advisories should be reassessed as the Vinext toolchain advances.

See [MOBILE_ARCHITECTURE.md](./MOBILE_ARCHITECTURE.md) for the packaging
decision and its reasoning.

Do not replace the immutable revision or memory ledgers with a mutable “current
save” table. Preserve account-free play, client-side encryption, CC0 licensing,
earned-Mote-only economy, and the rule that meaningful appearance and behavior
must arise from organism state.
