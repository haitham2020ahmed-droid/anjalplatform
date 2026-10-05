-- Teacher dashboard KPIs for one class over a date range (reads the daily rollup, not raw attempts).
-- params (in order): fromDay, toDay, classId
SELECT COUNT(DISTINCT m.`studentId`)                                   AS students,
       COUNT(DISTINCT d.`studentId`)                                   AS activeStudents,
       COALESCE(SUM(d.`questions`), 0)                                 AS questions,
       ROUND(100.0 * SUM(d.`correct`) / NULLIF(SUM(d.`questions`), 0), 1) AS accuracyPct,
       ROUND(COALESCE(SUM(d.`activeMs`), 0) / 60000.0, 1)              AS practiceMinutes
FROM `ClassMembership` m
LEFT JOIN `StudentDailyActivity` d ON d.`studentId` = m.`studentId` AND d.`day` >= ? AND d.`day` <= ?
WHERE m.`classId` = ? AND m.`leftAt` IS NULL;
