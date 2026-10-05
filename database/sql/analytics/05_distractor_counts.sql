-- How often each option of one question was chosen (flags "distractor never selected").
-- params: questionId
SELECT a.`response` ->> '$.label' AS chosen, COUNT(*) AS times
FROM `QuestionAttempt` a
WHERE a.`questionId` = ?
GROUP BY a.`response` ->> '$.label'
ORDER BY times DESC;
