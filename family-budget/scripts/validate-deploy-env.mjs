import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
export function validateDeployEnv(env) {
  const url = env.VITE_SUPABASE_URL?.trim();
  const key = env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !key)
    throw new Error(
      "Set repository variables VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY before deploying.",
    );
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid Supabase URL.");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  )
    throw new Error(
      "Supabase URL must use HTTPS and contain no credentials or query parameters.",
    );
  if (key.startsWith("sb_publishable_")) return;
  try {
    if (
      JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString())
        .role === "anon"
    )
      return;
  } catch {
    /* Reject keys that are neither publishable nor legacy anon. */
  }
  throw new Error(
    "Only a public publishable/anon key is allowed. Never use a secret or service_role key.",
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    validateDeployEnv(process.env);
    console.log("Public deployment configuration validated.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
