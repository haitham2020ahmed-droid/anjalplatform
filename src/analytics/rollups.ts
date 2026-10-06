/**
 * Nightly rollups into the analytics summary tables.
 *
 * The SELECT part is portable SQL (backtick identifiers work in MySQL and SQLite);
 * only the upsert clause differs by dialect. Runs for a [from, to) window so it can
 * be re-run safely for any day (idempotent: rows are replaced, not added to).
 */
export type Dialect = "mysql" | "sqlite";

const upsert = (d: Dialect, key: string[], cols: string[]) =>
  d === "mysql"
    ? `ON DUPLICATE KEY UPDATE ${cols.map((c) => `\`${c}\` = VALUES(\`${c}\`)`).join(", ")}`
    : `ON CONFLICT(${key.map((k) => `\`${k}\``).join(", ")}) DO UPDATE SET ${cols.map((c) => `\`${c}\` = excluded.\`${c}\``).join(", ")}`;

/** Per student per day: questions, correct, active time, skills practised, highest level answered. */
export function studentDailyRollupSql(d: Dialect): string {
  return `INSERT INTO \`StudentDailyActivity\` (\`studentId\`, \`day\`, \`questions\`, \`correct\`, \`activeMs\`, \`skillsPracticed\`, \`maxLevel\`)
SELECT a.\`studentId\`, DATE(a.\`createdAt\`) AS day, COUNT(*), SUM(CASE WHEN a.\`isCorrect\` THEN 1 ELSE 0 END),
       SUM(a.\`responseMs\`), COUNT(DISTINCT a.\`skillId\`), MAX(q.\`difficultyLevel\`)
FROM \`QuestionAttempt\` a JOIN \`Question\` q ON q.\`id\` = a.\`questionId\`
WHERE a.\`createdAt\` >= ? AND a.\`createdAt\` < ?
GROUP BY a.\`studentId\`, DATE(a.\`createdAt\`)
${upsert(d, ["studentId", "day"], ["questions", "correct", "activeMs", "skillsPracticed", "maxLevel"])}`;
}

/** Per class × skill × day: practice volume, accuracy inputs and current mastery snapshot. */
export function classSkillDailyRollupSql(d: Dialect): string {
  return `INSERT INTO \`ClassSkillDaily\` (\`classId\`, \`skillId\`, \`day\`, \`studentsPracticed\`, \`attempts\`, \`correct\`, \`avgMastery\`, \`masteredStudents\`)
SELECT m.\`classId\`, a.\`skillId\`, DATE(a.\`createdAt\`) AS day, COUNT(DISTINCT a.\`studentId\`), COUNT(*),
       SUM(CASE WHEN a.\`isCorrect\` THEN 1 ELSE 0 END),
       (SELECT AVG(s.\`score\`) FROM \`StudentSkillMastery\` s JOIN \`ClassMembership\` cm ON cm.\`studentId\` = s.\`studentId\`
         WHERE cm.\`classId\` = m.\`classId\` AND s.\`skillId\` = a.\`skillId\`),
       (SELECT COUNT(*) FROM \`StudentSkillMastery\` s JOIN \`ClassMembership\` cm ON cm.\`studentId\` = s.\`studentId\`
         WHERE cm.\`classId\` = m.\`classId\` AND s.\`skillId\` = a.\`skillId\` AND s.\`isMastered\`)
FROM \`QuestionAttempt\` a JOIN \`ClassMembership\` m ON m.\`studentId\` = a.\`studentId\` AND m.\`leftAt\` IS NULL
WHERE a.\`createdAt\` >= ? AND a.\`createdAt\` < ?
GROUP BY m.\`classId\`, a.\`skillId\`, DATE(a.\`createdAt\`)
${upsert(d, ["classId", "skillId", "day"], ["studentsPracticed", "attempts", "correct", "avgMastery", "masteredStudents"])}`;
}
