"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type CommonsProfile = {
  id: number;
  slug: string;
  display_name: string;
  phenotype: string;
  life_phase: string;
  age_minutes: number;
  living_cells: number;
  bond: number;
  room_id: string;
  equipped_toy: string | null;
  achievements: string[];
  traits: Record<string, number>;
  updated_at: string;
  visitCount: number;
};

export type CommonsFriendship = {
  id: number;
  requester_profile_id: number;
  addressee_profile_id: number;
  status: "pending" | "accepted" | "declined";
};

export type CloudCompression = "gzip" | "none";
export type CloudRevisionKind =
  | "periodic"
  | "milestone"
  | "manual"
  | "merge"
  | "restore"
  | "legacy"
  | "migration";

export type CloudEncryptedEnvelope = {
  encryption_algorithm: "AES-GCM-256";
  key_version: number;
  compression: CloudCompression;
  payload_ciphertext: string;
  payload_iv: string;
  payload_checksum: string;
  plaintext_bytes: number;
};

export type CloudKeyring = {
  encryption_version: 1;
  key_version: number;
  kdf_algorithm: "PBKDF2-SHA-256";
  kdf_iterations: number;
  password_salt: string;
  password_wrapped_key: string;
  password_wrap_iv: string;
  recovery_salt: string;
  recovery_wrapped_key: string;
  recovery_wrap_iv: string;
};

export type CloudAccountMetadata = CloudKeyring & {
  owner_id: string;
  active_generation: number;
  autosave_enabled: boolean;
  legacy_migrated_at?: string | null;
  updated_at?: string;
  created_at?: string;
};

export type CloudRevision = CloudEncryptedEnvelope & {
  revision_id: string;
  owner_id: string;
  client_revision_id: string;
  device_id: string;
  parent_revision_id: string | null;
  merge_parent_revision_id: string | null;
  restored_from_revision_id: string | null;
  generation: number;
  save_version: number;
  revision_kind: CloudRevisionKind;
  sync_status: "accepted" | "conflict";
  milestone_type: string | null;
  device_timestamp: string | null;
  created_at: string;
};

export type CloudHead = {
  owner_id: string;
  revision_id: string | null;
  revision_count: number;
  conflict_count: number;
  updated_at: string;
};

export type CloudPushResult = {
  status: "accepted" | "conflict" | "idempotent";
  revision_id: string;
  revision_status: "accepted" | "conflict";
  head_revision_id: string | null;
  conflicting_revision_id?: string | null;
};

export type CloudPushInput = {
  ownerId: string;
  revisionId?: string;
  clientRevisionId: string;
  deviceId: string;
  parentRevisionId: string | null;
  mergeParentRevisionId?: string | null;
  restoredFromRevisionId?: string | null;
  generation: number;
  saveVersion: number;
  revisionKind: CloudRevisionKind;
  milestoneType?: string | null;
  keyVersion: number;
  deviceTimestamp?: string;
};

export type CloudMemoryEpisodeInput = {
  ownerId: string;
  eventId?: string;
  clientEventId: string;
  deviceId: string;
  generation: number;
  eventType: string;
  importance: 1 | 2 | 3 | 4 | 5;
  occurredAt: string;
  keyVersion: number;
};

export type CloudRoutineSummaryInput = {
  ownerId: string;
  summaryId?: string;
  clientSummaryId: string;
  deviceId: string;
  supersedesSummaryId?: string | null;
  summaryDay: string;
  generation: number;
  keyVersion: number;
};

export type CloudMemoryEpisode = CloudEncryptedEnvelope & {
  event_id: string;
  owner_id: string;
  client_event_id: string;
  device_id: string;
  generation: number;
  event_type: string;
  importance: 1 | 2 | 3 | 4 | 5;
  occurred_at: string;
  created_at: string;
};

export type CloudRoutineSummary = CloudEncryptedEnvelope & {
  summary_id: string;
  owner_id: string;
  client_summary_id: string;
  device_id: string;
  supersedes_summary_id: string | null;
  summary_day: string;
  generation: number;
  created_at: string;
};

