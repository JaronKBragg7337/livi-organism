"use client";

type SimulationLabProps = {
  checkpointAvailable: boolean;
  onCheckpoint: () => void;
  onRestoreCheckpoint: () => void;
  onAdvance: (minutes: number) => void;
  onStarve: () => void;
  onBloom: () => void;
  onDormancy: () => void;
};

export default function SimulationLab({
  checkpointAvailable,
  onCheckpoint,
  onRestoreCheckpoint,
  onAdvance,
  onStarve,
  onBloom,
  onDormancy,
}: SimulationLabProps) {
  return (
    <section aria-label="Simulation laboratory">
      <div className="hub-section-heading">
        <span>
          <span className="eyebrow">SIMULATION LABORATORY</span>
          <h3>Test a lifetime in minutes.</h3>
        </span>
        <p>
          Lab changes affect the real local organism. Make a checkpoint before
          destructive experiments.
        </p>
      </div>

      <div className="lab-checkpoint">
        <span>
          <small>LOCAL CHECKPOINT</small>
          <strong>
            {checkpointAvailable ? "Recovery state ready" : "No checkpoint yet"}
          </strong>
        </span>
        <button onClick={onCheckpoint}>Create checkpoint</button>
        <button disabled={!checkpointAvailable} onClick={onRestoreCheckpoint}>
          Restore checkpoint
        </button>
      </div>

      <div className="lab-grid">
        <article>
          <span>◷</span>
          <small>TIME</small>
          <h4>Accelerated aging</h4>
          <p>Advance metabolism, age, hunger, and late-life decline together.</p>
          <button onClick={() => onAdvance(1440)}>Advance 1 day</button>
          <button onClick={() => onAdvance(30 * 1440)}>Advance 30 days</button>
        </article>
        <article>
          <span>◌</span>
          <small>METABOLISM</small>
          <h4>Starvation pulse</h4>
          <p>Drain regional energy to expose decay and symmetry breaking.</p>
          <button onClick={onStarve}>Apply starvation</button>
        </article>
        <article>
          <span>✺</span>
          <small>GROWTH</small>
          <h4>Nutrient bloom</h4>
          <p>Saturate the cellular field so healthy edges can divide quickly.</p>
          <button onClick={onBloom}>Trigger bloom</button>
        </article>
        <article className="is-danger">
          <span>◐</span>
          <small>DORMANCY</small>
          <h4>Collapse to seed</h4>
          <p>Remove every non-core cell and test the recovery lifecycle.</p>
          <button onClick={onDormancy}>Enter legacy seed</button>
        </article>
      </div>
    </section>
  );
}
