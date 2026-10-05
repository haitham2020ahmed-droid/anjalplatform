-- Accuracy by CCSS standard for one class since a date (weak-standards report).
-- params (in order): since, classId
SELECT st.`code` AS standard, COUNT(*) AS attempts,
       ROUND(100.0 * SUM(CASE WHEN a.`isCorrect` THEN 1 ELSE 0 END) / COUNT(*), 1) AS accuracyPct
FROM `ClassMembership` m
JOIN `QuestionAttempt` a ON a.`studentId` = m.`studentId` AND a.`createdAt` >= ?
JOIN `Question` q ON q.`id` = a.`questionId`
JOIN `Standard` st ON st.`id` = q.`standardId`
WHERE m.`classId` = ? AND m.`leftAt` IS NULL
GROUP BY st.`code`
HAVING COUNT(*) >= 10
ORDER BY accuracyPct ASC;
