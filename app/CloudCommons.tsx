"use client";

import { useState } from "react";
import type { CommonsFriendship, CommonsProfile } from "./cloud";

type AuthMode = "create" | "signin";
type GiftType = "hello" | "nutrient" | "play";

type CloudCommonsProps = {
  configured: boolean;
  connectedEmail: string | null;
  busy: boolean;
  message: string;
  profiles: CommonsProfile[];
  ownProfileId: number | null;
  friendships: CommonsFriendship[];
  onAuth: (
    mode: AuthMode,
    email: string,
    password: string,
  ) => Promise<void>;
  onSignOut: () => Promise<void>;
  onPublish: (name: string, visibility: "private" | "public") => Promise<void>;
  onRestore: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onVisit: (profileId: number, gift: GiftType) => Promise<void>;
  onFriend: (profileId: number) => Promise<void>;
  onAnswerFriend: (
    friendshipId: number,
    answer: "accepted" | "declined",
  ) => Promise<void>;
  onExport: () => void;
  onImport: (file: File) => Promise<void>;
};

export default function CloudCommons({
  configured,
  connectedEmail,
  busy,
  message,
  profiles,
  ownProfileId,
  friendships,
  onAuth,
  onSignOut,
  onPublish,
  onRestore,
  onRefresh,
  onVisit,
  onFriend,
  onAnswerFriend,
  onExport,
  onImport,
}: CloudCommonsProps) {
  const [authMode, setAuthMode] = useState<AuthMode>("create");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [profileName, setProfileName] = useState("Livi");
  const [visibility, setVisibility] = useState<"private" | "public">("public");

  const incoming = friendships.filter(
    (friendship) =>
      friendship.addressee_profile_id === ownProfileId &&
      friendship.status === "pending",
  );

  if (!configured) {
    return (
      <section className="commons-empty" aria-label="Blob Commons unavailable">
        <span>☁</span>
        <h3>Local life is fully available.</h3>
        <p>
          This host has not connected the optional LIVI cloud. Your organism
          remains private and saved on this device.
        </p>
        <button onClick={onExport}>Export local organism</button>
      </section>
    );
  }

  return (
    <section aria-label="Blob Commons">
      <div className="hub-section-heading">
        <span>
          <span className="eyebrow">BLOB COMMONS</span>
          <h3>A quiet public habitat.</h3>
        </span>
        <p>
          Public profiles contain organism traits—not email, camera, room
          imagery, or location.
        </p>
      </div>

      <div className="cloud-status" role="status" aria-live="polite">
        <span className={connectedEmail ? "is-connected" : ""} />
        {message ||
          (connectedEmail
            ? `Cloud recovery linked to ${connectedEmail}`
            : "Local-only play. Link an account only if you want recovery or publishing.")}
      </div>

      {!connectedEmail ? (
        <form
          className="cloud-auth"
          onSubmit={(event) => {
            event.preventDefault();
            void onAuth(authMode, email, password);
          }}
        >
          <div>
            <span className="eyebrow">OPTIONAL CLOUD IDENTITY</span>
            <h4>{authMode === "create" ? "Protect this life" : "Return to a saved life"}</h4>
            <p>
              Browser play stays available without an account. Use email only
              for cross-device recovery and Commons participation.
            </p>
          </div>
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete={authMode === "create" ? "new-password" : "current-password"}
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <button disabled={busy} type="submit">
            {busy
              ? "Connecting…"
              : authMode === "create"
                ? "Create recovery account"
                : "Sign in"}
          </button>
          <button
            className="cloud-auth__switch"
            type="button"
            onClick={() =>
              setAuthMode((current) =>
                current === "create" ? "signin" : "create",
              )
            }
          >
            {authMode === "create"
              ? "Already linked? Sign in"
              : "New here? Create account"}
          </button>
        </form>
      ) : (
        <div className="cloud-controls">
          <label>
            Public name
            <input
              maxLength={24}
              value={profileName}
              onChange={(event) => setProfileName(event.target.value)}
            />
          </label>
          <label>
            Visibility
            <select
              value={visibility}
              onChange={(event) =>
                setVisibility(event.target.value as "private" | "public")
              }
            >
              <option value="public">Visible in Commons</option>
              <option value="private">Private cloud backup</option>
            </select>
          </label>
          <button disabled={busy} onClick={() => void onPublish(profileName, visibility)}>
            Save &amp; publish
          </button>
          <button disabled={busy} onClick={() => void onRestore()}>
            Restore cloud save
          </button>
          <button className="is-quiet" onClick={() => void onSignOut()}>
            Sign out locally
          </button>
        </div>
      )}

      <div className="recovery-tools">
        <button onClick={onExport}>Download organism file</button>
        <label>
          Import organism file
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onImport(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
        <small>Manual files work without cloud access and never leave your device.</small>
      </div>

      {incoming.length ? (
        <div className="friend-inbox">
          <span className="eyebrow">FRIEND REQUESTS</span>
          {incoming.map((friendship) => (
            <article key={friendship.id}>
              <span>A neighboring blob wants to stay connected.</span>
              <button onClick={() => void onAnswerFriend(friendship.id, "accepted")}>
                Accept
              </button>
              <button onClick={() => void onAnswerFriend(friendship.id, "declined")}>
                Decline
              </button>
            </article>
          ))}
        </div>
      ) : null}

      <div className="commons-heading">
        <span>
          <span className="eyebrow">RECENT SIGNALS</span>
          <strong>{profiles.length} public organisms nearby</strong>
        </span>
        <button disabled={busy} onClick={() => void onRefresh()}>
          Refresh
        </button>
      </div>

      <div className="commons-grid">
        {profiles.map((profile) => {
          const isOwn = profile.id === ownProfileId;
          return (
            <article className="commons-card" key={profile.id}>
              <span
                className={`commons-card__blob room-swatch--${profile.room_id}`}
                aria-hidden="true"
              >
                <i />
                <i />
              </span>
              <small>{profile.life_phase} · {profile.living_cells} cells</small>
              <h4>{profile.display_name}</h4>
              <p>{profile.phenotype}</p>
              <div>
                <span>{Math.round(profile.bond * 100)}% bond</span>
                <span>{profile.visitCount} visits</span>
                <span>{profile.achievements.length} badges</span>
              </div>
              {isOwn ? (
                <strong className="commons-card__own">Your public signal</strong>
              ) : connectedEmail && ownProfileId ? (
                <span className="commons-card__actions">
                  <button onClick={() => void onVisit(profile.id, "nutrient")}>
                    Gift nutrient
                  </button>
                  <button onClick={() => void onVisit(profile.id, "play")}>
                    Play visit
                  </button>
                  <button onClick={() => void onFriend(profile.id)}>
                    Add friend
                  </button>
                </span>
              ) : (
                <small>Link and publish your blob to visit.</small>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