let browserClient: SupabaseClient | null = null;
const volatileKeys = new Map<string, { keyVersion: number; syncKey: CryptoKey }>();
const KEY_DATABASE = "livi-private-keys-v1";
const KEY_STORE = "sync-keys";
const KDF_ITERATIONS = 600_000;
const ENCRYPTION_CONTEXT = new TextEncoder().encode("LIVI:CLOUD:V1");

export function cloudConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

export function getCloudClient() {
  if (browserClient) return browserClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error("The optional LIVI cloud is not configured on this host.");
  }
  browserClient = createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  });
  return browserClient;
}

export async function checksumJson(value: unknown) {
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function base64UrlToBytes(value: string) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function ownedBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  return value;
}

async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", ownedBytes(bytes));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function deriveWrappingKey(
  secret: string,
  salt: Uint8Array,
  iterations: number,
) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: ownedBytes(salt),
      iterations,
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function wrapRawKey(rawKey: Uint8Array, wrappingKey: CryptoKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: ENCRYPTION_CONTEXT },
    wrappingKey,
    ownedBytes(rawKey),
  );
  return {
    wrappedKey: bytesToBase64Url(new Uint8Array(ciphertext)),
    iv: bytesToBase64Url(iv),
  };
}

async function unwrapRawKey(
  wrappedKey: string,
  iv: string,
  wrappingKey: CryptoKey,
) {
  const rawKey = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64UrlToBytes(iv),
      additionalData: ENCRYPTION_CONTEXT,
    },
    wrappingKey,
    base64UrlToBytes(wrappedKey),
  );
  return new Uint8Array(rawKey);
}

function makeRecoveryCode() {
  const random = crypto.getRandomValues(new Uint8Array(24));
  return `LIVI-${bytesToBase64Url(random)}`;
}

/**
 * Creates a random save key with two independent recovery paths. The recovery
 * code is returned once and must be shown to the owner; it is never uploaded.
 */
