-- Adaptive decisions for one student (teacher/admin audit view), newest first.
-- params: studentId
SELECT `createdAt`, `reasonCode`, ROUND(`previousTheta`, 2) AS fromTheta, ROUND(`newTheta`, 2) AS toTheta,
       `questionDifficulty`, `responseCorrect`, `masteryBefore`, `masteryAfter`, `reason`
FROM `AdaptiveDecisionLog`
WHERE `studentId` = ?
ORDER BY `createdAt` DESC
LIMIT 50;
