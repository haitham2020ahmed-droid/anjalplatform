/**
 * 👀 The fingerprint of a test's questions (pure; shared by the test builder and the server): the version keys and
 * the question ids of each version, order-free. "Preview as student" is recorded with it, and Assign is only
 * possible for exactly the questions that were previewed — adding or removing a question needs a new preview;
 * moving a question up or down does not.
 */
export type VersionIds = Partial<Record<string, string[]>>;

export function testFingerprint(versions: VersionIds): string {
  return Object.entries(versions ?? {})
    .map(([k, l]) => [k, [...new Set((l ?? []).map(String).filter(Boolean))].sort()] as const)
    .filter(([, l]) => l.length > 0)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, l]) => `${k}:${l.join(",")}`)
    .join("|");
}
