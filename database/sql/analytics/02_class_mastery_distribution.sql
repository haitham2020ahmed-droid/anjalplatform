-- Mastery band distribution per skill for one class (skill cards / heat map).
-- params: classId
SELECT s.`code` AS skill, ssm.`band`, COUNT(*) AS students, ROUND(AVG(ssm.`score`), 1) AS avgMastery
FROM `ClassMembership` m
JOIN `StudentSkillMastery` ssm ON ssm.`studentId` = m.`studentId`
JOIN `Skill` s ON s.`id` = ssm.`skillId`
WHERE m.`classId` = ? AND m.`leftAt` IS NULL
GROUP BY s.`code`, ssm.`band`
ORDER BY s.`code`, ssm.`band`;
