# LIVI production roadmap

## Product rule

Nothing important is cosmetic. A visible change must be traceable to organism
state, and every important state change must eventually become visible through
shape, motion, light, sound, or behavior.

## Recommended stack

Use two deliverables with one conceptual model:

1. Keep the browser build as the fast public vertical slice and balancing lab.
2. Build the production iOS/Android app in Unity 6 with AR Foundation, ARKit,
   and ARCore providers.

The web experience proves the care loop, visual language, persistence, and
simulation tuning. Unity supplies real plane detection, raycasts, anchors,
occlusion, device tracking, native notifications, and mobile packaging.

Do not attempt to make WebXR the only production route. Camera compositing is a
useful universal fallback, but true room placement needs the native AR
providers.

## Runtime architecture

Keep four systems independent:

### 1. Organism core

A deterministic, versioned simulation with no rendering dependencies.

- Sparse 2D field for the first mobile build; migrate to a sparse 3D field only
  after the care loop is fun.
- Per-cell energy, health, age, phenotype, signaling, and lineage.
- Local diffusion, metabolic drain, repair, division, apoptosis, and decay.
- Fixed simulation ticks at 2–5 Hz; visuals interpolate at the display frame
  rate.
- Seeded random number generator so saves can be replayed and bugs reproduced.

The browser proof currently uses a 35 × 35 field, with older 23 × 23 saves
center-migrated automatically. A Unity MVP should begin near 32 × 32 and profile
on the lowest supported phone before increasing it.

### 2. Adaptive field

Use a small utility policy, not a language model or large neural network.

Inputs:

- gradients to food, owner, light, safety, and preferred anchors;
- internal energy, damage, fatigue, joy, trust, and recent surprise;
- temperament traits and learned preference weights.

Outputs:

- idle, seek food, approach owner, retreat, rest, hide, play, and explore.

Score each action from needs + sensed gradients + traits + memory. Add inertia
and cooldowns so behavior reads as intention rather than jitter. Allow tiny
mutations when new cells form, and slower learning from repeated outcomes.

### 3. Relationship memory

Keep relationship values separate from metabolism, then let them influence one
another through explicit rules.

- Append compact care events: meal, touch, play, arrival, absence, recovery,
  scare, and favorite-location use.
- Derive trust, familiarity, routine confidence, and attachment from those
  events.
- Remember time-of-day windows and AR anchors, not raw camera frames.
- Let neglect reduce responsiveness before it erases attachment.

Permanent death should be an opt-in mode. The default should collapse a badly
starved organism into a dormant seed that requires patient recovery.

### 4. Presentation and AR

Render state; never author growth stages by hand.

- Extract a smooth surface from the active cell field with marching squares
  first, then marching cubes or a metaball surface when moving to 3D.
- Drive opacity, hue, pulse rate, symmetry, pseudopods, and locomotion directly
  from cell and behavior state.
- Run surface patterning in a shader, but feed it simulation chemicals so the
  pattern has a biological cause.
- In AR, raycast to detected planes, create a persistent anchor, and store a
  semantic preference such as “under table” or “near couch” separately from the
  platform anchor ID.
- Add depth occlusion only after placement and touch are reliable.

## Persistence and offline life

Save:

- simulation schema version and seed;
- compressed active-cell field;
- traits and learned weights;
- relationship event summary;
- AR anchor references and room preferences;
- last authoritative timestamp.

On return, do not replay every missed frame. Integrate metabolism analytically
for the quiet period, then run a bounded number of repair/death steps. Cap
offline damage and always preserve a dormant seed in the default care mode.

Cloud sync should come later and remain optional. Camera frames and room meshes
should stay on device.

## Milestones

### Milestone 0 — browser vertical slice

Complete in this repository:

- persistent cellular body;
- nutrient seeking and consumption;
- diffusion, metabolism, birth, death, dormancy, and recovery;
- seeded temperament with mutation;
- feed, pet, play, bond, and care history;
- camera AR fallback;
- responsive public interface.

### Milestone 1 — Unity simulation lab

- Port the organism core to plain deterministic C#.
- Add edit-mode tests for conservation, bounded energy, connected growth,
  dormancy, and save migrations.
- Build a desktop simulation inspector that can run 30 days in minutes.
- Match the web prototype’s visual and behavioral outputs.

Exit test: 1,000 seeded organisms survive a scripted care schedule without NaN
state, runaway cell growth, disconnected immortal cells, or unrecoverable save
files.

### Milestone 2 — first device AR

- Install Android and iOS build support.
- Add AR Foundation, ARCore, and ARKit providers.
- Detect horizontal planes and place one organism with a tap.
- Pet through screen-space raycasts; place food on nearby planes.
- Add anchor persistence and camera-safe local storage.

Exit test: placement, relaunch, feeding, and touch work on one real Android and
one real iPhone in five different rooms.

### Milestone 3 — emotional persistence

- Routine learning and favorite locations.
- Local notifications based on organism state, with humane frequency limits.
- Hiding, greeting, sleeping, and recovery behaviors.
- Accessibility controls and a no-death care mode.

Exit test: week-long diary study participants can describe why their LIVI
behaved differently without reading its numbers.

### Milestone 4 — evolving morphology

- Reaction–diffusion chemicals.
- Food and environmental preferences.
- Locomotion phenotypes.
- Reproduction and inherited offspring only after save compatibility is proven.

## Essential tests

- Energy never appears except through declared sources.
- Diffusion does not change total energy except for metabolism.
- Growth cannot create disconnected islands.
- Starvation changes body before a status label announces it.
- Every behavior decision can produce a short player-readable reason.
- Old saves migrate forward or fail into a recoverable dormant seed.
- Repeated petting cannot replace nutrition.
- The app never uploads camera pixels or room geometry without explicit consent.

## Biggest product risks

- **Too much simulation, too little readability:** expose causes through motion,
  color, and short biology notes.
- **Punishing absence:** use dormancy, generous offline caps, and recovery arcs.
- **Fake uniqueness:** ensure traits affect choices and morphology, not merely
  profile labels.
- **Mobile heat and battery:** simulate slowly, render selectively, profile the
  lowest-end supported device first.
- **AR novelty without companionship:** make the non-AR care loop emotionally
  complete; AR should deepen presence, not carry the entire product.
