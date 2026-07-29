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

let browserClient: SupabaseClient | null = null;

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
