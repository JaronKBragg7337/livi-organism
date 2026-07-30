# Mobile architecture decision

Status: **recommended, not yet implemented.** Written against 0.5.1.

## Recommendation

Keep the TypeScript simulation canonical. Package the mobile app with
Capacitor and add real AR through native plugins. Do **not** port the organism
model to C#.

If AR quality later becomes the binding constraint, embed a native renderer
that is driven by the TypeScript core running in an embedded JavaScript engine.
Re-implementing the biology in a second language is the one move that should
stay off the table.

## Why this and not Unity AR Foundation

The README previously named Unity AR Foundation as the production path. That
was written before the tradeoff was examined. Unity genuinely wins on AR —
plane detection, anchors, occlusion, and persistent world anchoring are all
first-class in AR Foundation, and a WebView compositing a canvas over a camera
feed cannot match ARKit depth occlusion. That advantage is real.

It loses on everything this project says it values more.

The brief's own ordering is save compatibility, biological rules, cloud
revision history, memory, privacy, and account-free play. A Unity path means a
second implementation of the organism in C#, and that is where each of those
breaks:

- **Simulation divergence.** `metabolize`, `simulateElapsed`,
  `advanceDormancyForElapsed`, `hydrateLifeSystems`,
  `preserveMonotonicContinuity`, and the Mote and serum ledgers encode a lot of
  hard-won rules. The current test suite pins them precisely — including
  adversarial cases like restoring an older revision to refund a spent dose, or
  three concurrent purchases capping at two with exactly one refund. Two
  implementations means those invariants must hold identically forever, in two
  languages, with no shared test fixture. Drift here is not a rendering bug; it
  silently changes what an organism *is*.
- **Save compatibility.** Saves are JSON produced by these exact structures. A
  C# port has to reproduce the schema, the migration ladder
  (`LIFE_SCHEMA_VERSION` is at 6), and the sanitising hydration rules bit for
  bit, or existing browser organisms are invalidated on import.
- **Encryption.** Private saves use an AES-GCM-256 envelope with PBKDF2-SHA-256
  key wrapping and additional authenticated data bound to
  `revision:owner:revision:parent:generation`. Reimplementing that in .NET is a
  second place for a subtle mistake with unrecoverable consequences.
- **The public web build.** Unity WebGL is a heavy, poor mobile-web target. The
  browser version must stay working and publicly testable, so Unity means
  maintaining two front ends against two simulations.

Capacitor inverts the risk. The simulation ships unchanged, so save
compatibility is not a migration problem — it is the same code reading the same
JSON. The cost lands on AR quality and battery, which are recoverable
engineering problems, rather than on organism identity, which is not.

## What Capacitor gets for free

Verified as present in the current stack and supported in `WKWebView` and
Android `WebView`:

- IndexedDB and `localStorage` — the existing local-first persistence.
- Web Crypto (`crypto.subtle`) — the existing keyring and envelope code.
- `supabase-js` over HTTPS — the existing revision and Commons layer.
- Canvas 2D — the existing procedural renderer.
- `getUserMedia` — today's camera-background room mode, at parity.

That means step one can ship an app that is behaviourally identical to the web
build, on both stores, before any AR work begins.

## What still needs building

1. **Extract a portable core.** Move the simulation out of the 240 KB
   `app/LiviCompanion.tsx` into a dependency-free `organism-core` module with
   no React, DOM, or timer imports. The `__liviTest` export already proves the
   model runs headlessly under Node, so this is a refactor with a working
   safety net rather than a rewrite. Rendering, input, storage, and AR then
   become consumers of that core.
2. **Determinism discipline.** The core must take time and randomness as
   explicit inputs. It largely does already — `simulateElapsed` and
   `advanceDormancyForElapsed` are proven equivalent by test — but `Date.now()`
   and `crypto.randomUUID()` are still called inside model code and should be
   injected.
3. **Versioned mobile-safe save schema.** Keep `LIFE_SCHEMA_VERSION` as the
   single migration ladder shared by web and mobile. Never fork it per
   platform.
4. **Secure device key storage.** Move the device key from IndexedDB into
   Keychain (iOS) and Keystore/EncryptedSharedPreferences (Android) via a
   Capacitor plugin, keeping the web path as-is.
5. **Lifecycle correctness.** `pause`/`resume` must drive the same
   elapsed-time path as offline simulation, so backgrounding is
   indistinguishable from being closed. The existing equivalence test is the
   model to extend.
6. **AR bridge, staged.** Ship camera-background parity first. Then add a
   native ARKit/ARCore plugin for plane detection and anchoring. Occlusion is
   the hardest part and should be the last thing attempted, because it is where
   the WebView approach is genuinely weakest.

## Open questions to resolve before step 1

- `vinext` 0.0.50 is the actual build tool, not stock Next.js. Confirm it can
  emit a fully static client bundle suitable for a Capacitor web root. If it
  cannot, that is an argument for extracting the core sooner and giving mobile
  its own thin shell.
- Canvas 2D performance for ~880 cells inside a WebView on mid-range Android
  is unmeasured. Benchmark before committing; a WebGL renderer for the cell
  lattice is the fallback.

Neither question threatens the recommendation, because both are about the
presentation layer. The simulation stays canonical either way.