export async function createCloudKeyring(password: string) {
  if (password.length < 8) {
    throw new Error("Use at least 8 characters to protect LIVI's cloud key.");
  }
  const rawDataKey = crypto.getRandomValues(new Uint8Array(32));
  const passwordSalt = crypto.getRandomValues(new Uint8Array(16));
  const recoverySalt = crypto.getRandomValues(new Uint8Array(16));
  const recoveryCode = makeRecoveryCode();
  const [passwordKey, recoveryKey] = await Promise.all([
    deriveWrappingKey(password, passwordSalt, KDF_ITERATIONS),
    deriveWrappingKey(recoveryCode, recoverySalt, KDF_ITERATIONS),
  ]);
  const [passwordWrap, recoveryWrap] = await Promise.all([
    wrapRawKey(rawDataKey, passwordKey),
    wrapRawKey(rawDataKey, recoveryKey),
  ]);
  const syncKey = await crypto.subtle.importKey(
    "raw",
    rawDataKey,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
  rawDataKey.fill(0);
  return {
    syncKey,
    recoveryCode,
    keyring: {
      encryption_version: 1,
      key_version: 1,
      kdf_algorithm: "PBKDF2-SHA-256",
      kdf_iterations: KDF_ITERATIONS,
      password_salt: bytesToBase64Url(passwordSalt),
      password_wrapped_key: passwordWrap.wrappedKey,
      password_wrap_iv: passwordWrap.iv,
      recovery_salt: bytesToBase64Url(recoverySalt),
      recovery_wrapped_key: recoveryWrap.wrappedKey,
      recovery_wrap_iv: recoveryWrap.iv,
    } satisfies CloudKeyring,
  };
}

async function unlockKeyring(
  secret: string,
  salt: string,
  wrappedKey: string,
  iv: string,
  iterations: number,
) {
  try {
    const wrappingKey = await deriveWrappingKey(
      secret,
      base64UrlToBytes(salt),
      iterations,
    );
    const rawDataKey = await unwrapRawKey(wrappedKey, iv, wrappingKey);
    const syncKey = await crypto.subtle.importKey(
      "raw",
      rawDataKey,
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"],
    );
    rawDataKey.fill(0);
    return syncKey;
  } catch {
    throw new Error("That credential could not unlock LIVI's encrypted history.");
  }
}

export function unlockCloudKeyWithPassword(
  password: string,
  keyring: CloudKeyring,
) {
  return unlockKeyring(
    password,
    keyring.password_salt,
    keyring.password_wrapped_key,
    keyring.password_wrap_iv,
    keyring.kdf_iterations,
  );
}

export function unlockCloudKeyWithRecoveryCode(
  recoveryCode: string,
  keyring: CloudKeyring,
) {
  return unlockKeyring(
    recoveryCode,
    keyring.recovery_salt,
    keyring.recovery_wrapped_key,
    keyring.recovery_wrap_iv,
    keyring.kdf_iterations,
  );
}

export async function getCloudAccountMetadata() {
  const { data, error } = await getCloudClient()
    .from("cloud_account_metadata")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data as CloudAccountMetadata | null;
}

async function appendKeyringRevision(
  ownerId: string,
  keyring: CloudKeyring,
  reason:
    | "provisioned"
    | "before-password-change"
    | "password-changed",
) {
  const { error } = await getCloudClient()
    .from("cloud_keyring_revisions")
    .insert({ owner_id: ownerId, reason, ...keyring });
  if (error) throw error;
}

async function unlockFromKeyringHistory(
  ownerId: string,
  secret: string,
  method: "password" | "recovery",
) {
  const { data, error } = await getCloudClient()
    .from("cloud_keyring_revisions")
    .select("*")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  for (const row of data ?? []) {
    try {
      const historical = row as CloudKeyring;
      const syncKey =
        method === "password"
          ? await unlockCloudKeyWithPassword(secret, historical)
          : await unlockCloudKeyWithRecoveryCode(secret, historical);
      return { syncKey, keyring: historical };
    } catch {
      // Keep walking immutable wrapper history.
    }
  }
  throw new Error(
    "That secret could not unlock the current key or its protected history.",
  );
}

/**
 * First-device setup. Existing metadata is never overwritten: repeat calls
 * simply unlock the established keyring with the supplied account password.
 */
export async function provisionCloudEncryption(
  ownerId: string,
  password: string,
  activeGeneration = 1,
) {
  const existing = await getCloudAccountMetadata();
  if (existing) {
    const syncKey = await unlockCloudKeyWithPassword(password, existing);
    await cacheCloudKey(ownerId, existing.key_version, syncKey);
    return { syncKey, keyring: existing, recoveryCode: null };
  }

  const created = await createCloudKeyring(password);
  const { error } = await getCloudClient()
    .from("cloud_account_metadata")
    .insert({
      owner_id: ownerId,
      active_generation: activeGeneration,
      autosave_enabled: true,
      ...created.keyring,
    });
  if (error) {
    if (error.code !== "23505") throw error;
    const raced = await getCloudAccountMetadata();
    if (!raced) throw error;
    const syncKey = await unlockCloudKeyWithPassword(password, raced);
    await cacheCloudKey(ownerId, raced.key_version, syncKey);
    return { syncKey, keyring: raced, recoveryCode: null };
  }
  await appendKeyringRevision(ownerId, created.keyring, "provisioned");
  await cacheCloudKey(ownerId, created.keyring.key_version, created.syncKey);
  return created;
}

export async function unlockAndCacheCloudKey(
  ownerId: string,
  secret: string,
  keyring: CloudKeyring,
  method: "password" | "recovery",
) {
  let syncKey: CryptoKey;
  let unlockedKeyring = keyring;
  try {
    syncKey =
      method === "password"
        ? await unlockCloudKeyWithPassword(secret, keyring)
        : await unlockCloudKeyWithRecoveryCode(secret, keyring);
  } catch {
    const historical = await unlockFromKeyringHistory(
      ownerId,
      secret,
      method,
    );
    syncKey = historical.syncKey;
    unlockedKeyring = historical.keyring;
  }
  await cacheCloudKey(ownerId, unlockedKeyring.key_version, syncKey);
  return syncKey;
}

async function unwrapKeyringRaw(
  secret: string,
  keyring: CloudKeyring,
  method: "password" | "recovery",
) {
  const salt =
    method === "password" ? keyring.password_salt : keyring.recovery_salt;
  const wrapped =
    method === "password"
      ? keyring.password_wrapped_key
      : keyring.recovery_wrapped_key;
  const iv =
    method === "password" ? keyring.password_wrap_iv : keyring.recovery_wrap_iv;
  const wrappingKey = await deriveWrappingKey(
    secret,
    base64UrlToBytes(salt),
    keyring.kdf_iterations,
  );
  return unwrapRawKey(wrapped, iv, wrappingKey);
}

/**
 * Rewraps the unchanged random data key after a password reset. The old
 * password or recovery code is required; existing save ciphertext is untouched.
 */
export async function rewrapCloudKeyPassword(
  ownerId: string,
  keyring: CloudKeyring,
  unlockSecret: string,
  unlockMethod: "password" | "recovery",
  newPassword: string,
) {
  if (newPassword.length < 8) {
    throw new Error("Use at least 8 characters to protect LIVI's cloud key.");
  }
  const rawDataKey = await unwrapKeyringRaw(
    unlockSecret,
    keyring,
    unlockMethod,
  );
  const passwordSalt = crypto.getRandomValues(new Uint8Array(16));
  const passwordKey = await deriveWrappingKey(
    newPassword,
    passwordSalt,
    keyring.kdf_iterations,
  );
  const passwordWrap = await wrapRawKey(rawDataKey, passwordKey);
  const syncKey = await crypto.subtle.importKey(
    "raw",
    rawDataKey,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
  rawDataKey.fill(0);
  await appendKeyringRevision(
    ownerId,
    keyring,
    "before-password-change",
  );
  const nextKeyring: CloudKeyring = {
    ...keyring,
    password_salt: bytesToBase64Url(passwordSalt),
    password_wrapped_key: passwordWrap.wrappedKey,
    password_wrap_iv: passwordWrap.iv,
  };
  const { error } = await getCloudClient()
    .from("cloud_account_metadata")
    .update({
      password_salt: nextKeyring.password_salt,
      password_wrapped_key: nextKeyring.password_wrapped_key,
      password_wrap_iv: nextKeyring.password_wrap_iv,
      updated_at: new Date().toISOString(),
    })
    .eq("owner_id", ownerId);
  if (error) throw error;
  await appendKeyringRevision(ownerId, nextKeyring, "password-changed");
  await cacheCloudKey(ownerId, keyring.key_version, syncKey);
  return syncKey;
}

function openKeyDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Encrypted autosave is unavailable in this browser."));
      return;
    }
    const request = indexedDB.open(KEY_DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(KEY_STORE)) {
        request.result.createObjectStore(KEY_STORE, { keyPath: "ownerId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function cacheCloudKey(
  ownerId: string,
  keyVersion: number,
  syncKey: CryptoKey,
) {
  volatileKeys.set(ownerId, { keyVersion, syncKey });
  try {
    const database = await openKeyDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(KEY_STORE, "readwrite");
      transaction.objectStore(KEY_STORE).put({
        ownerId,
        keyVersion,
        syncKey,
        cachedAt: new Date().toISOString(),
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  } catch {
    // Safari private browsing can deny IndexedDB. The in-memory copy keeps the
    // current session safe; the owner will be asked to unlock after a reload.
  }
}

export async function getCachedCloudKey(
  ownerId: string,
  keyVersion: number,
): Promise<CryptoKey | null> {
  const volatile = volatileKeys.get(ownerId);
  if (volatile?.keyVersion === keyVersion) return volatile.syncKey;
  try {
    const database = await openKeyDatabase();
    const record = await new Promise<{
      keyVersion: number;
      syncKey: CryptoKey;
    } | null>((resolve, reject) => {
      const transaction = database.transaction(KEY_STORE, "readonly");
      const request = transaction.objectStore(KEY_STORE).get(ownerId);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
    database.close();
    if (record?.keyVersion === keyVersion) {
      volatileKeys.set(ownerId, record);
      return record.syncKey;
    }
    return null;
  } catch {
    return null;
  }
}

export async function hasCachedCloudKey(
  ownerId: string,
  keyVersion: number,
) {
  return Boolean(await getCachedCloudKey(ownerId, keyVersion));
}

export async function forgetCachedCloudKey(ownerId: string) {
  volatileKeys.delete(ownerId);
  try {
    const database = await openKeyDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(KEY_STORE, "readwrite");
      transaction.objectStore(KEY_STORE).delete(ownerId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  } catch {
    // The volatile key has still been removed.
  }
}

async function compressBytes(bytes: Uint8Array) {
  if (
    typeof CompressionStream === "undefined" ||
    typeof DecompressionStream === "undefined"
  ) {
    return { bytes, compression: "none" as const };
  }
  const stream = new Blob([bytes.slice().buffer]).stream().pipeThrough(
    new CompressionStream("gzip"),
  );
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
  return compressed.length < bytes.length
    ? { bytes: compressed, compression: "gzip" as const }
    : { bytes, compression: "none" as const };
}

async function decompressBytes(
  bytes: Uint8Array,
  compression: CloudCompression,
) {
  if (compression === "none") return bytes;
  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser cannot open compressed LIVI saves.");
  }
  const stream = new Blob([bytes.slice().buffer]).stream().pipeThrough(
    new DecompressionStream("gzip"),
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function payloadAdditionalData(
  keyVersion: number,
  compression: CloudCompression,
  plaintextBytes: number,
  context: string,
) {
  return new TextEncoder().encode(
    `LIVI:CLOUD:V1:${keyVersion}:${compression}:${plaintextBytes}:${context}`,
  );
}

type EnvelopeContextSource = Partial<
  CloudRevision & CloudMemoryEpisode & CloudRoutineSummary
>;

function envelopeContext(source?: EnvelopeContextSource) {
  if (!source) return "payload";
  if (source.revision_id) {
    return [
      "revision",
      source.owner_id,
      source.revision_id,
      source.client_revision_id,
      source.device_id,
      source.parent_revision_id ?? "",
      source.merge_parent_revision_id ?? "",
      source.restored_from_revision_id ?? "",
      source.generation,
      source.save_version,
      source.revision_kind,
      source.milestone_type ?? "",
      source.device_timestamp ?? "",
    ].join(":");
  }
  if (source.event_id) {
    return [
      "episode",
      source.owner_id,
      source.event_id,
      source.client_event_id,
      source.device_id,
      source.generation,
      source.event_type,
      source.importance,
      source.occurred_at,
    ].join(":");
  }
  if (source.summary_id) {
    return [
      "routine",
      source.owner_id,
      source.summary_id,
      source.client_summary_id,
      source.device_id,
      source.supersedes_summary_id ?? "",
      source.summary_day,
      source.generation,
    ].join(":");
  }
  return "payload";
}

export async function encryptCloudPayload(
  value: unknown,
  syncKey: CryptoKey,
  keyVersion: number,
  context = "payload",
): Promise<CloudEncryptedEnvelope> {
  const plaintext = new TextEncoder().encode(
    JSON.stringify(canonicalize(value)),
  );
  const [packed, checksum] = await Promise.all([
    compressBytes(plaintext),
    sha256Hex(plaintext),
  ]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: payloadAdditionalData(
        keyVersion,
        packed.compression,
        plaintext.length,
        context,
      ),
    },
    syncKey,
    ownedBytes(packed.bytes),
  );
  return {
    encryption_algorithm: "AES-GCM-256",
    key_version: keyVersion,
    compression: packed.compression,
    payload_ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
    payload_iv: bytesToBase64Url(iv),
    payload_checksum: checksum,
    plaintext_bytes: plaintext.length,
  };
}

export async function decryptCloudPayload<T>(
  envelope: CloudEncryptedEnvelope,
  syncKey: CryptoKey,
  context = envelopeContext(envelope as EnvelopeContextSource),
) {
  const packed = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64UrlToBytes(envelope.payload_iv),
      additionalData: payloadAdditionalData(
        envelope.key_version,
        envelope.compression,
        envelope.plaintext_bytes,
        context,
      ),
    },
    syncKey,
    base64UrlToBytes(envelope.payload_ciphertext),
  );
  const plaintext = await decompressBytes(
    new Uint8Array(packed),
    envelope.compression,
  );
  if ((await sha256Hex(plaintext)) !== envelope.payload_checksum) {
    throw new Error("LIVI's save failed its integrity check.");
  }
  if (plaintext.length !== envelope.plaintext_bytes) {
    throw new Error("LIVI's save length failed its integrity check.");
  }
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

export function getOrCreateCloudDeviceId(ownerId: string) {
  const storageKey = `livi-cloud-device-id:${ownerId}`;
  const existing =
    typeof localStorage === "undefined" ? null : localStorage.getItem(storageKey);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(storageKey, id);
  return id;
}

function detectPlatform() {
  if (typeof navigator === "undefined") return "unknown";
  const agent = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/u.test(agent)) return "ios";
  if (/android/u.test(agent)) return "android";
  return "web";
}

export async function enrollCloudDevice(
  ownerId: string,
  label = "LIVI device",
) {
  const client = getCloudClient();
  const id = getOrCreateCloudDeviceId(ownerId);
  const { error } = await client.from("cloud_devices").upsert({
    id,
    owner_id: ownerId,
    label,
    platform: detectPlatform(),
    last_seen_at: new Date().toISOString(),
  });
  if (error) throw error;
  return id;
}

export async function getCloudHead(): Promise<CloudHead | null> {
  const { data, error } = await getCloudClient()
    .from("cloud_save_heads")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data as CloudHead | null;
}

export async function getCloudServerTime() {
  const { data, error } = await getCloudClient().rpc("livi_server_clock");
  if (error) throw error;
  const timestamp = new Date(data as string).getTime();
  if (!Number.isFinite(timestamp)) {
    throw new Error("Cloud time could not be verified.");
  }
  return timestamp;
}

export async function listCloudHistory(
  limit = 30,
  offset = 0,
): Promise<CloudRevision[]> {
  const { data, error } = await getCloudClient()
    .from("cloud_save_revisions")
    .select("*")
    .order("created_at", { ascending: false })
    .range(
      Math.max(0, offset),
      Math.max(0, offset) + Math.min(Math.max(limit, 1), 500) - 1,
    );
  if (error) throw error;
  return (data ?? []) as CloudRevision[];
}

export async function getCloudRevision(
  revisionId: string,
): Promise<CloudRevision | null> {
  const { data, error } = await getCloudClient()
    .from("cloud_save_revisions")
    .select("*")
    .eq("revision_id", revisionId)
    .maybeSingle();
  if (error) throw error;
  return data as CloudRevision | null;
}

export async function listCloudConflicts(): Promise<CloudRevision[]> {
  const client = getCloudClient();
  const [conflicts, merges] = await Promise.all([
    client
      .from("cloud_save_revisions")
      .select("*")
      .eq("sync_status", "conflict")
      .order("created_at", { ascending: false }),
    client
      .from("cloud_save_revisions")
      .select("merge_parent_revision_id")
      .eq("sync_status", "accepted")
      .not("merge_parent_revision_id", "is", null),
  ]);
  if (conflicts.error) throw conflicts.error;
  if (merges.error) throw merges.error;
  const resolved = new Set(
    (merges.data ?? []).map((row) => row.merge_parent_revision_id),
  );
  return ((conflicts.data ?? []) as CloudRevision[]).filter(
    (revision) => !resolved.has(revision.revision_id),
  );
}

export async function pushCloudRevision(
  input: CloudPushInput,
  value: unknown,
  syncKey: CryptoKey,
) {
  const revisionId = input.revisionId ?? crypto.randomUUID();
  const deviceTimestamp =
    input.deviceTimestamp ?? new Date().toISOString();
  const context = envelopeContext({
    owner_id: input.ownerId,
    revision_id: revisionId,
    client_revision_id: input.clientRevisionId,
    device_id: input.deviceId,
    parent_revision_id: input.parentRevisionId,
    merge_parent_revision_id: input.mergeParentRevisionId ?? null,
    restored_from_revision_id: input.restoredFromRevisionId ?? null,
    generation: input.generation,
    save_version: input.saveVersion,
    revision_kind: input.revisionKind,
    milestone_type: input.milestoneType ?? null,
    device_timestamp: deviceTimestamp,
  });
  const envelope = await encryptCloudPayload(
    value,
    syncKey,
    input.keyVersion,
    context,
  );
  const { data, error } = await getCloudClient().rpc("push_cloud_revision", {
    p_revision_id: revisionId,
    p_client_revision_id: input.clientRevisionId,
    p_device_id: input.deviceId,
    p_parent_revision_id: input.parentRevisionId,
    p_merge_parent_revision_id: input.mergeParentRevisionId ?? null,
    p_restored_from_revision_id: input.restoredFromRevisionId ?? null,
    p_generation: input.generation,
    p_save_version: input.saveVersion,
    p_revision_kind: input.revisionKind,
    p_milestone_type: input.milestoneType ?? null,
    p_key_version: input.keyVersion,
    p_compression: envelope.compression,
    p_payload_ciphertext: envelope.payload_ciphertext,
    p_payload_iv: envelope.payload_iv,
    p_payload_checksum: envelope.payload_checksum,
    p_plaintext_bytes: envelope.plaintext_bytes,
    p_device_timestamp: deviceTimestamp,
  });
  if (error) throw error;
  return data as CloudPushResult;
}

export async function appendCloudMemoryEpisode(
  input: CloudMemoryEpisodeInput,
  value: unknown,
  syncKey: CryptoKey,
) {
  const eventId = input.eventId ?? crypto.randomUUID();
  const envelope = await encryptCloudPayload(
    value,
    syncKey,
    input.keyVersion,
    envelopeContext({
      event_id: eventId,
      owner_id: input.ownerId,
      client_event_id: input.clientEventId,
      device_id: input.deviceId,
      generation: input.generation,
      event_type: input.eventType,
      importance: input.importance,
      occurred_at: input.occurredAt,
    }),
  );
  const { error } = await getCloudClient().from("blob_memory_episodes").insert({
    event_id: eventId,
    owner_id: input.ownerId,
    client_event_id: input.clientEventId,
    device_id: input.deviceId,
    generation: input.generation,
    event_type: input.eventType,
    importance: input.importance,
    occurred_at: input.occurredAt,
    ...envelope,
  });
  if (error && error.code !== "23505") throw error;
  return eventId;
}

export async function listCloudMemoryEpisodes(
  limit = 100,
  offset = 0,
): Promise<CloudMemoryEpisode[]> {
  const { data, error } = await getCloudClient()
    .from("blob_memory_episodes")
    .select("*")
    .order("occurred_at", { ascending: false })
    .range(
      Math.max(0, offset),
      Math.max(0, offset) + Math.min(Math.max(limit, 1), 500) - 1,
    );
  if (error) throw error;
  return (data ?? []) as CloudMemoryEpisode[];
}

export async function appendCloudRoutineSummary(
  input: CloudRoutineSummaryInput,
  value: unknown,
  syncKey: CryptoKey,
) {
  const summaryId = input.summaryId ?? crypto.randomUUID();
  const envelope = await encryptCloudPayload(
    value,
    syncKey,
    input.keyVersion,
    envelopeContext({
      summary_id: summaryId,
      owner_id: input.ownerId,
      client_summary_id: input.clientSummaryId,
      device_id: input.deviceId,
      supersedes_summary_id: input.supersedesSummaryId ?? null,
      summary_day: input.summaryDay,
      generation: input.generation,
    }),
  );
  const { error } = await getCloudClient()
    .from("blob_routine_summaries")
    .insert({
      summary_id: summaryId,
      owner_id: input.ownerId,
      client_summary_id: input.clientSummaryId,
      device_id: input.deviceId,
      supersedes_summary_id: input.supersedesSummaryId ?? null,
      summary_day: input.summaryDay,
      generation: input.generation,
      ...envelope,
    });
  if (error && error.code !== "23505") throw error;
  if (error?.code === "23505") {
    const existing = await getCloudClient()
      .from("blob_routine_summaries")
      .select("summary_id,summary_day,generation")
      .eq("owner_id", input.ownerId)
      .eq("client_summary_id", input.clientSummaryId)
      .single();
    if (existing.error) throw existing.error;
    if (
      existing.data.summary_day !== input.summaryDay ||
      existing.data.generation !== input.generation
    ) {
      throw new Error("Routine summary id was reused with different metadata.");
    }
    return existing.data.summary_id as string;
  }
  return summaryId;
}

export async function listCloudRoutineSummaries(
  fromDay?: string,
  offset = 0,
): Promise<CloudRoutineSummary[]> {
  let query = getCloudClient()
    .from("blob_routine_summaries")
    .select("*")
    .order("summary_day", { ascending: false })
    .order("created_at", { ascending: false })
    .range(Math.max(0, offset), Math.max(0, offset) + 399);
  if (fromDay) query = query.gte("summary_day", fromDay);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as CloudRoutineSummary[];
}
