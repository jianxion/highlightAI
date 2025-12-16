// Simple, consistent debug logger.
// Turn on/off via VITE_DEBUG_* env vars.
// Usage: dbg("FEED", "message", data)

const flags = {
  GRAPHQL: import.meta.env.VITE_DEBUG_GRAPHQL === "true",
  FEED: import.meta.env.VITE_DEBUG_FEED === "true",
  PROFILE: import.meta.env.VITE_DEBUG_PROFILE === "true",
} as const;

type FlagKey = keyof typeof flags;

export function dbg(flag: FlagKey, message: string, data?: unknown) {
  if (!flags[flag]) return;
  const prefix = `[${flag}]`;
  if (data !== undefined) console.log(prefix, message, data);
  else console.log(prefix, message);
}

export function dbgError(flag: FlagKey, message: string, err?: unknown) {
  if (!flags[flag]) return;
  const prefix = `[${flag}]`;
  console.error(prefix, message, err);
}
