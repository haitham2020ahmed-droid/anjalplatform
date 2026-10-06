-- GENERATED from prisma/schema.prisma (MySQL 8). Reference only — the authoritative MySQL
-- migration is produced by `prisma migrate dev`. Do not edit by hand.

CREATE TABLE `User` (
  `id` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191),
  `username` VARCHAR(191) NOT NULL,
  `passwordHash` VARCHAR(191),
  `displayName` VARCHAR(191) NOT NULL,
  `role` ENUM('SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'STUDENT', 'PARENT') NOT NULL,
  `schoolId` VARCHAR(191),
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `sessionVersion` INTEGER NOT NULL DEFAULT 0,
  `mustChangePassword` BOOLEAN NOT NULL DEFAULT false,
  `passwordChangedAt` DATETIME(3),
  `lastLoginAt` DATETIME(3),
  `failedLogins` INTEGER NOT NULL DEFAULT 0,
  `lockedUntil` DATETIME(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `deletedAt` DATETIME(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `User_email_key` UNIQUE (`email`),
  CONSTRAINT `User_username_key` UNIQUE (`username`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `User_schoolId_role_idx` ON `User`(`schoolId`, `role`);

CREATE TABLE `Session` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `version` INTEGER NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `ip` VARCHAR(191),
  `userAgent` VARCHAR(255),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `Session_userId_idx` ON `Session`(`userId`);

CREATE INDEX `Session_expiresAt_idx` ON `Session`(`expiresAt`);

CREATE TABLE `RolePermission` (
  `id` VARCHAR(191) NOT NULL,
  `role` ENUM('SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'STUDENT', 'PARENT') NOT NULL,
  `permission` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `RolePermission_role_permission_key` UNIQUE (`role`, `permission`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `School` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `logoUrl` VARCHAR(191),
  `timezone` VARCHAR(191) NOT NULL DEFAULT 'Asia/Riyadh',
  `isDemo` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `deletedAt` DATETIME(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `School_code_key` UNIQUE (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SchoolSetting` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  `value` JSON NOT NULL,
  `updatedBy` VARCHAR(191),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `SchoolSetting_schoolId_key_key` UNIQUE (`schoolId`, `key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AcademicYear` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `startDate` DATETIME(3) NOT NULL,
  `endDate` DATETIME(3) NOT NULL,
  `isCurrent` BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (`id`),
  CONSTRAINT `AcademicYear_schoolId_name_key` UNIQUE (`schoolId`, `name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Term` (
  `id` VARCHAR(191) NOT NULL,
  `academicYearId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `startDate` DATETIME(3) NOT NULL,
  `endDate` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `Term_academicYearId_name_key` UNIQUE (`academicYearId`, `name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Grade` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `level` INTEGER NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `Grade_schoolId_level_key` UNIQUE (`schoolId`, `level`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Class` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `gradeId` VARCHAR(191) NOT NULL,
  `academicYearId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `deletedAt` DATETIME(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `Class_academicYearId_name_key` UNIQUE (`academicYearId`, `name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `Class_gradeId_idx` ON `Class`(`gradeId`);

CREATE TABLE `Teacher` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191),
  PRIMARY KEY (`id`),
  CONSTRAINT `Teacher_userId_key` UNIQUE (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ClassTeacher` (
  `classId` VARCHAR(191) NOT NULL,
  `teacherId` VARCHAR(191) NOT NULL,
  `isLead` BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (`classId`, `teacherId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `ClassTeacher_teacherId_idx` ON `ClassTeacher`(`teacherId`);

CREATE TABLE `Student` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `gradeId` VARCHAR(191) NOT NULL,
  `studentNumber` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `deletedAt` DATETIME(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `Student_userId_key` UNIQUE (`userId`),
  CONSTRAINT `Student_schoolId_studentNumber_key` UNIQUE (`schoolId`, `studentNumber`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `Student_gradeId_idx` ON `Student`(`gradeId`);

CREATE TABLE `ClassMembership` (
  `classId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `leftAt` DATETIME(3),
  PRIMARY KEY (`classId`, `studentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `ClassMembership_studentId_idx` ON `ClassMembership`(`studentId`);

CREATE TABLE `Parent` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `Parent_userId_key` UNIQUE (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ParentStudent` (
  `parentId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `relationship` VARCHAR(191),
  PRIMARY KEY (`parentId`, `studentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `ParentStudent_studentId_idx` ON `ParentStudent`(`studentId`);

CREATE TABLE `Book` (
  `id` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `publisher` VARCHAR(191),
  `edition` VARCHAR(191),
  PRIMARY KEY (`id`),
  CONSTRAINT `Book_code_key` UNIQUE (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Curriculum` (
  `id` VARCHAR(191) NOT NULL,
  `gradeId` VARCHAR(191) NOT NULL,
  `bookId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `deletedAt` DATETIME(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `Curriculum_gradeId_bookId_key` UNIQUE (`gradeId`, `bookId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Unit` (
  `id` VARCHAR(191) NOT NULL,
  `curriculumId` VARCHAR(191) NOT NULL,
  `number` INTEGER NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `description` TEXT,
  `deletedAt` DATETIME(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `Unit_curriculumId_number_key` UNIQUE (`curriculumId`, `number`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Lesson` (
  `id` VARCHAR(191) NOT NULL,
  `unitId` VARCHAR(191) NOT NULL,
  `number` INTEGER NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `genre` VARCHAR(191),
  `weeks` JSON,
  `texts` JSON,
  `metadata` JSON,
  `deletedAt` DATETIME(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `Lesson_unitId_number_key` UNIQUE (`unitId`, `number`),
  CONSTRAINT `Lesson_unitId_code_key` UNIQUE (`unitId`, `code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SkillFamily` (
  `id` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `domain` ENUM('READING', 'VOCABULARY', 'GRAMMAR', 'LANGUAGE', 'WRITING', 'WORD_STUDY') NOT NULL,
  `category` ENUM('LITERATURE', 'INFORMATIONAL', 'COMPREHENSION', 'VOCABULARY', 'WORD_STUDY', 'GRAMMAR', 'MECHANICS', 'PHONICS_WORD_STUDY', 'WRITING') NOT NULL,
  `mapGoalAreaId` VARCHAR(191),
  PRIMARY KEY (`id`),
  CONSTRAINT `SkillFamily_code_key` UNIQUE (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Skill` (
  `id` VARCHAR(191) NOT NULL,
  `curriculumId` VARCHAR(191) NOT NULL,
  `familyId` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` TEXT,
  `domain` ENUM('READING', 'VOCABULARY', 'GRAMMAR', 'LANGUAGE', 'WRITING', 'WORD_STUDY') NOT NULL,
  `category` ENUM('LITERATURE', 'INFORMATIONAL', 'COMPREHENSION', 'VOCABULARY', 'WORD_STUDY', 'GRAMMAR', 'MECHANICS', 'PHONICS_WORD_STUDY', 'WRITING') NOT NULL,
  `sequence` INTEGER NOT NULL DEFAULT 0,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `deletedAt` DATETIME(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `Skill_curriculumId_code_key` UNIQUE (`curriculumId`, `code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `Skill_familyId_idx` ON `Skill`(`familyId`);

CREATE INDEX `Skill_domain_idx` ON `Skill`(`domain`);

CREATE TABLE `Subskill` (
  `id` VARCHAR(191) NOT NULL,
  `skillId` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `content` JSON,
  `deletedAt` DATETIME(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `Subskill_skillId_code_key` UNIQUE (`skillId`, `code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `LessonSkill` (
  `lessonId` VARCHAR(191) NOT NULL,
  `skillId` VARCHAR(191) NOT NULL,
  `subskillId` VARCHAR(191),
  `role` ENUM('COMPREHENSION_SKILL', 'STRATEGY_AND_FEATURE', 'VOCABULARY_STRATEGY', 'AUTHORS_CRAFT', 'GRAMMAR', 'SPELLING', 'WRITING') NOT NULL,
  `label` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`lessonId`, `skillId`, `label`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `LessonSkill_skillId_idx` ON `LessonSkill`(`skillId`);

CREATE TABLE `UnitSkill` (
  `unitId` VARCHAR(191) NOT NULL,
  `skillId` VARCHAR(191) NOT NULL,
  `order` INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (`unitId`, `skillId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `UnitSkill_skillId_idx` ON `UnitSkill`(`skillId`);

CREATE TABLE `Standard` (
  `id` VARCHAR(191) NOT NULL,
  `framework` ENUM('CCSS_ELA', 'MAP_CONTINUUM', 'CURRICULUM_MAP', 'SCHOOL_OBJECTIVE') NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `description` TEXT,
  `gradeLevel` INTEGER,
  `strand` VARCHAR(191),
  PRIMARY KEY (`id`),
  CONSTRAINT `Standard_framework_code_key` UNIQUE (`framework`, `code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SkillStandard` (
  `skillId` VARCHAR(191) NOT NULL,
  `standardId` VARCHAR(191) NOT NULL,
  `isPrimary` BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (`skillId`, `standardId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `SkillStandard_standardId_idx` ON `SkillStandard`(`standardId`);

CREATE TABLE `MapGoalArea` (
  `id` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `subject` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `MapGoalArea_code_key` UNIQUE (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SkillPrerequisite` (
  `skillId` VARCHAR(191) NOT NULL,
  `prerequisiteSkillId` VARCHAR(191) NOT NULL,
  `weight` DOUBLE NOT NULL DEFAULT 0.5,
  `minimumMastery` INTEGER NOT NULL DEFAULT 60,
  PRIMARY KEY (`skillId`, `prerequisiteSkillId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `SkillPrerequisite_prerequisiteSkillId_idx` ON `SkillPrerequisite`(`prerequisiteSkillId`);

CREATE TABLE `ReadingPassage` (
  `id` VARCHAR(191) NOT NULL,
  `externalRef` VARCHAR(191),
  `title` VARCHAR(191) NOT NULL,
  `body` MEDIUMTEXT NOT NULL,
  `genre` VARCHAR(191),
  `gradeBand` VARCHAR(191),
  `wordCount` INTEGER NOT NULL,
  `sentenceCount` INTEGER NOT NULL,
  `avgSentenceLength` DOUBLE NOT NULL,
  `avgWordLength` DOUBLE NOT NULL,
  `gradeLevel` INTEGER,
  `platformReadingLevel` INTEGER,
  `estimatedDifficulty` DOUBLE,
  `status` ENUM('DRAFT', 'UNDER_REVIEW', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  `origin` ENUM('TEACHER_AUTHORED', 'SCHOOL_BOOKLET', 'IMPORTED', 'AI_GENERATED', 'DEMO') NOT NULL DEFAULT 'TEACHER_AUTHORED',
  `createdById` VARCHAR(191),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `deletedAt` DATETIME(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `ReadingPassage_externalRef_key` UNIQUE (`externalRef`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `ReadingPassage_platformReadingLevel_idx` ON `ReadingPassage`(`platformReadingLevel`);

CREATE TABLE `OfficialReadingMeasure` (
  `id` VARCHAR(191) NOT NULL,
  `passageId` VARCHAR(191) NOT NULL,
  `provider` VARCHAR(191) NOT NULL,
  `value` VARCHAR(191) NOT NULL,
  `sourceRef` VARCHAR(191),
  `importedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `QuestionType` (
  `id` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `isAutoScored` BOOLEAN NOT NULL DEFAULT true,
  `schema` JSON,
  PRIMARY KEY (`id`),
  CONSTRAINT `QuestionType_code_key` UNIQUE (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Question` (
  `id` VARCHAR(191) NOT NULL,
  `externalRef` VARCHAR(191),
  `skillId` VARCHAR(191) NOT NULL,
  `subskillId` VARCHAR(191),
  `lessonId` VARCHAR(191),
  `passageId` VARCHAR(191),
  `standardId` VARCHAR(191),
  `typeId` VARCHAR(191) NOT NULL,
  `stem` TEXT NOT NULL,
  `content` JSON NOT NULL,
  `hint` TEXT,
  `difficultyLevel` INTEGER NOT NULL,
  `irtA` DOUBLE NOT NULL DEFAULT 1.0,
  `irtB` DOUBLE NOT NULL,
  `irtC` DOUBLE NOT NULL DEFAULT 0.0,
  `calibrated` BOOLEAN NOT NULL DEFAULT false,
  `estimatedSeconds` INTEGER NOT NULL DEFAULT 45,
  `tags` JSON,
  `status` ENUM('DRAFT', 'UNDER_REVIEW', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  `origin` ENUM('TEACHER_AUTHORED', 'SCHOOL_BOOKLET', 'IMPORTED', 'AI_GENERATED', 'DEMO') NOT NULL DEFAULT 'TEACHER_AUTHORED',
  `aiStatus` ENUM('AI_GENERATED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'),
  `version` INTEGER NOT NULL DEFAULT 1,
  `createdById` VARCHAR(191),
  `reviewedById` VARCHAR(191),
  `publishedAt` DATETIME(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `deletedAt` DATETIME(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `Question_skillId_externalRef_key` UNIQUE (`skillId`, `externalRef`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `Question_skillId_status_irtB_idx` ON `Question`(`skillId`, `status`, `irtB`);

CREATE INDEX `Question_status_origin_idx` ON `Question`(`status`, `origin`);

CREATE INDEX `Question_standardId_idx` ON `Question`(`standardId`);

CREATE TABLE `QuestionOption` (
  `id` VARCHAR(191) NOT NULL,
  `questionId` VARCHAR(191) NOT NULL,
  `label` VARCHAR(191) NOT NULL,
  `text` TEXT NOT NULL,
  `isCorrect` BOOLEAN NOT NULL DEFAULT false,
  `rationale` TEXT,
  `order` INTEGER NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `QuestionOption_questionId_idx` ON `QuestionOption`(`questionId`);

CREATE TABLE `QuestionAnswer` (
  `id` VARCHAR(191) NOT NULL,
  `questionId` VARCHAR(191) NOT NULL,
  `value` JSON NOT NULL,
  `isPrimary` BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `QuestionExplanation` (
  `id` VARCHAR(191) NOT NULL,
  `questionId` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(191) NOT NULL,
  `body` JSON NOT NULL,
  `order` INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `QuestionStats` (
  `questionId` VARCHAR(191) NOT NULL,
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `correct` INTEGER NOT NULL DEFAULT 0,
  `pValue` DOUBLE,
  `pointBiserial` DOUBLE,
  `avgResponseMs` INTEGER,
  `distractorCounts` JSON,
  `flags` JSON,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`questionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PracticeSession` (
  `id` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `skillId` VARCHAR(191),
  `assessmentId` VARCHAR(191),
  `assignmentId` VARCHAR(191),
  `mode` ENUM('ADAPTIVE_PRACTICE', 'DIAGNOSTIC', 'PLACEMENT', 'UNIT_QUIZ', 'BENCHMARK', 'TEACHER_QUIZ', 'FINAL') NOT NULL,
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `endedAt` DATETIME(3),
  `questionCount` INTEGER NOT NULL DEFAULT 0,
  `correctCount` INTEGER NOT NULL DEFAULT 0,
  `activeMs` INTEGER NOT NULL DEFAULT 0,
  `currentQuestionId` VARCHAR(191),
  `currentServedAt` DATETIME(3),
  `currentOrder` JSON,
  `lastTargetB` DOUBLE,
  `endReason` VARCHAR(191),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `PracticeSession_studentId_startedAt_idx` ON `PracticeSession`(`studentId`, `startedAt`);

CREATE TABLE `QuestionAttempt` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `sessionId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `questionId` VARCHAR(191) NOT NULL,
  `skillId` VARCHAR(191) NOT NULL,
  `response` JSON NOT NULL,
  `isCorrect` BOOLEAN NOT NULL,
  `partialCredit` DOUBLE,
  `responseMs` INTEGER NOT NULL,
  `usedHint` BOOLEAN NOT NULL DEFAULT false,
  `rapidGuess` BOOLEAN NOT NULL DEFAULT false,
  `difficultyB` DOUBLE NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `QuestionAttempt_studentId_skillId_createdAt_idx` ON `QuestionAttempt`(`studentId`, `skillId`, `createdAt`);

CREATE INDEX `QuestionAttempt_questionId_createdAt_idx` ON `QuestionAttempt`(`questionId`, `createdAt`);

CREATE INDEX `QuestionAttempt_skillId_createdAt_idx` ON `QuestionAttempt`(`skillId`, `createdAt`);

CREATE TABLE `AdaptiveDecisionLog` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `studentId` VARCHAR(191) NOT NULL,
  `sessionId` VARCHAR(191) NOT NULL,
  `attemptId` BIGINT,
  `questionId` VARCHAR(191),
  `skillId` VARCHAR(191) NOT NULL,
  `previousTheta` DOUBLE NOT NULL,
  `newTheta` DOUBLE NOT NULL,
  `thetaSE` DOUBLE NOT NULL,
  `questionDifficulty` DOUBLE,
  `responseCorrect` BOOLEAN,
  `responseMs` INTEGER,
  `masteryBefore` DOUBLE,
  `masteryAfter` DOUBLE,
  `nextQuestionId` VARCHAR(191),
  `nextTargetB` DOUBLE,
  `reason` TEXT NOT NULL,
  `reasonCode` VARCHAR(191) NOT NULL,
  `engineVersion` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `AdaptiveDecisionLog_studentId_createdAt_idx` ON `AdaptiveDecisionLog`(`studentId`, `createdAt`);

CREATE INDEX `AdaptiveDecisionLog_sessionId_idx` ON `AdaptiveDecisionLog`(`sessionId`);

CREATE TABLE `StudentAbility` (
  `id` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `scope` VARCHAR(191) NOT NULL,
  `skillId` VARCHAR(191),
  `domain` ENUM('READING', 'VOCABULARY', 'GRAMMAR', 'LANGUAGE', 'WRITING', 'WORD_STUDY'),
  `theta` DOUBLE NOT NULL DEFAULT 0,
  `thetaSE` DOUBLE NOT NULL DEFAULT 1,
  `responses` INTEGER NOT NULL DEFAULT 0,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `StudentAbility_studentId_scope_key` UNIQUE (`studentId`, `scope`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `StudentAbility_skillId_idx` ON `StudentAbility`(`skillId`);

CREATE TABLE `AbilitySnapshot` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `studentId` VARCHAR(191) NOT NULL,
  `scope` VARCHAR(191) NOT NULL,
  `theta` DOUBLE NOT NULL,
  `mastery` DOUBLE,
  `takenOn` DATE NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `AbilitySnapshot_studentId_scope_takenOn_key` UNIQUE (`studentId`, `scope`, `takenOn`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `AbilitySnapshot_takenOn_idx` ON `AbilitySnapshot`(`takenOn`);

CREATE TABLE `StudentSkillMastery` (
  `studentId` VARCHAR(191) NOT NULL,
  `skillId` VARCHAR(191) NOT NULL,
  `score` DOUBLE NOT NULL DEFAULT 0,
  `band` ENUM('BEGINNING', 'DEVELOPING', 'APPROACHING', 'PROFICIENT', 'MASTERED') NOT NULL DEFAULT 'BEGINNING',
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `correct` INTEGER NOT NULL DEFAULT 0,
  `maxLevelCorrect` INTEGER NOT NULL DEFAULT 0,
  `isMastered` BOOLEAN NOT NULL DEFAULT false,
  `masteredAt` DATETIME(3),
  `lastPracticedAt` DATETIME(3),
  `components` JSON,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`studentId`, `skillId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `StudentSkillMastery_skillId_band_idx` ON `StudentSkillMastery`(`skillId`, `band`);

CREATE TABLE `ReadingLevelBand` (
  `id` VARCHAR(191) NOT NULL,
  `label` VARCHAR(191) NOT NULL,
  `minPrl` INTEGER NOT NULL,
  `maxPrl` INTEGER NOT NULL,
  `gradeBand` VARCHAR(191),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `StudentReadingRange` (
  `id` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `lowPrl` INTEGER NOT NULL,
  `highPrl` INTEGER NOT NULL,
  `evidence` INTEGER NOT NULL,
  `computedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `StudentReadingRange_studentId_computedAt_idx` ON `StudentReadingRange`(`studentId`, `computedAt`);

CREATE TABLE `Assignment` (
  `id` VARCHAR(191) NOT NULL,
  `classId` VARCHAR(191) NOT NULL,
  `createdById` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `target` ENUM('SKILL', 'UNIT', 'ASSESSMENT') NOT NULL,
  `unitId` VARCHAR(191),
  `skillIds` JSON,
  `assessmentId` VARCHAR(191),
  `targetMastery` INTEGER,
  `dueAt` DATETIME(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `deletedAt` DATETIME(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `Assignment_classId_dueAt_idx` ON `Assignment`(`classId`, `dueAt`);

CREATE TABLE `AssignmentStudent` (
  `assignmentId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `status` ENUM('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE') NOT NULL DEFAULT 'NOT_STARTED',
  `progress` DOUBLE NOT NULL DEFAULT 0,
  `completedAt` DATETIME(3),
  PRIMARY KEY (`assignmentId`, `studentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `AssignmentStudent_studentId_status_idx` ON `AssignmentStudent`(`studentId`, `status`);

CREATE TABLE `Assessment` (
  `id` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `type` ENUM('DIAGNOSTIC', 'PLACEMENT', 'UNIT_QUIZ', 'BENCHMARK', 'TEACHER_QUIZ', 'FINAL') NOT NULL,
  `unitId` VARCHAR(191),
  `isAdaptive` BOOLEAN NOT NULL DEFAULT false,
  `maxQuestions` INTEGER,
  `timeLimitMin` INTEGER,
  `status` ENUM('DRAFT', 'UNDER_REVIEW', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  `createdById` VARCHAR(191),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `deletedAt` DATETIME(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AssessmentQuestion` (
  `assessmentId` VARCHAR(191) NOT NULL,
  `questionId` VARCHAR(191) NOT NULL,
  `order` INTEGER NOT NULL,
  `points` DOUBLE NOT NULL DEFAULT 1,
  PRIMARY KEY (`assessmentId`, `questionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ExternalAssessmentSource` (
  `id` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `notes` TEXT,
  PRIMARY KEY (`id`),
  CONSTRAINT `ExternalAssessmentSource_code_key` UNIQUE (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ExternalSkillRef` (
  `id` VARCHAR(191) NOT NULL,
  `sourceId` VARCHAR(191) NOT NULL,
  `externalCode` VARCHAR(191) NOT NULL,
  `externalName` VARCHAR(191) NOT NULL,
  `gradeLevel` INTEGER,
  `skillId` VARCHAR(191),
  PRIMARY KEY (`id`),
  CONSTRAINT `ExternalSkillRef_sourceId_externalCode_gradeLevel_key` UNIQUE (`sourceId`, `externalCode`, `gradeLevel`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ExternalAssessmentResult` (
  `id` VARCHAR(191) NOT NULL,
  `sourceId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `importJobId` VARCHAR(191),
  `externalSkill` VARCHAR(191),
  `score` DOUBLE,
  `questions` INTEGER,
  `timeSpentSec` INTEGER,
  `takenOn` DATETIME(3),
  `raw` JSON NOT NULL,
  `importedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `ExternalAssessmentResult_studentId_sourceId_idx` ON `ExternalAssessmentResult`(`studentId`, `sourceId`);

CREATE TABLE `MapResult` (
  `id` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `importJobId` VARCHAR(191),
  `testDate` DATETIME(3) NOT NULL,
  `subject` VARCHAR(191) NOT NULL,
  `goalName` VARCHAR(191),
  `goalAreaId` VARCHAR(191),
  `rit` INTEGER NOT NULL,
  `ritSE` DOUBLE,
  `achievementPercentile` INTEGER,
  `growthPercentile` INTEGER,
  `projectedGrowth` INTEGER,
  `termName` VARCHAR(191),
  `importedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `MapResult_studentId_testDate_idx` ON `MapResult`(`studentId`, `testDate`);

CREATE INDEX `MapResult_studentId_subject_testDate_idx` ON `MapResult`(`studentId`, `subject`, `testDate`);

CREATE TABLE `BenchmarkReference` (
  `id` VARCHAR(191) NOT NULL,
  `scope` VARCHAR(191) NOT NULL,
  `metric` VARCHAR(191) NOT NULL,
  `gradeLevel` INTEGER NOT NULL,
  `season` VARCHAR(191),
  `value` DOUBLE NOT NULL,
  `source` VARCHAR(191) NOT NULL,
  `importedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `BenchmarkReference_scope_metric_gradeLevel_season_key` UNIQUE (`scope`, `metric`, `gradeLevel`, `season`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ImportJob` (
  `id` VARCHAR(191) NOT NULL,
  `kind` ENUM('STUDENTS', 'TEACHERS', 'QUESTIONS', 'SKILLS', 'STANDARDS', 'CURRICULUM_MAP', 'MAP_RESULTS', 'EXTERNAL_RESULTS') NOT NULL,
  `status` ENUM('UPLOADED', 'VALIDATING', 'AWAITING_CONFIRMATION', 'IMPORTING', 'COMPLETED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'UPLOADED',
  `fileName` VARCHAR(191) NOT NULL,
  `uploadedById` VARCHAR(191) NOT NULL,
  `totalRows` INTEGER NOT NULL DEFAULT 0,
  `validRows` INTEGER NOT NULL DEFAULT 0,
  `errorRows` INTEGER NOT NULL DEFAULT 0,
  `duplicateRows` INTEGER NOT NULL DEFAULT 0,
  `preview` JSON,
  `errors` JSON,
  `fileSha256` VARCHAR(191),
  `payload` JSON,
  `options` JSON,
  `summary` JSON,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completedAt` DATETIME(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `ImportJob_kind_status_idx` ON `ImportJob`(`kind`, `status`);

CREATE TABLE `Recommendation` (
  `id` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `skillId` VARCHAR(191) NOT NULL,
  `targetLevel` INTEGER NOT NULL,
  `score` DOUBLE NOT NULL,
  `reasons` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `dismissedAt` DATETIME(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `Recommendation_studentId_createdAt_idx` ON `Recommendation`(`studentId`, `createdAt`);

CREATE TABLE `InterventionAlert` (
  `id` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `skillId` VARCHAR(191),
  `ruleCode` VARCHAR(191) NOT NULL,
  `message` VARCHAR(191) NOT NULL,
  `evidence` JSON NOT NULL,
  `resolvedAt` DATETIME(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `InterventionAlert_studentId_resolvedAt_idx` ON `InterventionAlert`(`studentId`, `resolvedAt`);

CREATE TABLE `Notification` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `type` ENUM('NEW_ASSIGNMENT', 'ASSIGNMENT_DUE', 'SKILL_MASTERED', 'TEACHER_FEEDBACK', 'NEW_BADGE', 'ASSESSMENT_AVAILABLE', 'PARENT_PROGRESS', 'INTERVENTION_ALERT') NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `body` TEXT NOT NULL,
  `link` VARCHAR(191),
  `readAt` DATETIME(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `Notification_userId_readAt_idx` ON `Notification`(`userId`, `readAt`);

CREATE TABLE `Badge` (
  `id` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` VARCHAR(191) NOT NULL,
  `criteria` JSON NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `Badge_code_key` UNIQUE (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `StudentBadge` (
  `studentId` VARCHAR(191) NOT NULL,
  `badgeId` VARCHAR(191) NOT NULL,
  `awardedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`studentId`, `badgeId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `XpEvent` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `studentId` VARCHAR(191) NOT NULL,
  `points` INTEGER NOT NULL,
  `reason` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `XpEvent_studentId_createdAt_idx` ON `XpEvent`(`studentId`, `createdAt`);

CREATE TABLE `AuditLog` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `actorId` VARCHAR(191),
  `action` VARCHAR(191) NOT NULL,
  `entityType` VARCHAR(191) NOT NULL,
  `entityId` VARCHAR(191),
  `before` JSON,
  `after` JSON,
  `ip` VARCHAR(191),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `AuditLog_entityType_entityId_idx` ON `AuditLog`(`entityType`, `entityId`);

CREATE INDEX `AuditLog_actorId_createdAt_idx` ON `AuditLog`(`actorId`, `createdAt`);

CREATE TABLE `StudentDailyActivity` (
  `studentId` VARCHAR(191) NOT NULL,
  `day` DATE NOT NULL,
  `questions` INTEGER NOT NULL DEFAULT 0,
  `correct` INTEGER NOT NULL DEFAULT 0,
  `activeMs` INTEGER NOT NULL DEFAULT 0,
  `skillsPracticed` INTEGER NOT NULL DEFAULT 0,
  `maxLevel` INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (`studentId`, `day`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `StudentDailyActivity_day_idx` ON `StudentDailyActivity`(`day`);

CREATE TABLE `ClassSkillDaily` (
  `classId` VARCHAR(191) NOT NULL,
  `skillId` VARCHAR(191) NOT NULL,
  `day` DATE NOT NULL,
  `studentsPracticed` INTEGER NOT NULL DEFAULT 0,
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `correct` INTEGER NOT NULL DEFAULT 0,
  `avgMastery` DOUBLE,
  `masteredStudents` INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (`classId`, `skillId`, `day`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `ClassSkillDaily_skillId_day_idx` ON `ClassSkillDaily`(`skillId`, `day`);

CREATE TABLE `RateLimitBucket` (
  `key` VARCHAR(191) NOT NULL,
  `count` INTEGER NOT NULL DEFAULT 0,
  `windowStart` DATETIME(3) NOT NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `RateLimitBucket_windowStart_idx` ON `RateLimitBucket`(`windowStart`);

CREATE TABLE `DiagnosticResult` (
  `id` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `sessionId` VARCHAR(191) NOT NULL,
  `takenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `questions` INTEGER NOT NULL,
  `overallTheta` DOUBLE NOT NULL,
  `overallSE` DOUBLE NOT NULL,
  `proficiency` VARCHAR(191) NOT NULL,
  `domains` JSON NOT NULL,
  `strongDomains` JSON NOT NULL,
  `weakDomains` JSON NOT NULL,
  `recommendedSkillIds` JSON NOT NULL,
  `interventionSkillIds` JSON NOT NULL,
  `engineVersion` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `DiagnosticResult_sessionId_key` UNIQUE (`sessionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `DiagnosticResult_studentId_takenAt_idx` ON `DiagnosticResult`(`studentId`, `takenAt`);

CREATE TABLE `ImportedQuestionLog` (
  `id` VARCHAR(191) NOT NULL,
  `jobId` VARCHAR(191) NOT NULL,
  `rowIndex` INTEGER NOT NULL,
  `status` ENUM('VALID', 'INVALID', 'DUPLICATE', 'IMPORTED', 'REPLACED', 'SKIPPED', 'FAILED') NOT NULL,
  `decision` ENUM('IMPORT', 'SKIP', 'REPLACE', 'FORCE') NOT NULL DEFAULT 'IMPORT',
  `selected` BOOLEAN NOT NULL DEFAULT true,
  `source` TEXT NOT NULL,
  `detected` JSON NOT NULL,
  `errors` JSON,
  `warnings` JSON,
  `duplicateOfId` VARCHAR(191),
  `similarity` DOUBLE,
  `questionId` VARCHAR(191),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `ImportedQuestionLog_jobId_rowIndex_key` UNIQUE (`jobId`, `rowIndex`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `ImportedQuestionLog_jobId_status_idx` ON `ImportedQuestionLog`(`jobId`, `status`);

-- Foreign keys (added after all tables exist)
ALTER TABLE `User` ADD CONSTRAINT `User_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Session` ADD CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `SchoolSetting` ADD CONSTRAINT `SchoolSetting_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `AcademicYear` ADD CONSTRAINT `AcademicYear_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Term` ADD CONSTRAINT `Term_academicYearId_fkey` FOREIGN KEY (`academicYearId`) REFERENCES `AcademicYear`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Grade` ADD CONSTRAINT `Grade_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Class` ADD CONSTRAINT `Class_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Class` ADD CONSTRAINT `Class_gradeId_fkey` FOREIGN KEY (`gradeId`) REFERENCES `Grade`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Class` ADD CONSTRAINT `Class_academicYearId_fkey` FOREIGN KEY (`academicYearId`) REFERENCES `AcademicYear`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Teacher` ADD CONSTRAINT `Teacher_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Teacher` ADD CONSTRAINT `Teacher_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ClassTeacher` ADD CONSTRAINT `ClassTeacher_classId_fkey` FOREIGN KEY (`classId`) REFERENCES `Class`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ClassTeacher` ADD CONSTRAINT `ClassTeacher_teacherId_fkey` FOREIGN KEY (`teacherId`) REFERENCES `Teacher`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Student` ADD CONSTRAINT `Student_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Student` ADD CONSTRAINT `Student_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Student` ADD CONSTRAINT `Student_gradeId_fkey` FOREIGN KEY (`gradeId`) REFERENCES `Grade`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ClassMembership` ADD CONSTRAINT `ClassMembership_classId_fkey` FOREIGN KEY (`classId`) REFERENCES `Class`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ClassMembership` ADD CONSTRAINT `ClassMembership_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Parent` ADD CONSTRAINT `Parent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ParentStudent` ADD CONSTRAINT `ParentStudent_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `Parent`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ParentStudent` ADD CONSTRAINT `ParentStudent_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Curriculum` ADD CONSTRAINT `Curriculum_gradeId_fkey` FOREIGN KEY (`gradeId`) REFERENCES `Grade`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Curriculum` ADD CONSTRAINT `Curriculum_bookId_fkey` FOREIGN KEY (`bookId`) REFERENCES `Book`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Unit` ADD CONSTRAINT `Unit_curriculumId_fkey` FOREIGN KEY (`curriculumId`) REFERENCES `Curriculum`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Lesson` ADD CONSTRAINT `Lesson_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `Unit`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `SkillFamily` ADD CONSTRAINT `SkillFamily_mapGoalAreaId_fkey` FOREIGN KEY (`mapGoalAreaId`) REFERENCES `MapGoalArea`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Skill` ADD CONSTRAINT `Skill_curriculumId_fkey` FOREIGN KEY (`curriculumId`) REFERENCES `Curriculum`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Skill` ADD CONSTRAINT `Skill_familyId_fkey` FOREIGN KEY (`familyId`) REFERENCES `SkillFamily`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Subskill` ADD CONSTRAINT `Subskill_skillId_fkey` FOREIGN KEY (`skillId`) REFERENCES `Skill`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `LessonSkill` ADD CONSTRAINT `LessonSkill_lessonId_fkey` FOREIGN KEY (`lessonId`) REFERENCES `Lesson`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `LessonSkill` ADD CONSTRAINT `LessonSkill_skillId_fkey` FOREIGN KEY (`skillId`) REFERENCES `Skill`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `UnitSkill` ADD CONSTRAINT `UnitSkill_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `Unit`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `UnitSkill` ADD CONSTRAINT `UnitSkill_skillId_fkey` FOREIGN KEY (`skillId`) REFERENCES `Skill`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `SkillStandard` ADD CONSTRAINT `SkillStandard_skillId_fkey` FOREIGN KEY (`skillId`) REFERENCES `Skill`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `SkillStandard` ADD CONSTRAINT `SkillStandard_standardId_fkey` FOREIGN KEY (`standardId`) REFERENCES `Standard`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `SkillPrerequisite` ADD CONSTRAINT `SkillPrerequisite_skillId_fkey` FOREIGN KEY (`skillId`) REFERENCES `Skill`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `SkillPrerequisite` ADD CONSTRAINT `SkillPrerequisite_prerequisiteSkillId_fkey` FOREIGN KEY (`prerequisiteSkillId`) REFERENCES `Skill`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `OfficialReadingMeasure` ADD CONSTRAINT `OfficialReadingMeasure_passageId_fkey` FOREIGN KEY (`passageId`) REFERENCES `ReadingPassage`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Question` ADD CONSTRAINT `Question_skillId_fkey` FOREIGN KEY (`skillId`) REFERENCES `Skill`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Question` ADD CONSTRAINT `Question_subskillId_fkey` FOREIGN KEY (`subskillId`) REFERENCES `Subskill`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Question` ADD CONSTRAINT `Question_lessonId_fkey` FOREIGN KEY (`lessonId`) REFERENCES `Lesson`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Question` ADD CONSTRAINT `Question_passageId_fkey` FOREIGN KEY (`passageId`) REFERENCES `ReadingPassage`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Question` ADD CONSTRAINT `Question_standardId_fkey` FOREIGN KEY (`standardId`) REFERENCES `Standard`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Question` ADD CONSTRAINT `Question_typeId_fkey` FOREIGN KEY (`typeId`) REFERENCES `QuestionType`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `QuestionOption` ADD CONSTRAINT `QuestionOption_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `Question`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `QuestionAnswer` ADD CONSTRAINT `QuestionAnswer_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `Question`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `QuestionExplanation` ADD CONSTRAINT `QuestionExplanation_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `Question`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `QuestionStats` ADD CONSTRAINT `QuestionStats_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `Question`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `PracticeSession` ADD CONSTRAINT `PracticeSession_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `PracticeSession` ADD CONSTRAINT `PracticeSession_assessmentId_fkey` FOREIGN KEY (`assessmentId`) REFERENCES `Assessment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `QuestionAttempt` ADD CONSTRAINT `QuestionAttempt_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `PracticeSession`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `QuestionAttempt` ADD CONSTRAINT `QuestionAttempt_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `QuestionAttempt` ADD CONSTRAINT `QuestionAttempt_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `Question`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `QuestionAttempt` ADD CONSTRAINT `QuestionAttempt_skillId_fkey` FOREIGN KEY (`skillId`) REFERENCES `Skill`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `AdaptiveDecisionLog` ADD CONSTRAINT `AdaptiveDecisionLog_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `StudentAbility` ADD CONSTRAINT `StudentAbility_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `StudentAbility` ADD CONSTRAINT `StudentAbility_skillId_fkey` FOREIGN KEY (`skillId`) REFERENCES `Skill`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `AbilitySnapshot` ADD CONSTRAINT `AbilitySnapshot_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `StudentSkillMastery` ADD CONSTRAINT `StudentSkillMastery_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `StudentSkillMastery` ADD CONSTRAINT `StudentSkillMastery_skillId_fkey` FOREIGN KEY (`skillId`) REFERENCES `Skill`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `StudentReadingRange` ADD CONSTRAINT `StudentReadingRange_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Assignment` ADD CONSTRAINT `Assignment_classId_fkey` FOREIGN KEY (`classId`) REFERENCES `Class`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Assignment` ADD CONSTRAINT `Assignment_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `Teacher`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Assignment` ADD CONSTRAINT `Assignment_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `Unit`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Assignment` ADD CONSTRAINT `Assignment_assessmentId_fkey` FOREIGN KEY (`assessmentId`) REFERENCES `Assessment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `AssignmentStudent` ADD CONSTRAINT `AssignmentStudent_assignmentId_fkey` FOREIGN KEY (`assignmentId`) REFERENCES `Assignment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `AssignmentStudent` ADD CONSTRAINT `AssignmentStudent_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Assessment` ADD CONSTRAINT `Assessment_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `Unit`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `AssessmentQuestion` ADD CONSTRAINT `AssessmentQuestion_assessmentId_fkey` FOREIGN KEY (`assessmentId`) REFERENCES `Assessment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `AssessmentQuestion` ADD CONSTRAINT `AssessmentQuestion_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `Question`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ExternalSkillRef` ADD CONSTRAINT `ExternalSkillRef_sourceId_fkey` FOREIGN KEY (`sourceId`) REFERENCES `ExternalAssessmentSource`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ExternalSkillRef` ADD CONSTRAINT `ExternalSkillRef_skillId_fkey` FOREIGN KEY (`skillId`) REFERENCES `Skill`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `ExternalAssessmentResult` ADD CONSTRAINT `ExternalAssessmentResult_sourceId_fkey` FOREIGN KEY (`sourceId`) REFERENCES `ExternalAssessmentSource`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ExternalAssessmentResult` ADD CONSTRAINT `ExternalAssessmentResult_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `MapResult` ADD CONSTRAINT `MapResult_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `MapResult` ADD CONSTRAINT `MapResult_goalAreaId_fkey` FOREIGN KEY (`goalAreaId`) REFERENCES `MapGoalArea`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `ImportJob` ADD CONSTRAINT `ImportJob_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Recommendation` ADD CONSTRAINT `Recommendation_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `InterventionAlert` ADD CONSTRAINT `InterventionAlert_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `StudentBadge` ADD CONSTRAINT `StudentBadge_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `StudentBadge` ADD CONSTRAINT `StudentBadge_badgeId_fkey` FOREIGN KEY (`badgeId`) REFERENCES `Badge`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `XpEvent` ADD CONSTRAINT `XpEvent_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `StudentDailyActivity` ADD CONSTRAINT `StudentDailyActivity_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ClassSkillDaily` ADD CONSTRAINT `ClassSkillDaily_classId_fkey` FOREIGN KEY (`classId`) REFERENCES `Class`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ClassSkillDaily` ADD CONSTRAINT `ClassSkillDaily_skillId_fkey` FOREIGN KEY (`skillId`) REFERENCES `Skill`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `DiagnosticResult` ADD CONSTRAINT `DiagnosticResult_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ImportedQuestionLog` ADD CONSTRAINT `ImportedQuestionLog_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `ImportJob`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
