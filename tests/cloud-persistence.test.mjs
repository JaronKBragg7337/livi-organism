import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createCloudKeyring,
  decryptCloudPayload,
  encryptCloudPayload,
  unlockCloudKeyWithPassword,
  unlockCloudKeyWithRecoveryCode,
} from "../app/cloud.ts";

const migrationPath =
  "supabase/migrations/20260729115413_livi_revisioned_cloud_memory.sql";

test("revisioned cloud tables are private, indexed, and append-only", async () => {
  const sql = await readFile(migrationPath, "utf8");
  const tables = [
    "cloud_devices",
    "cloud_account_metadata",
    "cloud_keyring_revisions",
    "cloud_save_revisions",
    "cloud_save_heads",
    "blob_memory_episodes",
    "blob_routine_summaries",
  ];
  for (const table of tables) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql, /unique \(owner_id, client_revision_id\)/);
  assert.match(sql, /for update;/);
  assert.match(sql, /reused with different immutable metadata/i);
  assert.match(sql, /Owners delete migrated plaintext saves/);
  assert.match(sql, /revoke insert, update on public\.cloud_saves/);
  assert.match(sql, /legacy_migrated_at/);
  assert.match(sql, /livi_server_clock/);
  assert.match(sql, /before-password-change/);
  assert.match(sql, /password-changed/);
  assert.match(sql, /sync_status in \('accepted', 'conflict'\)/);
  assert.doesNotMatch(
    sql,
    /grant\s+(?:[^;]*,\s*)?(?:update|delete)[^;]*cloud_save_revisions/i,
  );
  assert.doesNotMatch(
    sql,
    /grant\s+(?:[^;]*,\s*)?(?:update|delete)[^;]*blob_memory_episodes/i,
  );
});

test("private payloads use recoverable application-level encryption", async () => {
  const source = await readFile("app/cloud.ts", "utf8");
  assert.match(source, /AES-GCM-256/);
  assert.match(source, /PBKDF2-SHA-256/);
  assert.match(source, /recovery_wrapped_key/);
  assert.match(source, /CompressionStream/);
  assert.match(source, /indexedDB\.open/);
  assert.match(source, /payload_ciphertext/);
  assert.match(source, /\.range\(/);
  assert.match(source, /getCloudRevision/);
  assert.doesNotMatch(source, /SERVICE_ROLE|service_role/);
});

test("recovery and continuity UI require proof and persist care immediately", async () => {
  const [commons, companion] = await Promise.all([
    readFile("app/CloudCommons.tsx", "utf8"),
    readFile("app/LiviCompanion.tsx", "utf8"),
  ]);
  assert.match(commons, /Paste the full recovery code/);
  assert.match(commons, /downloadedRecovery/);
  assert.match(companion, /RECOVERY_CODE_SESSION_KEY/);
  assert.match(companion, /persistLocalOrganism\(organism, localOwnerRef\.current\)/);
  assert.match(companion, /5 \* 60_000/);
  assert.match(companion, /preserveMonotonicContinuity\(\s*organism,/);
});

test("password and one-time recovery paths decrypt the same authenticated life", async () => {
  const password = "correct horse cell battery";
  const created = await createCloudKeyring(password);
  const life = {
    generation: 4,
    cells: [{ alive: true, energy: 0.63 }],
    memories: ["collapse", "pulse-scar", "legacy"],
  };
  const envelope = await encryptCloudPayload(
    life,
    created.syncKey,
    created.keyring.key_version,
  );
  const [passwordKey, recoveryKey] = await Promise.all([
    unlockCloudKeyWithPassword(password, created.keyring),
    unlockCloudKeyWithRecoveryCode(
      created.recoveryCode,
      created.keyring,
    ),
  ]);
  assert.deepEqual(
    await decryptCloudPayload(envelope, passwordKey),
    life,
  );
  assert.deepEqual(
    await decryptCloudPayload(envelope, recoveryKey),
    life,
  );
  await assert.rejects(
    unlockCloudKeyWithPassword("wrong password", created.keyring),
    /could not unlock/i,
  );
});

test("authenticated envelope metadata cannot be changed undetected", async () => {
  const created = await createCloudKeyring("another strong password");
  const envelope = await encryptCloudPayload(
    { bond: 0.82, lineage: 3 },
    created.syncKey,
    created.keyring.key_version,
  );
  await assert.rejects(
    decryptCloudPayload(
      { ...envelope, plaintext_bytes: envelope.plaintext_bytes + 1 },
      created.syncKey,
    ),
  );
  const bound = await encryptCloudPayload(
    { lineage: 3 },
    created.syncKey,
    created.keyring.key_version,
    "revision:owner-a:revision-a:parent-a:generation-3",
  );
  await assert.rejects(
    decryptCloudPayload(
      bound,
      created.syncKey,
      "revision:owner-a:revision-b:parent-a:generation-3",
    ),
  );
});
