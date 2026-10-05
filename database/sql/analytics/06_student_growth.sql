-- Growth of one student's internal ability over time (weekly snapshots).
-- params: studentId
SELECT `takenOn`, ROUND(`theta`, 2) AS theta, ROUND(`mastery`, 1) AS avgMastery
FROM `AbilitySnapshot`
WHERE `studentId` = ? AND `scope` = 'GLOBAL'
ORDER BY `takenOn`;
