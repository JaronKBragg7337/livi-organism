"use client";

import { useState } from "react";
import type {
  GerminationState,
  LegacyGeneration,
  LegacyTransition,
  MemoryEpisode,
  RoutineSummary,
  VitalInventory,
} from "./lifeData";

function formatDay(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(timestamp);
}

function formatAbsence(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} hr`;
  return `${Math.round(minutes / 1440)} days`;
}

export type MemoryJournalProps = {
  episodes: MemoryEpisode[];
  routines: RoutineSummary[];
};

export function MemoryJournal({ episodes, routines }: MemoryJournalProps) {
  const [view, setView] = useState<"episodes" | "routines">("episodes");

  return (
    <section className="memory-journal" aria-label="LIVI memory journal">
      <div className="hub-section-heading">
        <span>
          <span className="eyebrow">MEMORY JOURNAL</span>
          <h3>Not stats. A remembered life.</h3>
        </span>
        <p>
          Turning points remain permanently. Everyday care becomes a compact
          daily rhythm, never a surveillance log.
        </p>
      </div>
      <div className="memory-privacy">
        <span aria-hidden="true">◇</span>
        <p>
          <strong>Creature memory, not camera memory.</strong>
          LIVI remembers care and meaning. Images, audio, precise location, and
          room scans never enter this journal or cloud sync.
        </p>
      </div>
      <div className="journal-switch" role="tablist" aria-label="Memory views">
        <button
          role="tab"
          aria-selected={view === "episodes"}
          className={view === "episodes" ? "is-active" : ""}
          onClick={() => setView("episodes")}
        >
          Formative moments <span>{episodes.length}</span>
        </button>
        <button
          role="tab"
          aria-selected={view === "routines"}
          className={view === "routines" ? "is-active" : ""}
          onClick={() => setView("routines")}
        >
          Daily rhythms <span>{routines.length}</span>
        </button>
      </div>

      {view === "episodes" ? (
        episodes.length ? (
          <ol className="episode-list" role="tabpanel">
            {episodes.map((episode) => (
              <li className={`episode episode--${episode.valence}`} key={episode.id}>
                <span className="episode__glyph" aria-hidden="true">
                  {episode.kind === "near-death"
                    ? "·"
                    : episode.kind === "revival"
                      ? "ϟ"
                      : episode.kind === "legacy"
                        ? "∞"
                        : "✦"}
                </span>
                <span>
                  <small>
                    {episode.kind.replace("-", " ")} · GENERATION {episode.generation}
                  </small>
                  <h4>{episode.title}</h4>
                  <p>{episode.detail}</p>
                  <time dateTime={new Date(episode.occurredAt).toISOString()}>
                    {formatDay(episode.occurredAt)}
                  </time>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="empty-journal">
            LIVI is still forming its first lasting memory. Feeding, recovery,
            friendship, mutation, and long absences can become part of its story.
          </p>
        )
      ) : routines.length ? (
        <div className="routine-grid" role="tabpanel">
          {routines.map((routine) => (
            <article key={routine.date}>
              <span className={`routine-grid__style routine-grid__style--${routine.careStyle}`}>
                {routine.careStyle}
              </span>
              <h4>
                {new Intl.DateTimeFormat(undefined, {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                }).format(new Date(`${routine.date}T12:00:00`))}
              </h4>
              <div>
                <span><strong>{routine.meals}</strong> meals</span>
                <span><strong>{routine.pets}</strong> gentle touches</span>
                <span><strong>{routine.plays}</strong> play moments</span>
                <span><strong>{formatAbsence(routine.longestAbsenceMinutes)}</strong> longest apart</span>
              </div>
              <p>
                {routine.favoriteToy ? `Sought ${routine.favoriteToy}. ` : ""}
                {routine.favoriteRoom ? `Settled most in ${routine.favoriteRoom}.` : ""}
                {routine.favoriteFriend ? ` Remembered ${routine.favoriteFriend}.` : ""}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-journal">
          A daily rhythm appears after LIVI has shared a full day with you.
        </p>
      )}
    </section>
  );
}

export type RecoveryPanelProps = {
  germination: GerminationState;
  inventory: VitalInventory;
  currency: number;
  onAcquireVitalItem?: (itemId: "pulse-capsule" | "monthlight-serum") => void;
  onUseVitalItem?: (itemId: "pulse-capsule" | "monthlight-serum") => void;
};

export function RecoveryPanel({
  germination,
  inventory,
  currency,
  onAcquireVitalItem,
  onUseVitalItem,
}: RecoveryPanelProps) {
  const isDire = germination.status !== "stable";
  const pulsePrice = 45;
  const serumPrice = 180;
  const serumCapped = inventory.monthlightUses >= inventory.monthlightUseCap;

  return (
    <section
      className={`recovery-panel recovery-panel--${germination.status}`}
      aria-label="Recovery and lifespan care"
    >
      <div className="recovery-vitals">
        <span className="recovery-vitals__seed" aria-hidden="true">
          <i />
        </span>
        <span>
          <small>{isDire ? "THE CORE IS STILL ALIVE" : "CELLULAR CONTINUITY"}</small>
          <h3>
            {germination.status === "germinating"
              ? "A lone cell is preparing to bud."
              : germination.status === "reviving"
                ? "A new scaffold is taking hold."
                : germination.status === "dire"
                  ? "One life. Almost no margin."
                  : `${germination.livingCells} living cells`}
          </h3>
          <p>{germination.message}</p>
          {germination.status === "reviving" ? (
            <small className="recovery-vitals__scaffold">
              {germination.scaffoldCells ?? 0} scaffold cells ·{" "}
              {Math.round((germination.scaffoldNutrition ?? 0) * 100)}% nourished ·{" "}
              {Math.ceil((germination.scaffoldProtectionMinutes ?? 0) / 60)}h protected
            </small>
          ) : null}
        </span>
        {isDire ? (
          <span className="germination-meter">
            <span>
              <small>GERMINATION</small>
              <strong>{Math.round(germination.progress * 100)}%</strong>
            </span>
            <span
              className="germination-meter__track"
              role="progressbar"
              aria-label="Seed germination progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(germination.progress * 100)}
            >
              <i style={{ width: `${Math.round(germination.progress * 100)}%` }} />
            </span>
            <small>
              {germination.mealsGiven} of {germination.mealsNeeded} nourishing meals
            </small>
          </span>
        ) : null}
      </div>

      <div className="vital-care-grid">
        <article className="vital-card vital-card--pulse">
          <span className="vital-card__glyph" aria-hidden="true">ϟ</span>
          <span>
            <small>EMERGENCY BIOLOGICAL SCAFFOLD</small>
            <h4>Pulse Capsule</h4>
            <p>
              Stabilizes a critically small core and grows temporary stem cells.
              It does not restore a former body; feeding must sustain the new growth.
            </p>
          </span>
          <div className="vital-card__status">
            <span>
              {inventory.pulseCapsules} held
              {inventory.freePulseAvailable ? " · free lifeline ready" : ""}
            </span>
            {inventory.pulseCapsules > 0 || inventory.freePulseAvailable ? (
              <button
                disabled={!isDire || !onUseVitalItem}
                onClick={() => onUseVitalItem?.("pulse-capsule")}
              >
                {isDire ? "Stabilize the core" : "Held for an emergency"}
              </button>
            ) : (
              <button
                disabled={currency < pulsePrice || !onAcquireVitalItem}
                onClick={() => onAcquireVitalItem?.("pulse-capsule")}
              >
                Earned Motes only · ✦ {pulsePrice}
              </button>
            )}
          </div>
          <small className="vital-card__truth">
            Its cellular scar and the moment of revival become a permanent memory.
          </small>
        </article>

        <article className="vital-card vital-card--serum">
          <span className="vital-card__glyph" aria-hidden="true">☾</span>
          <span>
            <small>RARE LIFESPAN TREATMENT</small>
            <h4>Monthlight Serum</h4>
            <p>
              Coaxes aging cells through exactly 30 more living days. Time is
              extended, never reset, so a lifetime still has shape.
            </p>
            <small>{inventory.monthlightReason}</small>
          </span>
          <div className="vital-card__status">
            <span>
              {inventory.monthlightUses} of {inventory.monthlightUseCap} lifetime doses used
            </span>
            {inventory.monthlightSerums > 0 ? (
              <button disabled={serumCapped || !inventory.canUseMonthlight || !onUseVitalItem} onClick={() => onUseVitalItem?.("monthlight-serum")}>
                {serumCapped ? "Lifetime limit reached" : "Give 30 more days"}
              </button>
            ) : (
              <button
                disabled={serumCapped || !inventory.canAcquireMonthlight || currency < serumPrice || !onAcquireVitalItem}
                onClick={() => onAcquireVitalItem?.("monthlight-serum")}
              >
                {serumCapped ? "Lifetime limit reached" : `Rare · ✦ ${serumPrice}`}
              </button>
            )}
          </div>
          <small className="vital-card__truth">
            No real money. Every dose comes from Motes earned by care.
          </small>
        </article>
      </div>
    </section>
  );
}

export type LineagePanelProps = {
  generations: LegacyGeneration[];
  transition: LegacyTransition;
  onBeginLegacy?: () => void;
};

export function LineagePanel({
  generations,
  transition,
  onBeginLegacy,
}: LineagePanelProps) {
  return (
    <section className="lineage-panel" aria-label="LIVI generations and legacy">
      <div className="hub-section-heading">
        <span>
          <span className="eyebrow">LIVING LINEAGE</span>
          <h3>The bond outlives one body.</h3>
        </span>
        <p>
          A new generation is not an undo. It begins small, carrying the traits
          and memories that truly shaped the life before it.
        </p>
      </div>

      {transition.available ? (
        <div className={`legacy-transition ${transition.seedReady ? "is-ready" : ""}`}>
          <span className="legacy-transition__seed" aria-hidden="true">∞</span>
          <span>
            <small>{transition.seedReady ? "DORMANT SEED READY" : "LEGACY FORMING"}</small>
            <h4>{transition.message}</h4>
            <p>
              Carries {Math.round(transition.inheritedBond * 100)}% familiar bond,{" "}
              {transition.inheritedAchievements} achievements, and{" "}
              {transition.inheritedMemories} formative memories.
            </p>
            <span className="trait-chips">
              {transition.inheritedTraits.map((trait) => <i key={trait}>{trait}</i>)}
            </span>
          </span>
          <button
            disabled={!transition.seedReady || !onBeginLegacy}
            onClick={onBeginLegacy}
          >
            Begin the next generation
          </button>
        </div>
      ) : (
        <div className="legacy-transition">
          <span className="legacy-transition__seed" aria-hidden="true">·</span>
          <span>
            <small>CURRENT LIFE STILL UNFOLDING</small>
            <h4>{transition.message}</h4>
            <p>
              Lineage waits quietly. It cannot be used to skip hardship or replace
              a living organism.
            </p>
          </span>
        </div>
      )}

      <div className="lineage-thread">
        {[...generations].reverse().map((generation, index) => (
          <article key={`${generation.generation}-${generation.bornAt}`}>
            <span className="lineage-thread__node" aria-hidden="true">
              {index === 0 ? "●" : "○"}
            </span>
            <span>
              <small>
                GENERATION {generation.generation}
                {generation.endedAt ? " · REMEMBERED" : " · LIVING NOW"}
              </small>
              <h4>{generation.name}</h4>
              <p>{generation.phenotype}</p>
              <time dateTime={new Date(generation.bornAt).toISOString()}>
                Awakened {formatDay(generation.bornAt)}
                {generation.endedAt ? ` · Rested ${formatDay(generation.endedAt)}` : ""}
              </time>
              {generation.endCause ? <p>{generation.endCause}</p> : null}
              <div>
                <span>{Math.round(generation.highestBond * 100)}% highest bond</span>
                <span>{generation.achievementCount} badges</span>
                <span>{generation.rememberedEpisodes} lasting memories</span>
              </div>
              <span className="trait-chips">
                {generation.inheritedTraits.map((trait) => <i key={trait}>{trait}</i>)}
              </span>
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}
