/**
 * A small connection pool (Update 46, memory): without `connection_limit` Prisma opens 2 × CPUs + 1 connections,
 * and the CPUs it sees on a shared host are the host's, not the 0.5 CPU of the plan — many idle connections, each
 * with its own buffers in the query engine. 5 is plenty for one small server; a URL that sets its own limit keeps it
 * (DB_CONNECTION_LIMIT changes the default).
 */
export function withPoolLimit(url: string | undefined, limit = Number(process.env.DB_CONNECTION_LIMIT) || 5): string | undefined {
  if (!url || !/^mysql:\/\//.test(url)) return url;
  const extra = [
    /[?&]connection_limit=/.test(url) ? null : `connection_limit=${limit}`,
    /[?&]pool_timeout=/.test(url) ? null : "pool_timeout=20",
  ].filter(Boolean).join("&");
  return extra ? `${url}${url.includes("?") ? "&" : "?"}${extra}` : url;
}
