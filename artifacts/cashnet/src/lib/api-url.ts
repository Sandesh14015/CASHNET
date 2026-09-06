/**
 * Resolves the backend base URL (ending in /api) for raw fetch() calls.
 *
 * The generated API client (custom-fetch.ts) uses VITE_API_BASE_URL as a bare
 * origin and its generated paths already include /api. Raw fetch() calls in
 * page components also need /api appended, so they share this helper.
 *
 * Works for any value of VITE_API_BASE_URL:
 *   https://cashnet-node.onrender.com      → https://cashnet-node.onrender.com/api
 *   https://cashnet-node.onrender.com/api  → https://cashnet-node.onrender.com/api (no double)
 *   (unset)                                → /api  (same-origin, local dev)
 */
export function getBackendBase(): string {
  const env =
    typeof import.meta !== "undefined" &&
    (import.meta as any).env?.VITE_API_BASE_URL;
  if (env && env.length > 0) {
    return env.replace(/\/+$/, "").replace(/\/api$/, "") + "/api";
  }
  return "/api";
}
