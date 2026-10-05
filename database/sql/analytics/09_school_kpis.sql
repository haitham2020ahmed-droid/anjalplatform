-- Admin dashboard KPIs for one school.
-- params: schoolId, schoolId, schoolId, since
SELECT
  (SELECT COUNT(*) FROM `Student` WHERE `schoolId` = ? AND `deletedAt` IS NULL) AS students,
  (SELECT COUNT(*) FROM `Teacher` WHERE `schoolId` = ?) AS teachers,
  (SELECT COUNT(DISTINCT d.`studentId`) FROM `StudentDailyActivity` d JOIN `Student` s ON s.`id` = d.`studentId`
     WHERE s.`schoolId` = ? AND d.`day` >= ?) AS activeStudents;
