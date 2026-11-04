/**
 * A small connection pool (Update 46, memory): without `connection_limit` Prisma opens 2 × CPUs + 1 connections,
 * and the CPUs it sees on a shared host are the host's, not the 0.5 CPU of the plan — many idle connections, each
 * with its own buffers in the query engine. A URL that sets its own limit keeps it (DB_CONNECTION_LIMIT changes the default).
 * r68: 8 (was 5) — with 150 students answering at once, 5 connections made answers queue for a free connection (the
 * after-response work now runs at most 2 at a time, so the request path keeps most of them); still far below Aiven's
 * limit with two servers (2 × 8).
 */
export const DEFAULT_CONNECTION_LIMIT = 8;
export function withPoolLimit(url: string | undefined, limit = Number(process.env.DB_CONNECTION_LIMIT) || DEFAULT_CONNECTION_LIMIT): string | undefined {
  if (!url || !/^mysql:\/\//.test(url)) return url;
  const extra = [
    /[?&]connection_limit=/.test(url) ? null : `connection_limit=${limit}`,
    /[?&]pool_timeout=/.test(url) ? null : "pool_timeout=20",
  ].filter(Boolean).join("&");
  return extra ? `${url}${url.includes("?") ? "&" : "?"}${extra}` : url;
}
