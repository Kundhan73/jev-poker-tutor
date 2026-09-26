import { TypeSafeClient } from "@typesafe-ai/sdk";

let client: TypeSafeClient | null | undefined;

/** Server-side Jev client, or null when no TYPESAFE_API_KEY is configured (math-only mode). */
export function jevClient(): TypeSafeClient | null {
  if (client !== undefined) return client;
  const key = process.env.TYPESAFE_API_KEY?.trim();
  client = key
    ? new TypeSafeClient({
        apiKey: key,
        // Pin via TYPESAFE_DEFAULT_MODEL (e.g. jev-1.13.0) so thresholds don't drift silently
        defaultModel: process.env.TYPESAFE_DEFAULT_MODEL?.trim() || "jev-latest",
        timeout: 8000,
        retry: { maxRetries: 1 },
      })
    : null;
  return client;
}
