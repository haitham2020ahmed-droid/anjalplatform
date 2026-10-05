-- Students with accuracy below 60% on a skill (min 5 answers) since a date: intervention alerts.
-- params (in order): since, classId
SELECT a.`studentId`, a.`skillId`, COUNT(*) AS attempts,
       ROUND(100.0 * SUM(CASE WHEN a.`isCorrect` THEN 1 ELSE 0 END) / COUNT(*), 1) AS accuracyPct,
       ROUND(AVG(a.`responseMs`) / 1000.0, 1) AS avgSeconds
FROM `ClassMembership` m
JOIN `QuestionAttempt` a ON a.`studentId` = m.`studentId` AND a.`createdAt` >= ?
WHERE m.`classId` = ? AND m.`leftAt` IS NULL
GROUP BY a.`studentId`, a.`skillId`
HAVING COUNT(*) >= 5 AND SUM(CASE WHEN a.`isCorrect` THEN 1 ELSE 0 END) < 0.6 * COUNT(*)
ORDER BY accuracyPct ASC;
