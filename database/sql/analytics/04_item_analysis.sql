-- Item analysis for one skill: attempts, p-value, average time, rapid-guess rate.
-- params: skillId
SELECT q.`externalRef`, q.`difficultyLevel`, COUNT(a.`id`) AS attempts,
       ROUND(AVG(CASE WHEN a.`isCorrect` THEN 1.0 ELSE 0.0 END), 3) AS pValue,
       ROUND(AVG(a.`responseMs`) / 1000.0, 1) AS avgSeconds,
       ROUND(AVG(CASE WHEN a.`rapidGuess` THEN 1.0 ELSE 0.0 END), 3) AS rapidGuessRate
FROM `Question` q
LEFT JOIN `QuestionAttempt` a ON a.`questionId` = q.`id`
WHERE q.`skillId` = ?
GROUP BY q.`id`, q.`externalRef`, q.`difficultyLevel`
ORDER BY q.`difficultyLevel`;
