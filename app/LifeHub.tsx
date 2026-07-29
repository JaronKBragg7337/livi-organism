"use client";

import { useEffect, useRef } from "react";
import {
  ACHIEVEMENTS,
  FRIENDS,
  STORE_ITEMS,
  UPDATE_HISTORY,
  type BlobFriendState,
  type HubTab,
} from "./lifeData";

type LifeHubProps = {
  open: boolean;
  tab: HubTab;
  currency: number;
  ownedItems: string[];
  equippedRoom: string;
  equippedToy: string | null;
  unlockedAchievements: string[];
  friendStates: BlobFriendState[];
  activeFriendId: string | null;
  lifePhase: string;
  lifespanDays: number;
  lifeRemaining: string;
  feederStatus: string;
  onClose: () => void;
  onTab: (tab: HubTab) => void;
  onPurchase: (itemId: string) => void;
  onEquip: (itemId: string) => void;
  onInvite: (friendId: string) => void;
};

const TABS: { id: HubTab; label: string }[] = [
  { id: "store", label: "Store" },
  { id: "friends", label: "Friends" },
  { id: "achievements", label: "Badges" },
  { id: "updates", label: "History" },
];

export default function LifeHub({
  open,
  tab,
  currency,
  ownedItems,
  equippedRoom,
  equippedToy,
  unlockedAchievements,
  friendStates,
  activeFriendId,
  lifePhase,
  lifespanDays,
  lifeRemaining,
  feederStatus,
  onClose,
  onTab,
  onPurchase,
  onEquip,
  onInvite,
}: LifeHubProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && contentRef.current) contentRef.current.scrollTop = 0;
  }, [open, tab]);

  if (!open) return null;

  const friendMap = new Map(friendStates.map((friend) => [friend.id, friend]));

  return (
    <div className="sheet-backdrop life-hub-backdrop" onClick={onClose}>
      <aside
        className="life-hub"
        aria-modal="true"
        role="dialog"
        aria-labelledby="life-hub-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="life-hub__header">
          <span>
            <span className="eyebrow">BLOB LIFE HUB</span>
            <h2 id="life-hub-title">LIVI&apos;s little world</h2>
          </span>
          <span className="mote-wallet" aria-label={`${currency} Motes available`}>
            <i>✦</i>
            <strong>{currency}</strong>
            Motes
          </span>
          <button className="sheet-close" onClick={onClose} aria-label="Close life hub">
            ×
          </button>
        </header>

        <section className="life-strip" aria-label="LIVI lifespan">
          <span className="life-strip__orb" />
          <span>
            <small>CURRENT LIFE</small>
            <strong>{lifePhase}</strong>
          </span>
          <span>
            <small>EXPECTED SPAN</small>
            <strong>About {lifespanDays} days</strong>
          </span>
          <span>
            <small>TIME REMAINING</small>
            <strong>{lifeRemaining}</strong>
          </span>
        </section>

        <nav className="hub-tabs" aria-label="Life hub sections">
          {TABS.map((item) => (
            <button
              key={item.id}
              className={tab === item.id ? "is-active" : ""}
              onClick={() => onTab(item.id)}
              aria-pressed={tab === item.id}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="hub-content" ref={contentRef}>
          {tab === "store" ? (
            <section aria-label="Blob store">
              <div className="hub-section-heading">
                <span>
                  <span className="eyebrow">BLOB STORE</span>
                  <h3>Care can shape the room, too.</h3>
                </span>
                <p>Earn Motes through care and achievements. Nothing here requires real money.</p>
              </div>
              <div className="store-grid">
                {STORE_ITEMS.map((item) => {
                  const owned = ownedItems.includes(item.id);
                  const equipped =
                    item.id === equippedRoom || item.id === equippedToy;
                  const canAfford = currency >= item.price;
                  return (
                    <article className={`store-card store-card--${item.category}`} key={item.id}>
                      <span className="store-card__glyph">{item.glyph}</span>
                      <span className="store-card__category">{item.category}</span>
                      <h4>{item.name}</h4>
                      <p>{item.description}</p>
                      <small>{item.effect}</small>
                      {item.id === "auto-feeder" && owned ? (
                        <span className="feeder-status">{feederStatus}</span>
                      ) : null}
                      <button
                        onClick={() =>
                          owned ? onEquip(item.id) : onPurchase(item.id)
                        }
                        disabled={!owned && !canAfford}
                      >
                        {equipped
                          ? "Equipped"
                          : owned
                            ? item.category === "room" || item.category === "toy"
                              ? "Equip"
                              : "Owned"
                            : (
                              <>
                                <span>✦</span> {item.price}
                              </>
                            )}
                      </button>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          {tab === "friends" ? (
            <section aria-label="Blob friends">
              <div className="hub-section-heading">
                <span>
                  <span className="eyebrow">NEARBY SIGNALS</span>
                  <h3>Other small lives are out there.</h3>
                </span>
                <p>Friends are discovered through the way LIVI grows and bonds.</p>
              </div>
              <div className="friend-list">
                {FRIENDS.map((friend) => {
                  const state = friendMap.get(friend.id);
                  const active = activeFriendId === friend.id;
                  return (
                    <article className={`friend-card ${state ? "" : "is-locked"}`} key={friend.id}>
                      <span
                        className="friend-card__blob"
                        style={{ "--friend-hue": friend.hue } as React.CSSProperties}
                      >
                        <i />
                        <i />
                      </span>
                      <span className="friend-card__copy">
                        <small>{state ? friend.temperament : "Unknown signal"}</small>
                        <h4>{state ? friend.name : "???"}</h4>
                        <p>{state ? friend.description : friend.unlockHint}</p>
                      </span>
                      {state ? (
                        <span className="friend-card__stats">
                          <small>{state.visits} visits</small>
                          <small>{Math.round(state.bond * 100)}% friendship</small>
                          <button onClick={() => onInvite(friend.id)}>
                            {active ? "Visiting now" : "Invite"}
                          </button>
                        </span>
                      ) : (
                        <span className="friend-card__lock">Locked</span>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          {tab === "achievements" ? (
            <section aria-label="Blob achievements">
              <div className="hub-section-heading">
                <span>
                  <span className="eyebrow">CARE BADGES</span>
                  <h3>Proof of a life shared.</h3>
                </span>
                <p>
                  {unlockedAchievements.length} of {ACHIEVEMENTS.length} discovered
                </p>
              </div>
              <div className="achievement-grid">
                {ACHIEVEMENTS.map((achievement) => {
                  const unlocked = unlockedAchievements.includes(achievement.id);
                  return (
                    <article className={unlocked ? "is-unlocked" : ""} key={achievement.id}>
                      <span>{achievement.glyph}</span>
                      <small>{unlocked ? "DISCOVERED" : `+${achievement.reward} MOTES`}</small>
                      <h4>{achievement.name}</h4>
                      <p>{achievement.description}</p>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          {tab === "updates" ? (
            <section aria-label="LIVI update history">
              <div className="hub-section-heading">
                <span>
                  <span className="eyebrow">UPDATE HISTORY</span>
                  <h3>Every past version stays visible.</h3>
                </span>
                <p>The same history is kept in the public repository changelog.</p>
              </div>
              <div className="update-timeline">
                {UPDATE_HISTORY.map((entry) => (
                  <article key={entry.version}>
                    <span className="update-timeline__version">v{entry.version}</span>
                    <span className="update-timeline__line" />
                    <div>
                      <small>{entry.date}</small>
                      <h4>{entry.title}</h4>
                      <ul>
                        {entry.changes.map((change) => (
                          <li key={change}>{change}</li>
                        ))}
                      </ul>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
