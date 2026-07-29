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
- Time away is simulated on return, including energy use, damage, dormancy,
  and recovery.
- AR room mode uses the device camera as a privacy-first local background.
  The production mobile path is Unity AR Foundation for plane detection,
  anchors, occlusion, and persistent room locations.

All organism state stays in browser storage on the current device. Camera
frames are not uploaded or stored.

## Develop locally

```bash
npm install
npm run dev
```

Then open the local URL printed by the development server. Camera mode requires
a secure context (HTTPS) or localhost.

## Architecture

- `app/LiviCompanion.tsx` — cellular ecology, persistence, adaptive behavior,
  care loop, camera mode, sound, and procedural rendering.
- `app/globals.css` — responsive habitat and companion interface.
- `tests/rendered-html.test.mjs` — production-render and capability checks.

The browser build is the vertical slice. The next production layer should port
the simulation model to deterministic Unity C# data structures while keeping
rendering, AR tracking, and UI as separate consumers of the same organism state.
