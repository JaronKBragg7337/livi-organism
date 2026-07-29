"use client";

import { useId, useState } from "react";
import type { CommonsFriendship, CommonsProfile } from "./cloud";
import type {
  SaveHistoryEntry,
  SyncConflictSnapshot,
  SyncStatus,
} from "./lifeData";

type AuthMode = "create" | "signin";
type GiftType = "hello" | "nutrient" | "play";
export type ConflictChoice = "local" | "cloud" | "both";

export type CloudCommonsProps = {
  configured: boolean;
  connectedEmail: string | null;
  accountName?: string;
  busy: boolean;
  message: string;
  profiles: CommonsProfile[];
  ownProfileId: number | null;
  friendships: CommonsFriendship[];
  syncStatus?: SyncStatus;
  lastSyncedAt?: number | null;
  deviceName?: string;
  conflictSnapshots?: SyncConflictSnapshot[];
  saveHistory?: SaveHistoryEntry[];
  hasMoreHistory?: boolean;
  cloudLocked?: boolean;
  recoveryCode?: string | null;
  passwordRecoveryMode?: boolean;
  onAuth: (
    mode: AuthMode,
    email: string,
    password: string,
  ) => Promise<void>;
  onRequestPasswordReset?: (email: string) => Promise<void>;
  onUnlockCloud?: (
    method: "password" | "recovery",
    secret: string,
  ) => Promise<void>;
  onAcknowledgeRecoveryCode?: () => void;
  onCompletePasswordRecovery?: (
    method: "password" | "recovery",
    unlockSecret: string,
    newPassword: string,
  ) => Promise<void>;
  onSignOut: () => Promise<void>;
  onPublish: (name: string, visibility: "private" | "public") => Promise<void>;
  onRestore: () => Promise<void>;
  onRestoreVersion?: (versionId: string) => Promise<void>;
  onLoadOlderHistory?: () => Promise<void> | void;
  onResolveConflict?: (choice: ConflictChoice) => Promise<void>;
  onRetrySync?: () => Promise<void>;
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

const SYNC_LABEL: Record<SyncStatus, string> = {
  local: "Saved on this device",
  syncing: "Protecting the latest changes…",
  synced: "Protected in cloud history",
  offline: "Offline · latest life is safe on this device",
  conflict: "Two healthy timelines need your choice",
  error: "Cloud paused · local save is safe",
};

function formatMoment(timestamp?: number | null) {
  if (!timestamp) return "Not synced yet";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

export default function CloudCommons({
  configured,
  connectedEmail,
  accountName,
  busy,
  message,
  profiles,
  ownProfileId,
  friendships,
  syncStatus = connectedEmail ? "synced" : "local",
  lastSyncedAt = null,
  deviceName = "This device",
  conflictSnapshots = [],
  saveHistory = [],
  hasMoreHistory = false,
  cloudLocked = false,
  recoveryCode = null,
  passwordRecoveryMode = false,
  onAuth,
  onRequestPasswordReset,
  onUnlockCloud,
  onAcknowledgeRecoveryCode,
  onCompletePasswordRecovery,
  onSignOut,
  onPublish,
  onRestore,
  onRestoreVersion,
  onLoadOlderHistory,
  onResolveConflict,
  onRetrySync,
  onRefresh,
  onVisit,
  onFriend,
  onAnswerFriend,
  onExport,
  onImport,
}: CloudCommonsProps) {
  const emailId = useId();
  const passwordId = useId();
  const [authMode, setAuthMode] = useState<AuthMode>("create");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [profileName, setProfileName] = useState(accountName || "Livi");
  const [visibility, setVisibility] = useState<"private" | "public">("public");
  const [unlockMethod, setUnlockMethod] = useState<"password" | "recovery">(
    "password",
  );
  const [unlockSecret, setUnlockSecret] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [copiedRecovery, setCopiedRecovery] = useState(false);
  const [downloadedRecovery, setDownloadedRecovery] = useState(false);
  const [recoveryProof, setRecoveryProof] = useState("");
  const [visibleHistoryCount, setVisibleHistoryCount] = useState(12);

  const incoming = friendships.filter(
    (friendship) =>
      friendship.addressee_profile_id === ownProfileId &&
      friendship.status === "pending",
  );

  if (!configured) {
    return (
      <section className="commons-empty" aria-label="Cloud continuity unavailable">
        <span aria-hidden="true">☁</span>
        <h3>This life is safe on this device.</h3>
        <p>
          Optional cloud continuity is not connected on this host. Local play,
          memories, and exports still work without an account.
        </p>
        <button onClick={onExport}>Download a recovery file</button>
      </section>
    );
  }

  return (
    <section aria-label="Account, sync, and Blob Commons">
      <div className="hub-section-heading">
        <span>
          <span className="eyebrow">CONTINUITY &amp; COMMONS</span>
          <h3>A life that can come home.</h3>
        </span>
        <p>
          Accounts are optional. Camera frames, room imagery, and precise
          location never enter cloud memory.
        </p>
      </div>

      <div
        className={`cloud-status cloud-status--${syncStatus}`}
        role="status"
        aria-live="polite"
      >
        <span className={connectedEmail ? "is-connected" : ""} aria-hidden="true" />
        <span>
          <strong>{SYNC_LABEL[syncStatus]}</strong>
          <small>
            {message ||
              (connectedEmail
                ? `${deviceName} · ${formatMoment(lastSyncedAt)}`
                : "Instant local play remains on. Sign in only for multi-device recovery.")}
          </small>
        </span>
        {(syncStatus === "offline" || syncStatus === "error") && onRetrySync ? (
          <button disabled={busy} onClick={() => void onRetrySync()}>
            Try again
          </button>
        ) : null}
      </div>

      {syncStatus === "conflict" && conflictSnapshots.length >= 2 ? (
        <section className="sync-conflict" aria-labelledby="sync-conflict-title">
          <span className="sync-conflict__mark" aria-hidden="true">⌁</span>
          <div>
            <span className="eyebrow">NOTHING WILL BE DELETED AUTOMATICALLY</span>
            <h4 id="sync-conflict-title">Two timelines are both worth keeping.</h4>
            <p>
              Compare them, then choose. “Preserve both” keeps one as the active
              life and archives the other in restore history.
            </p>
          </div>
          <div className="sync-conflict__snapshots">
            {conflictSnapshots.slice(0, 2).map((snapshot) => (
              <article key={snapshot.id}>
                <small>{snapshot.source === "local" ? "THIS DEVICE" : "CLOUD HISTORY"}</small>
                <strong>Generation {snapshot.generation}</strong>
                <span>{snapshot.livingCells} cells · {Math.round(snapshot.bond * 100)}% bond</span>
                <span>{formatMoment(snapshot.savedAt)} · {snapshot.deviceName}</span>
                <p>{snapshot.note}</p>
              </article>
            ))}
          </div>
          <div className="sync-conflict__actions">
            <button disabled={busy || !onResolveConflict} onClick={() => void onResolveConflict?.("local")}>
              Keep this device
            </button>
            <button disabled={busy || !onResolveConflict} onClick={() => void onResolveConflict?.("cloud")}>
              Use cloud version
            </button>
            <button
              className="is-primary"
              disabled={busy || !onResolveConflict}
              onClick={() => void onResolveConflict?.("both")}
            >
              Preserve both
            </button>
          </div>
        </section>
      ) : null}

      {!connectedEmail ? (
        <form
          className="cloud-auth"
          onSubmit={(event) => {
            event.preventDefault();
            void onAuth(authMode, email.trim(), password);
          }}
        >
          <div>
            <span className="eyebrow">OPTIONAL ACCOUNT</span>
            <h4>{authMode === "create" ? "Protect this living history" : "Welcome back"}</h4>
            <p>
              Sign in for end-to-end encrypted revision history and
              cross-device recovery. Play never requires an account.
            </p>
          </div>
          <label htmlFor={emailId}>
            Email
            <input
              id={emailId}
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label htmlFor={passwordId}>
            Password
            <input
              id={passwordId}
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
                ? "Create protected account"
                : "Sign in & inspect saves"}
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
              ? "Already protected? Sign in"
              : "New keeper? Create an account"}
          </button>
          {authMode === "signin" && onRequestPasswordReset ? (
            <button
              className="cloud-auth__reset"
              type="button"
              disabled={busy || !email.trim()}
              onClick={() => void onRequestPasswordReset(email.trim())}
            >
              Send password reset
            </button>
          ) : null}
        </form>
      ) : (
        <>
          <div className="cloud-account">
            <span className="cloud-account__avatar" aria-hidden="true">●</span>
            <span>
              <small>SIGNED IN · AUTOMATIC HISTORY ON</small>
              <strong>{accountName || connectedEmail}</strong>
              <span>{connectedEmail}</span>
            </span>
            <button className="is-quiet" onClick={() => void onSignOut()}>
              Sign out on this device
            </button>
          </div>
          {recoveryCode ? (
            <section className="cloud-recovery-code" aria-labelledby="recovery-code-title">
              <span aria-hidden="true">◇</span>
              <div>
                <small>SHOWN ONCE · NOT STORED BY LIVI</small>
                <h4 id="recovery-code-title">Keep this recovery code somewhere safe.</h4>
                <p>
                  It can unlock the encrypted life history if every trusted
                  device and the account password are unavailable.
                </p>
                <code>{recoveryCode}</code>
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(recoveryCode)
                        .then(() => setCopiedRecovery(true));
                    }}
                  >
                    {copiedRecovery ? "Copied" : "Copy code"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const url = URL.createObjectURL(
                        new Blob(
                          [
                            "LIVI encrypted history recovery code\n\n",
                            recoveryCode,
                            "\n\nKeep this private. LIVI cannot retrieve it for you.\n",
                          ],
                          { type: "text/plain" },
                        ),
                      );
                      const anchor = document.createElement("a");
                      anchor.href = url;
                      anchor.download = "livi-recovery-code.txt";
                      anchor.click();
                      URL.revokeObjectURL(url);
                      setDownloadedRecovery(true);
                    }}
                  >
                    Download
                  </button>
                  <label className="cloud-recovery-code__proof">
                    Confirm the code
                    <input
                      autoComplete="off"
                      spellCheck={false}
                      value={recoveryProof}
                      onChange={(event) => setRecoveryProof(event.target.value)}
                      placeholder="Paste the full recovery code"
                    />
                  </label>
                  <button
                    className="is-primary"
                    type="button"
                    disabled={
                      !downloadedRecovery &&
                      recoveryProof.trim().toUpperCase() !==
                        recoveryCode.trim().toUpperCase()
                    }
                    onClick={onAcknowledgeRecoveryCode}
                  >
                    {downloadedRecovery
                      ? "Recovery kit downloaded"
                      : "Code confirmed"}
                  </button>
                </div>
              </div>
            </section>
          ) : null}
          {passwordRecoveryMode && onCompletePasswordRecovery ? (
            <form
              className="cloud-unlock cloud-password-recovery"
              onSubmit={(event) => {
                event.preventDefault();
                void onCompletePasswordRecovery(
                  unlockMethod,
                  unlockSecret,
                  newPassword,
                ).then(() => {
                  setUnlockSecret("");
                  setNewPassword("");
                });
              }}
            >
              <div>
                <small>SAFE PASSWORD RECOVERY</small>
                <h4>Change the login without abandoning the save key</h4>
                <p>
                  Prove access with the previous password or recovery code.
                  LIVI will rewrap the same private key, so every old revision
                  remains decryptable.
                </p>
              </div>
              <div className="cloud-unlock__methods" role="group" aria-label="Save-key proof">
                <button
                  type="button"
                  className={unlockMethod === "recovery" ? "is-active" : ""}
                  onClick={() => setUnlockMethod("recovery")}
                >
                  Recovery code
                </button>
                <button
                  type="button"
                  className={unlockMethod === "password" ? "is-active" : ""}
                  onClick={() => setUnlockMethod("password")}
                >
                  Previous password
                </button>
              </div>
              <label>
                {unlockMethod === "recovery" ? "Recovery code" : "Previous password"}
                <input
                  type={unlockMethod === "password" ? "password" : "text"}
                  autoComplete="off"
                  value={unlockSecret}
                  onChange={(event) => setUnlockSecret(event.target.value)}
                  required
                />
              </label>
              <label>
                New account password
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                />
              </label>
              <button
                className="is-primary"
                disabled={busy || !unlockSecret || newPassword.length < 8}
              >
                Protect history with new password
              </button>
            </form>
          ) : null}
          {cloudLocked && !passwordRecoveryMode && onUnlockCloud ? (
            <form
              className="cloud-unlock"
              onSubmit={(event) => {
                event.preventDefault();
                void onUnlockCloud(unlockMethod, unlockSecret).then(() =>
                  setUnlockSecret(""),
                );
              }}
            >
              <div>
                <small>ZERO-KNOWLEDGE HISTORY LOCK</small>
                <h4>Unlock this organism&apos;s encrypted history</h4>
                <p>
                  This device has your signed-in session, but not the private
                  save key. Use the account password or the one-time recovery code.
                </p>
              </div>
              <div className="cloud-unlock__methods" role="group" aria-label="Unlock method">
                <button
                  type="button"
                  className={unlockMethod === "password" ? "is-active" : ""}
                  onClick={() => setUnlockMethod("password")}
                >
                  Password
                </button>
                <button
                  type="button"
                  className={unlockMethod === "recovery" ? "is-active" : ""}
                  onClick={() => setUnlockMethod("recovery")}
                >
                  Recovery code
                </button>
              </div>
              <label>
                {unlockMethod === "password" ? "Account password" : "Recovery code"}
                <input
                  type={unlockMethod === "password" ? "password" : "text"}
                  autoComplete={unlockMethod === "password" ? "current-password" : "off"}
                  value={unlockSecret}
                  onChange={(event) => setUnlockSecret(event.target.value)}
                  required
                />
              </label>
              <button className="is-primary" disabled={busy || !unlockSecret}>
                Unlock encrypted history
              </button>
            </form>
          ) : null}
          <div className="cloud-controls">
            <label>
              Commons name
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
                <option value="public">Share trait-only profile</option>
                <option value="private">Keep organism private</option>
              </select>
            </label>
            <button disabled={busy} onClick={() => void onPublish(profileName.trim(), visibility)}>
              Save profile
            </button>
          </div>
        </>
      )}

      {connectedEmail ? (
        <section className="save-history" aria-labelledby="save-history-title">
          <div className="commons-heading">
            <span>
              <span className="eyebrow">RESTORE HISTORY</span>
              <strong id="save-history-title">Every turning point stays recoverable</strong>
            </span>
            <button disabled={busy} onClick={() => void onRestore()}>
              Restore latest
            </button>
          </div>
          {saveHistory.length ? (
            <>
              <ol>
                {saveHistory.slice(0, visibleHistoryCount).map((entry, index) => (
                  <li key={entry.id}>
                    <span className="save-history__node" aria-hidden="true" />
                    <span>
                      <small>{index === 0 ? "LATEST PROTECTED SAVE" : entry.reason.toUpperCase()}</small>
                      <strong>{entry.lifePhase} · Generation {entry.generation}</strong>
                      <span>
                        {entry.livingCells} cells · {Math.round(entry.bond * 100)}% bond
                      </span>
                      <time dateTime={new Date(entry.savedAt).toISOString()}>
                        {formatMoment(entry.savedAt)}
                        {entry.deviceName ? ` · ${entry.deviceName}` : ""}
                      </time>
                    </span>
                    <button
                      disabled={busy || !onRestoreVersion}
                      onClick={() => void onRestoreVersion?.(entry.id)}
                      aria-label={`Restore save from ${formatMoment(entry.savedAt)}`}
                    >
                      Restore
                    </button>
                  </li>
                ))}
              </ol>
              {visibleHistoryCount < saveHistory.length || hasMoreHistory ? (
                <button
                  className="save-history__more"
                  type="button"
                  onClick={() => {
                    if (visibleHistoryCount < saveHistory.length) {
                      setVisibleHistoryCount((count) =>
                        Math.min(count + 12, saveHistory.length),
                      );
                    } else {
                      void onLoadOlderHistory?.();
                    }
                  }}
                >
                  Load older protected revisions
                </button>
              ) : null}
            </>
          ) : (
            <p className="empty-journal">
              Meaningful care events will appear here after the first automatic sync.
            </p>
          )}
        </section>
      ) : null}

      <div className="recovery-tools">
        <button onClick={onExport}>Download recovery file</button>
        <label>
          Import recovery file
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
        <small>
          Files stay on your device until you choose one. Import always creates a
          restore point before changing the active life.
        </small>
      </div>

      {incoming.length ? (
        <div className="friend-inbox">
          <span className="eyebrow">FRIEND REQUESTS</span>
          {incoming.map((friendship) => (
            <article key={friendship.id}>
              <span>A neighboring blob wants to remember this connection.</span>
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
          <span className="eyebrow">BLOB COMMONS</span>
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
