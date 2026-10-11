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
  `uiLang` VARCHAR(5),
  `tourSeenAt` DATETIME(3),
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
  `isActive` BOOLEAN NOT NULL DEFAULT true,
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
  `isActive` BOOLEAN NOT NULL DEFAULT true,
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
  `isActive` BOOLEAN NOT NULL DEFAULT true,
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

CREATE TABLE `LearningStatement` (
  `id` VARCHAR(191) NOT NULL,
  `subject` VARCHAR(10) NOT NULL,
  `ritLow` INTEGER NOT NULL,
  `ritHigh` INTEGER NOT NULL,
  `goalArea` VARCHAR(120) NOT NULL,
  `topic` VARCHAR(120) NOT NULL,
  `statement` TEXT NOT NULL,
  `standards` VARCHAR(500) NOT NULL,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `importedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `LearningStatement_subject_ritLow_idx` ON `LearningStatement`(`subject`, `ritLow`);

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
  `imageId` VARCHAR(191),
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
  `lexile` INTEGER,
  `mapTest` VARCHAR(20),
  `mapInstructionalArea` VARCHAR(80),
  `mapAreaSource` VARCHAR(16),
  `dok` INTEGER,
  `dokSource` VARCHAR(8),
  `estimatedLevel` INTEGER,
  `estimatedB` DOUBLE,
  `difficultyFactors` JSON,
  `difficultySource` VARCHAR(12),
  `textLevel` INTEGER,
  `intelligenceAt` DATETIME(3),
  `metaReviewedAt` DATETIME(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `Question_skillId_externalRef_key` UNIQUE (`skillId`, `externalRef`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `Question_skillId_status_irtB_idx` ON `Question`(`skillId`, `status`, `irtB`);

CREATE INDEX `Question_status_origin_idx` ON `Question`(`status`, `origin`);

CREATE INDEX `Question_standardId_idx` ON `Question`(`standardId`);

CREATE INDEX `Question_mapInstructionalArea_status_idx` ON `Question`(`mapInstructionalArea`, `status`);

CREATE INDEX `Question_intelligenceAt_idx` ON `Question`(`intelligenceAt`);

CREATE TABLE `QuestionOption` (
  `id` VARCHAR(191) NOT NULL,
  `questionId` VARCHAR(191) NOT NULL,
  `label` VARCHAR(191) NOT NULL,
  `text` TEXT NOT NULL,
  `isCorrect` BOOLEAN NOT NULL DEFAULT false,
  `rationale` TEXT,
  `order` INTEGER NOT NULL,
  `misconception` VARCHAR(40),
  `misconceptionSource` VARCHAR(8),
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
  `goalReachedAt` DATETIME(3),
  `hintQuestionId` VARCHAR(191),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `PracticeSession_studentId_startedAt_idx` ON `PracticeSession`(`studentId`, `startedAt`);

CREATE INDEX `PracticeSession_assignmentId_idx` ON `PracticeSession`(`assignmentId`);

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
  `misconception` VARCHAR(40),
  `source` VARCHAR(12),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `QuestionAttempt_studentId_skillId_createdAt_idx` ON `QuestionAttempt`(`studentId`, `skillId`, `createdAt`);

CREATE INDEX `QuestionAttempt_studentId_createdAt_idx` ON `QuestionAttempt`(`studentId`, `createdAt`);

CREATE INDEX `QuestionAttempt_questionId_createdAt_idx` ON `QuestionAttempt`(`questionId`, `createdAt`);

CREATE INDEX `QuestionAttempt_skillId_createdAt_idx` ON `QuestionAttempt`(`skillId`, `createdAt`);

CREATE INDEX `QuestionAttempt_sessionId_idx` ON `QuestionAttempt`(`sessionId`);

CREATE INDEX `QuestionAttempt_studentId_misconception_idx` ON `QuestionAttempt`(`studentId`, `misconception`);

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

CREATE INDEX `AdaptiveDecisionLog_questionId_idx` ON `AdaptiveDecisionLog`(`questionId`);

CREATE INDEX `AdaptiveDecisionLog_attemptId_idx` ON `AdaptiveDecisionLog`(`attemptId`);

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
  `nextReviewAt` DATETIME(3),
  `reviewStep` INTEGER NOT NULL DEFAULT 0,
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
  `skillId` VARCHAR(191),
  `startAt` DATETIME(3),
  `note` TEXT,
  `track` VARCHAR(16) NOT NULL DEFAULT 'CURRICULUM',
  `program` VARCHAR(16),
  `assessmentId` VARCHAR(191),
  `targetMastery` INTEGER,
  `curriculumPlanId` VARCHAR(191),
  `dueAt` DATETIME(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `deletedAt` DATETIME(3),
  `testId` VARCHAR(191),
  `shuffle` BOOLEAN NOT NULL DEFAULT false,
  `questionIds` JSON,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `Assignment_classId_dueAt_idx` ON `Assignment`(`classId`, `dueAt`);

CREATE INDEX `Assignment_skillId_idx` ON `Assignment`(`skillId`);

CREATE INDEX `Assignment_testId_idx` ON `Assignment`(`testId`);

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
  `targetCorrect` INTEGER,
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
  `lexile` INTEGER,
  `rapidGuessPct` INTEGER,
  `observedGrowth` INTEGER,
  `conditionalGrowthIndex` DOUBLE,
  `metProjectedGrowth` VARCHAR(8),
  `testMinutes` INTEGER,
  `lexileLow` INTEGER,
  `lexileHigh` INTEGER,
  `typicalGrowth` INTEGER,
  `proficiency` VARCHAR(40),
  `descriptor` VARCHAR(10),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `MapResult_studentId_testDate_idx` ON `MapResult`(`studentId`, `testDate`);

CREATE INDEX `MapResult_studentId_subject_testDate_idx` ON `MapResult`(`studentId`, `subject`, `testDate`);

CREATE INDEX `MapResult_termName_idx` ON `MapResult`(`termName`);

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
  `source` VARCHAR(16),
  `masteryAtRec` DOUBLE,
  `followedAt` DATETIME(3),
  `evaluatedAt` DATETIME(3),
  `masteryAfter` DOUBLE,
  `outcome` VARCHAR(12),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `Recommendation_studentId_createdAt_idx` ON `Recommendation`(`studentId`, `createdAt`);

CREATE INDEX `Recommendation_studentId_skillId_createdAt_idx` ON `Recommendation`(`studentId`, `skillId`, `createdAt`);

CREATE INDEX `Recommendation_evaluatedAt_createdAt_idx` ON `Recommendation`(`evaluatedAt`, `createdAt`);

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
  `type` ENUM('NEW_ASSIGNMENT', 'ASSIGNMENT_DUE', 'SKILL_MASTERED', 'TEACHER_FEEDBACK', 'NEW_BADGE', 'ASSESSMENT_AVAILABLE', 'PARENT_PROGRESS', 'INTERVENTION_ALERT', 'REPORT_APPROVAL', 'DAILY_DIGEST', 'ADMIN_MESSAGE', 'TIER_CHANGE') NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `body` TEXT NOT NULL,
  `link` VARCHAR(191),
  `readAt` DATETIME(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `Notification_userId_readAt_idx` ON `Notification`(`userId`, `readAt`);

CREATE INDEX `Notification_userId_createdAt_idx` ON `Notification`(`userId`, `createdAt`);

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

CREATE INDEX `AuditLog_createdAt_idx` ON `AuditLog`(`createdAt`);

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

CREATE TABLE `QuestionImage` (
  `id` VARCHAR(191) NOT NULL,
  `mime` VARCHAR(40) NOT NULL,
  `bytes` MEDIUMBLOB NOT NULL,
  `size` INTEGER NOT NULL,
  `width` INTEGER,
  `height` INTEGER,
  `sha256` VARCHAR(64) NOT NULL,
  `altText` VARCHAR(300),
  `createdById` VARCHAR(191),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `QuestionImage_sha256_idx` ON `QuestionImage`(`sha256`);

CREATE TABLE `CurriculumMapNode` (
  `id` VARCHAR(191) NOT NULL,
  `gradeId` VARCHAR(191) NOT NULL,
  `parentId` VARCHAR(191),
  `kind` ENUM('BOOK', 'UNIT', 'TEXT_SET', 'SELECTION', 'CATEGORY', 'LEVEL') NOT NULL,
  `code` VARCHAR(120) NOT NULL,
  `number` INTEGER,
  `title` VARCHAR(255) NOT NULL,
  `heading` VARCHAR(255),
  `sharedRead` VARCHAR(255),
  `genre` VARCHAR(120),
  `categoryType` ENUM('CONCEPT_VOCABULARY', 'ANALYZE_CRAFT_AND_STRUCTURE', 'RESPOND_TO_READING'),
  `skills` VARCHAR(500),
  `level` ENUM('ABOVE', 'ON', 'BELOW'),
  `acceptsQuestions` BOOLEAN NOT NULL DEFAULT false,
  `bookId` VARCHAR(191),
  `sortOrder` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `CurriculumMapNode_gradeId_code_key` UNIQUE (`gradeId`, `code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `CurriculumMapNode_gradeId_parentId_sortOrder_idx` ON `CurriculumMapNode`(`gradeId`, `parentId`, `sortOrder`);

CREATE INDEX `CurriculumMapNode_acceptsQuestions_idx` ON `CurriculumMapNode`(`acceptsQuestions`);

CREATE TABLE `QuestionMapLink` (
  `questionId` VARCHAR(191) NOT NULL,
  `nodeId` VARCHAR(191) NOT NULL,
  `createdById` VARCHAR(191),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`questionId`, `nodeId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `QuestionMapLink_nodeId_idx` ON `QuestionMapLink`(`nodeId`);

CREATE TABLE `QuestionUse` (
  `questionId` VARCHAR(191) NOT NULL,
  `use` ENUM('PLACEMENT', 'MAP_TEST') NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`questionId`, `use`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `QuestionUse_use_idx` ON `QuestionUse`(`use`);

CREATE TABLE `SchoolAsset` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(30) NOT NULL,
  `mime` VARCHAR(60) NOT NULL,
  `bytes` MEDIUMBLOB NOT NULL,
  `sha256` VARCHAR(64) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `SchoolAsset_schoolId_kind_idx` ON `SchoolAsset`(`schoolId`, `kind`);

CREATE TABLE `StudentLevel` (
  `studentId` VARCHAR(191) NOT NULL,
  `level` ENUM('ABOVE', 'ON', 'BELOW') NOT NULL,
  `source` VARCHAR(20) NOT NULL,
  `setById` VARCHAR(191),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`studentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ReadMasterArticle` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `code` VARCHAR(60) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `topic` VARCHAR(191),
  `gradeLevel` INTEGER NOT NULL,
  `skillId` VARCHAR(191),
  `skillName` VARCHAR(191),
  `standardCode` VARCHAR(80),
  `status` VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  `createdById` VARCHAR(191),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `ReadMasterArticle_schoolId_code_key` UNIQUE (`schoolId`, `code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `ReadMasterArticle_schoolId_gradeLevel_idx` ON `ReadMasterArticle`(`schoolId`, `gradeLevel`);

CREATE TABLE `ReadMasterVersion` (
  `id` VARCHAR(191) NOT NULL,
  `articleId` VARCHAR(191) NOT NULL,
  `level` ENUM('ABOVE', 'ON', 'BELOW') NOT NULL,
  `lexile` INTEGER NOT NULL,
  `body` TEXT NOT NULL,
  `wordCount` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `ReadMasterVersion_articleId_level_key` UNIQUE (`articleId`, `level`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ReadMasterQuestion` (
  `versionId` VARCHAR(191) NOT NULL,
  `questionId` VARCHAR(191) NOT NULL,
  `order` INTEGER NOT NULL,
  PRIMARY KEY (`versionId`, `questionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `ReadMasterQuestion_questionId_idx` ON `ReadMasterQuestion`(`questionId`);

CREATE TABLE `StudentReadingLexile` (
  `studentId` VARCHAR(191) NOT NULL,
  `lexile` INTEGER NOT NULL,
  `source` VARCHAR(20) NOT NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`studentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ReadMasterAttempt` (
  `id` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `articleId` VARCHAR(191) NOT NULL,
  `versionId` VARCHAR(191) NOT NULL,
  `level` ENUM('ABOVE', 'ON', 'BELOW') NOT NULL,
  `lexileBefore` INTEGER NOT NULL,
  `lexileAfter` INTEGER NOT NULL,
  `correct` INTEGER NOT NULL,
  `total` INTEGER NOT NULL,
  `seconds` INTEGER,
  `rapid` INTEGER,
  `practice` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `ReadMasterAttempt_studentId_idx` ON `ReadMasterAttempt`(`studentId`);

CREATE INDEX `ReadMasterAttempt_articleId_idx` ON `ReadMasterAttempt`(`articleId`);

CREATE TABLE `SkillPlan` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `classId` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(12) NOT NULL DEFAULT 'PLACES',
  `targetCorrect` INTEGER,
  `openUnits` JSON,
  `unitDates` JSON,
  `gradeLevel` INTEGER NOT NULL,
  `note` VARCHAR(1000),
  `createdById` VARCHAR(191),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `SkillPlan_schoolId_classId_idx` ON `SkillPlan`(`schoolId`, `classId`);

CREATE TABLE `SkillPlanItem` (
  `id` VARCHAR(191) NOT NULL,
  `planId` VARCHAR(191) NOT NULL,
  `code` VARCHAR(80) NOT NULL,
  `label` VARCHAR(255) NOT NULL,
  `assignmentIds` JSON NOT NULL,
  `order` INTEGER NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `SkillPlanItem_planId_idx` ON `SkillPlanItem`(`planId`);

CREATE TABLE `LiveGame` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `classId` VARCHAR(191),
  `hostId` VARCHAR(191) NOT NULL,
  `code` VARCHAR(8) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `questionIds` JSON NOT NULL,
  `status` VARCHAR(12) NOT NULL DEFAULT 'LOBBY',
  `currentIndex` INTEGER NOT NULL DEFAULT -1,
  `questionStartedAt` DATETIME(3),
  `secondsPerQuestion` INTEGER NOT NULL DEFAULT 20,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `finishedAt` DATETIME(3),
  `mode` VARCHAR(32),
  `summary` JSON,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `LiveGame_code_status_idx` ON `LiveGame`(`code`, `status`);

CREATE INDEX `LiveGame_schoolId_createdAt_idx` ON `LiveGame`(`schoolId`, `createdAt`);

CREATE TABLE `LiveGamePlayer` (
  `id` VARCHAR(191) NOT NULL,
  `gameId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `nickname` VARCHAR(60) NOT NULL,
  `score` INTEGER NOT NULL DEFAULT 0,
  `streak` INTEGER NOT NULL DEFAULT 0,
  `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `LiveGamePlayer_gameId_studentId_key` UNIQUE (`gameId`, `studentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `LiveGameAnswer` (
  `id` VARCHAR(191) NOT NULL,
  `gameId` VARCHAR(191) NOT NULL,
  `playerId` VARCHAR(191) NOT NULL,
  `questionIndex` INTEGER NOT NULL,
  `choice` VARCHAR(191) NOT NULL,
  `correct` BOOLEAN NOT NULL,
  `points` INTEGER NOT NULL,
  `ms` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `LiveGameAnswer_playerId_questionIndex_key` UNIQUE (`playerId`, `questionIndex`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `LiveGameAnswer_gameId_questionIndex_idx` ON `LiveGameAnswer`(`gameId`, `questionIndex`);

CREATE TABLE `GamePlay` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `skillId` VARCHAR(191) NOT NULL,
  `gameId` VARCHAR(32) NOT NULL,
  `mode` VARCHAR(8) NOT NULL DEFAULT 'SOLO',
  `correct` INTEGER NOT NULL DEFAULT 0,
  `incorrect` INTEGER NOT NULL DEFAULT 0,
  `points` INTEGER NOT NULL DEFAULT 0,
  `liveGameId` VARCHAR(191),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `GamePlay_schoolId_createdAt_idx` ON `GamePlay`(`schoolId`, `createdAt`);

CREATE INDEX `GamePlay_studentId_createdAt_idx` ON `GamePlay`(`studentId`, `createdAt`);

CREATE TABLE `GameRating` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `gameId` VARCHAR(32) NOT NULL,
  `stars` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `GameRating_studentId_gameId_key` UNIQUE (`studentId`, `gameId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `GameRating_schoolId_gameId_idx` ON `GameRating`(`schoolId`, `gameId`);

CREATE TABLE `LiveChallengeTemplate` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `title` VARCHAR(150) NOT NULL,
  `spec` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `LiveChallengeTemplate_userId_idx` ON `LiveChallengeTemplate`(`userId`);

CREATE TABLE `CrossGradeBridge` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `fromCode` VARCHAR(80) NOT NULL,
  `challengeCode` VARCHAR(80),
  `supportCode` VARCHAR(80),
  `source` VARCHAR(12) NOT NULL DEFAULT 'IMPORT',
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `CrossGradeBridge_schoolId_fromCode_key` UNIQUE (`schoolId`, `fromCode`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `StudentCategoryLevel` (
  `studentId` VARCHAR(191) NOT NULL,
  `category` VARCHAR(8) NOT NULL,
  `level` ENUM('ABOVE', 'ON', 'BELOW') NOT NULL,
  `source` VARCHAR(20) NOT NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`studentId`, `category`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RespondActivity` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `code` VARCHAR(120) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `prompt` TEXT NOT NULL,
  `instructions` JSON NOT NULL,
  `wordBank` JSON NOT NULL,
  `sentenceStarters` JSON NOT NULL,
  `checklist` JSON NOT NULL,
  `hint` TEXT,
  `modelAnswer` TEXT,
  `updatedById` VARCHAR(191),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `RespondActivity_schoolId_code_key` UNIQUE (`schoolId`, `code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RespondAssignment` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `classId` VARCHAR(191) NOT NULL,
  `setCode` VARCHAR(120) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `dueAt` DATETIME(3),
  `note` VARCHAR(1000),
  `createdById` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `deletedAt` DATETIME(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `RespondAssignment_classId_createdAt_idx` ON `RespondAssignment`(`classId`, `createdAt`);

CREATE INDEX `RespondAssignment_schoolId_setCode_idx` ON `RespondAssignment`(`schoolId`, `setCode`);

CREATE TABLE `RespondAssignmentStudent` (
  `assignmentId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `level` ENUM('ABOVE', 'ON', 'BELOW') NOT NULL,
  `finishedAt` DATETIME(3),
  `score` INTEGER,
  `feedback` VARCHAR(1000),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`assignmentId`, `studentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `RespondAssignmentStudent_studentId_idx` ON `RespondAssignmentStudent`(`studentId`);

CREATE TABLE `AiJob` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `tool` VARCHAR(20) NOT NULL,
  `scope` JSON NOT NULL,
  `status` VARCHAR(12) NOT NULL DEFAULT 'QUEUED',
  `total` INTEGER NOT NULL DEFAULT 0,
  `done` INTEGER NOT NULL DEFAULT 0,
  `failed` INTEGER NOT NULL DEFAULT 0,
  `note` VARCHAR(500),
  `createdById` VARCHAR(191),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `finishedAt` DATETIME(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `AiJob_schoolId_createdAt_idx` ON `AiJob`(`schoolId`, `createdAt`);

CREATE TABLE `AiJobItem` (
  `id` VARCHAR(191) NOT NULL,
  `jobId` VARCHAR(191) NOT NULL,
  `targetId` VARCHAR(60) NOT NULL,
  `status` VARCHAR(10) NOT NULL DEFAULT 'PENDING',
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `error` VARCHAR(500),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `AiJobItem_jobId_status_idx` ON `AiJobItem`(`jobId`, `status`);

CREATE TABLE `AiSuggestion` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `jobId` VARCHAR(191),
  `tool` VARCHAR(20) NOT NULL,
  `kind` VARCHAR(20) NOT NULL,
  `questionId` VARCHAR(60),
  `passageId` VARCHAR(60),
  `severity` INTEGER NOT NULL DEFAULT 3,
  `detail` TEXT NOT NULL,
  `data` JSON NOT NULL,
  `status` VARCHAR(12) NOT NULL DEFAULT 'SUGGESTED',
  `reviewedById` VARCHAR(191),
  `reviewedAt` DATETIME(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `AiSuggestion_schoolId_tool_status_idx` ON `AiSuggestion`(`schoolId`, `tool`, `status`);

CREATE INDEX `AiSuggestion_questionId_idx` ON `AiSuggestion`(`questionId`);

CREATE TABLE `AiRequestLog` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `tool` VARCHAR(20) NOT NULL,
  `provider` VARCHAR(20) NOT NULL,
  `model` VARCHAR(80) NOT NULL,
  `ok` BOOLEAN NOT NULL,
  `items` INTEGER NOT NULL DEFAULT 0,
  `ms` INTEGER NOT NULL DEFAULT 0,
  `error` VARCHAR(500),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `AiRequestLog_schoolId_createdAt_idx` ON `AiRequestLog`(`schoolId`, `createdAt`);

CREATE TABLE `MapPlan` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `classId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `subject` VARCHAR(10) NOT NULL,
  `term` VARCHAR(40) NOT NULL,
  `status` VARCHAR(10) NOT NULL DEFAULT 'DRAFT',
  `items` JSON NOT NULL,
  `note` VARCHAR(1000),
  `dueAt` DATETIME(3),
  `assignmentIds` JSON,
  `createdById` VARCHAR(191),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `sentAt` DATETIME(3),
  `editedAt` DATETIME(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `MapPlan_classId_subject_term_idx` ON `MapPlan`(`classId`, `subject`, `term`);

CREATE INDEX `MapPlan_studentId_idx` ON `MapPlan`(`studentId`);

CREATE TABLE `StudentAlert` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `classId` VARCHAR(191),
  `studentId` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(20) NOT NULL,
  `key` VARCHAR(120) NOT NULL,
  `detail` VARCHAR(500) NOT NULL,
  `status` VARCHAR(10) NOT NULL DEFAULT 'OPEN',
  `action` VARCHAR(1000),
  `handledById` VARCHAR(191),
  `handledAt` DATETIME(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `StudentAlert_studentId_key_key` UNIQUE (`studentId`, `key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `StudentAlert_schoolId_status_idx` ON `StudentAlert`(`schoolId`, `status`);

CREATE INDEX `StudentAlert_classId_status_idx` ON `StudentAlert`(`classId`, `status`);

CREATE TABLE `WordEntry` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `word` VARCHAR(64) NOT NULL,
  `phonetic` VARCHAR(120),
  `audioUrl` VARCHAR(500),
  `meanings` JSON NOT NULL,
  `source` VARCHAR(10) NOT NULL DEFAULT 'API',
  `isVocab` BOOLEAN NOT NULL DEFAULT false,
  `arabicGloss` VARCHAR(200),
  `contextSentence` VARCHAR(300),
  `updatedById` VARCHAR(191),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `WordEntry_schoolId_word_key` UNIQUE (`schoolId`, `word`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `StudentWord` (
  `studentId` VARCHAR(191) NOT NULL,
  `word` VARCHAR(64) NOT NULL,
  `lookups` INTEGER NOT NULL DEFAULT 1,
  `firstAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lastAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `quizRight` INTEGER NOT NULL DEFAULT 0,
  `quizWrong` INTEGER NOT NULL DEFAULT 0,
  `lastQuizAt` DATETIME(3),
  `nextReviewAt` DATETIME(3),
  `reviewStep` INTEGER NOT NULL DEFAULT 0,
  `myExample` VARCHAR(300),
  `notExample` VARCHAR(300),
  PRIMARY KEY (`studentId`, `word`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `StudentWord_studentId_lastAt_idx` ON `StudentWord`(`studentId`, `lastAt`);

CREATE TABLE `MissingWord` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `word` VARCHAR(64) NOT NULL,
  `count` INTEGER NOT NULL DEFAULT 1,
  `lastSentence` VARCHAR(300),
  `checkedAt` DATETIME(3),
  `firstAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lastAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `MissingWord_schoolId_word_key` UNIQUE (`schoolId`, `word`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `MissingWord_schoolId_count_idx` ON `MissingWord`(`schoolId`, `count`);

CREATE TABLE `WorkComment` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `assignmentId` VARCHAR(191),
  `authorId` VARCHAR(191) NOT NULL,
  `body` VARCHAR(2000) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `WorkComment_studentId_createdAt_idx` ON `WorkComment`(`studentId`, `createdAt`);

CREATE INDEX `WorkComment_assignmentId_idx` ON `WorkComment`(`assignmentId`);

CREATE TABLE `QuestionFlag` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `questionId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `reason` VARCHAR(40) NOT NULL,
  `note` VARCHAR(500),
  `status` VARCHAR(10) NOT NULL DEFAULT 'OPEN',
  `resolvedById` VARCHAR(191),
  `resolvedAt` DATETIME(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `QuestionFlag_questionId_studentId_key` UNIQUE (`questionId`, `studentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `QuestionFlag_schoolId_status_idx` ON `QuestionFlag`(`schoolId`, `status`);

CREATE TABLE `WeeklyGoal` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `scope` VARCHAR(10) NOT NULL,
  `ownerId` VARCHAR(191) NOT NULL,
  `weekStart` DATETIME(3) NOT NULL,
  `kind` VARCHAR(10) NOT NULL,
  `target` INTEGER NOT NULL,
  `title` VARCHAR(160),
  `createdById` VARCHAR(191),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `WeeklyGoal_scope_ownerId_weekStart_key` UNIQUE (`scope`, `ownerId`, `weekStart`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ExitTicket` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `classId` VARCHAR(191) NOT NULL,
  `createdById` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `questionIds` JSON NOT NULL,
  `status` VARCHAR(10) NOT NULL DEFAULT 'OPEN',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `closedAt` DATETIME(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `ExitTicket_classId_status_idx` ON `ExitTicket`(`classId`, `status`);

CREATE TABLE `ExitTicketAnswer` (
  `ticketId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `questionId` VARCHAR(191) NOT NULL,
  `isCorrect` BOOLEAN NOT NULL,
  `response` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`ticketId`, `studentId`, `questionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `ExitTicketAnswer_ticketId_idx` ON `ExitTicketAnswer`(`ticketId`);

CREATE TABLE `Worksheet` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `createdById` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `grade` INTEGER,
  `questionIds` JSON NOT NULL,
  `shared` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `Worksheet_schoolId_shared_idx` ON `Worksheet`(`schoolId`, `shared`);

CREATE INDEX `Worksheet_createdById_idx` ON `Worksheet`(`createdById`);

CREATE TABLE `MapSimWindow` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `title` VARCHAR(160) NOT NULL,
  `grade` INTEGER,
  `season` VARCHAR(10) NOT NULL,
  `subjects` JSON NOT NULL,
  `items` INTEGER NOT NULL DEFAULT 50,
  `opensAt` DATETIME(3) NOT NULL,
  `closesAt` DATETIME(3) NOT NULL,
  `createdById` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `MapSimWindow_schoolId_closesAt_idx` ON `MapSimWindow`(`schoolId`, `closesAt`);

CREATE TABLE `MapSimSession` (
  `id` VARCHAR(191) NOT NULL,
  `windowId` VARCHAR(191),
  `schoolId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `subject` VARCHAR(10) NOT NULL,
  `kind` VARCHAR(10) NOT NULL DEFAULT 'SIM',
  `status` VARCHAR(12) NOT NULL DEFAULT 'IN_PROGRESS',
  `total` INTEGER NOT NULL,
  `startRit` DOUBLE NOT NULL,
  `rit` DOUBLE NOT NULL,
  `se` DOUBLE NOT NULL DEFAULT 15,
  `answered` INTEGER NOT NULL DEFAULT 0,
  `correct` INTEGER NOT NULL DEFAULT 0,
  `rapid` INTEGER NOT NULL DEFAULT 0,
  `servedQuestionId` VARCHAR(191),
  `servedAt` DATETIME(3),
  `resultRit` INTEGER,
  `resultLow` INTEGER,
  `resultHigh` INTEGER,
  `areas` JSON,
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `finishedAt` DATETIME(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `MapSimSession_windowId_studentId_idx` ON `MapSimSession`(`windowId`, `studentId`);

CREATE INDEX `MapSimSession_studentId_status_idx` ON `MapSimSession`(`studentId`, `status`);

CREATE TABLE `MapSimAnswer` (
  `sessionId` VARCHAR(191) NOT NULL,
  `n` INTEGER NOT NULL,
  `questionId` VARCHAR(191) NOT NULL,
  `area` VARCHAR(10) NOT NULL,
  `itemRit` DOUBLE NOT NULL,
  `isCorrect` BOOLEAN NOT NULL,
  `responseMs` INTEGER NOT NULL,
  `rapid` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`sessionId`, `n`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `MapSimAnswer_questionId_idx` ON `MapSimAnswer`(`questionId`);

CREATE TABLE `TeacherNote` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `authorId` VARCHAR(191) NOT NULL,
  `body` VARCHAR(1000) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `TeacherNote_studentId_createdAt_idx` ON `TeacherNote`(`studentId`, `createdAt`);

CREATE TABLE `WritingTask` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `classId` VARCHAR(191) NOT NULL,
  `createdById` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(12) NOT NULL DEFAULT 'WRITE',
  `title` VARCHAR(191) NOT NULL,
  `prompt` TEXT NOT NULL,
  `passage` TEXT,
  `minWords` INTEGER,
  `dueAt` DATETIME(3),
  `genre` VARCHAR(14) NOT NULL DEFAULT 'FREE',
  `skillId` VARCHAR(191),
  `staged` BOOLEAN NOT NULL DEFAULT false,
  `sources` JSON,
  `research` JSON,
  `aiFeedback` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `deletedAt` DATETIME(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `WritingTask_classId_createdAt_idx` ON `WritingTask`(`classId`, `createdAt`);

CREATE TABLE `WritingSubmission` (
  `taskId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `text` TEXT,
  `audio` MEDIUMBLOB,
  `audioType` VARCHAR(60),
  `status` VARCHAR(10) NOT NULL DEFAULT 'DRAFT',
  `scores` JSON,
  `comment` VARCHAR(2000),
  `scoredById` VARCHAR(191),
  `wcpm` INTEGER,
  `submittedAt` DATETIME(3),
  `scoredAt` DATETIME(3),
  `stage` VARCHAR(8),
  `plan` JSON,
  `firstDraft` TEXT,
  `checklist` JSON,
  `researchAnswers` JSON,
  `aiDraft` JSON,
  `aiStatus` VARCHAR(9) NOT NULL DEFAULT 'NONE',
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`taskId`, `studentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `WritingSubmission_studentId_status_idx` ON `WritingSubmission`(`studentId`, `status`);

CREATE TABLE `ErrorLog` (
  `id` VARCHAR(191) NOT NULL,
  `source` VARCHAR(10) NOT NULL,
  `message` VARCHAR(1000) NOT NULL,
  `path` VARCHAR(300),
  `digest` VARCHAR(100),
  `userId` VARCHAR(191),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `ErrorLog_createdAt_idx` ON `ErrorLog`(`createdAt`);

CREATE TABLE `DiagnosticTest` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `grade` INTEGER NOT NULL,
  `year` VARCHAR(9) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `assessmentId` VARCHAR(191) NOT NULL,
  `status` VARCHAR(10) NOT NULL DEFAULT 'DRAFT',
  `opensAt` DATETIME(3),
  `closesAt` DATETIME(3),
  `bands` JSON,
  `adaptive` BOOLEAN NOT NULL DEFAULT false,
  `design` JSON,
  `period` VARCHAR(3) NOT NULL DEFAULT 'BOY',
  `createdById` VARCHAR(191),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `DiagnosticTest_schoolId_grade_idx` ON `DiagnosticTest`(`schoolId`, `grade`);

CREATE TABLE `DiagnosticScore` (
  `id` VARCHAR(191) NOT NULL,
  `diagnosticId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `assignmentId` VARCHAR(191) NOT NULL,
  `correct` INTEGER NOT NULL,
  `total` INTEGER NOT NULL,
  `pct` DOUBLE NOT NULL,
  `level` VARCHAR(6) NOT NULL,
  `byStandard` JSON NOT NULL,
  `byStrand` JSON NOT NULL,
  `rapid` INTEGER NOT NULL DEFAULT 0,
  `minutes` INTEGER NOT NULL DEFAULT 0,
  `theta` DOUBLE,
  `thetaSE` DOUBLE,
  `ritEstimate` INTEGER,
  `byArea` JSON,
  `completedAt` DATETIME(3) NOT NULL,
  `sharedAt` DATETIME(3),
  `teacherNote` VARCHAR(1000),
  PRIMARY KEY (`id`),
  CONSTRAINT `DiagnosticScore_diagnosticId_studentId_key` UNIQUE (`diagnosticId`, `studentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `DiagnosticScore_studentId_idx` ON `DiagnosticScore`(`studentId`);

CREATE TABLE `FluencyCheck` (
  `id` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `wcpm` INTEGER NOT NULL,
  `accuracy` INTEGER,
  `note` VARCHAR(500),
  `source` VARCHAR(10) NOT NULL DEFAULT 'TEACHER',
  `checkedById` VARCHAR(191),
  `checkedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `season` VARCHAR(6),
  `percentile` INTEGER,
  `prosody` JSON,
  `comprehension` INTEGER,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `FluencyCheck_studentId_checkedAt_idx` ON `FluencyCheck`(`studentId`, `checkedAt`);

CREATE TABLE `WeeklyCheck` (
  `id` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `week` VARCHAR(10) NOT NULL,
  `assignmentId` VARCHAR(191) NOT NULL,
  `correct` INTEGER NOT NULL DEFAULT 0,
  `total` INTEGER NOT NULL DEFAULT 0,
  `ritBefore` INTEGER,
  `ritAfter` INTEGER,
  `completedAt` DATETIME(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `WeeklyCheck_studentId_week_key` UNIQUE (`studentId`, `week`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `FluencyPractice` (
  `id` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `mode` VARCHAR(8) NOT NULL,
  `passageKey` VARCHAR(60) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `lexile` INTEGER,
  `wordsRead` INTEGER NOT NULL,
  `wordsCorrect` INTEGER NOT NULL,
  `seconds` INTEGER NOT NULL,
  `wcpm` INTEGER NOT NULL,
  `accuracy` INTEGER NOT NULL,
  `expression` INTEGER,
  `level` VARCHAR(6),
  `errors` JSON NOT NULL,
  `patterns` JSON,
  `plan` JSON,
  `prosody` JSON,
  `hesitations` INTEGER,
  `comprehension` INTEGER,
  `practiceKind` VARCHAR(10),
  `trial` INTEGER,
  `percentile` INTEGER,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `FluencyPractice_studentId_createdAt_idx` ON `FluencyPractice`(`studentId`, `createdAt`);

CREATE TABLE `FamilyReport` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(12) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `content` JSON NOT NULL,
  `refId` VARCHAR(40),
  `status` VARCHAR(10) NOT NULL,
  `createdById` VARCHAR(191) NOT NULL,
  `submittedAt` DATETIME(3),
  `reviewedById` VARCHAR(191),
  `reviewedAt` DATETIME(3),
  `reviewNote` TEXT,
  `seenByParentAt` DATETIME(3),
  `seenByStudentAt` DATETIME(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `FamilyReport_schoolId_status_idx` ON `FamilyReport`(`schoolId`, `status`);

CREATE INDEX `FamilyReport_studentId_status_idx` ON `FamilyReport`(`studentId`, `status`);

CREATE TABLE `QuestionStandardFix` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `questionId` VARCHAR(191) NOT NULL,
  `fromCode` VARCHAR(40),
  `toCode` VARCHAR(40) NOT NULL,
  `reason` VARCHAR(255) NOT NULL,
  `status` VARCHAR(10) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `reviewedById` VARCHAR(191),
  `reviewedAt` DATETIME(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `QuestionStandardFix_schoolId_status_idx` ON `QuestionStandardFix`(`schoolId`, `status`);

CREATE INDEX `QuestionStandardFix_questionId_idx` ON `QuestionStandardFix`(`questionId`);

CREATE TABLE `StudentProfile` (
  `studentId` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `level` VARCHAR(8) NOT NULL,
  `levelSource` VARCHAR(16) NOT NULL,
  `levelAt` DATETIME(3),
  `readingRit` INTEGER,
  `languageRit` INTEGER,
  `estReadingRit` INTEGER,
  `estLanguageRit` INTEGER,
  `lexile` INTEGER,
  `theta` DOUBLE,
  `practiceDays14` INTEGER NOT NULL DEFAULT 0,
  `predictedTerm` VARCHAR(12),
  `predictedReading` INTEGER,
  `predictedLanguage` INTEGER,
  `predictedRange` INTEGER,
  `goalReading` INTEGER,
  `goalChance` INTEGER,
  `misconceptions` JSON,
  `weakestArea` VARCHAR(12),
  `updatedAt` DATETIME(3) NOT NULL,
  `intelligence` JSON,
  `riskScore` INTEGER,
  `riskReasons` JSON,
  PRIMARY KEY (`studentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `StudentProfile_schoolId_level_idx` ON `StudentProfile`(`schoolId`, `level`);

CREATE TABLE `Intervention` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `classId` VARCHAR(191) NOT NULL,
  `skillId` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `studentIds` JSON NOT NULL,
  `createdById` VARCHAR(191) NOT NULL,
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `endsAt` DATETIME(3) NOT NULL,
  `baseline` JSON NOT NULL,
  `result` JSON,
  `evaluatedAt` DATETIME(3),
  `status` VARCHAR(10) NOT NULL DEFAULT 'ACTIVE',
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `Intervention_classId_status_idx` ON `Intervention`(`classId`, `status`);

CREATE INDEX `Intervention_schoolId_status_idx` ON `Intervention`(`schoolId`, `status`);

CREATE TABLE `RiskSnapshot` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `studentId` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `takenOn` DATE NOT NULL,
  `score` INTEGER NOT NULL,
  `features` JSON NOT NULL,
  `model` VARCHAR(16) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `RiskSnapshot_studentId_takenOn_key` UNIQUE (`studentId`, `takenOn`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `RiskSnapshot_schoolId_takenOn_idx` ON `RiskSnapshot`(`schoolId`, `takenOn`);

CREATE TABLE `PredictionModel` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(20) NOT NULL,
  `weights` JSON NOT NULL,
  `metrics` JSON NOT NULL,
  `n` INTEGER NOT NULL DEFAULT 0,
  `trainedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `PredictionModel_schoolId_kind_key` UNIQUE (`schoolId`, `kind`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AdminMessage` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `senderId` VARCHAR(191) NOT NULL,
  `subject` VARCHAR(150) NOT NULL,
  `body` TEXT NOT NULL,
  `link` VARCHAR(300),
  `audience` JSON NOT NULL,
  `recipients` INTEGER NOT NULL DEFAULT 0,
  `emailed` INTEGER NOT NULL DEFAULT 0,
  `emailFailed` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `AdminMessage_schoolId_createdAt_idx` ON `AdminMessage`(`schoolId`, `createdAt`);

CREATE TABLE `AdminMessageRecipient` (
  `id` VARCHAR(191) NOT NULL,
  `messageId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `notificationId` VARCHAR(191),
  `emailStatus` VARCHAR(10) NOT NULL,
  `readAt` DATETIME(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `AdminMessageRecipient_messageId_userId_key` UNIQUE (`messageId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `AdminMessageRecipient_userId_idx` ON `AdminMessageRecipient`(`userId`);

CREATE TABLE `StudentTier` (
  `studentId` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `tier` INTEGER NOT NULL DEFAULT 1,
  `source` VARCHAR(8) NOT NULL DEFAULT 'AUTO',
  `locked` BOOLEAN NOT NULL DEFAULT false,
  `reason` TEXT NOT NULL,
  `focusSkillId` VARCHAR(191),
  `since` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `reviewAt` DATETIME(3),
  `monitorEveryDays` INTEGER NOT NULL DEFAULT 0,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`studentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `StudentTier_schoolId_tier_idx` ON `StudentTier`(`schoolId`, `tier`);

CREATE TABLE `TierChange` (
  `id` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `fromTier` INTEGER NOT NULL,
  `toTier` INTEGER NOT NULL,
  `source` VARCHAR(8) NOT NULL,
  `reason` TEXT NOT NULL,
  `evidence` JSON,
  `changedById` VARCHAR(191),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `TierChange_studentId_createdAt_idx` ON `TierChange`(`studentId`, `createdAt`);

CREATE INDEX `TierChange_schoolId_createdAt_idx` ON `TierChange`(`schoolId`, `createdAt`);

CREATE TABLE `DataMeeting` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `classId` VARCHAR(191),
  `gradeLevel` INTEGER,
  `heldOn` DATETIME(3) NOT NULL,
  `createdById` VARCHAR(191) NOT NULL,
  `snapshot` JSON NOT NULL,
  `decisions` JSON NOT NULL,
  `notes` TEXT,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `DataMeeting_schoolId_heldOn_idx` ON `DataMeeting`(`schoolId`, `heldOn`);

CREATE INDEX `DataMeeting_classId_heldOn_idx` ON `DataMeeting`(`classId`, `heldOn`);

CREATE TABLE `DecodingScreen` (
  `id` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `reason` VARCHAR(8) NOT NULL DEFAULT 'TEACHER',
  `items` JSON NOT NULL,
  `result` JSON,
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completedAt` DATETIME(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `DecodingScreen_studentId_startedAt_idx` ON `DecodingScreen`(`studentId`, `startedAt`);

CREATE INDEX `DecodingScreen_schoolId_completedAt_idx` ON `DecodingScreen`(`schoolId`, `completedAt`);

CREATE TABLE `ProgressCheck` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `classId` VARCHAR(191) NOT NULL,
  `lessonId` VARCHAR(191) NOT NULL,
  `assignmentId` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `categories` JSON NOT NULL,
  `createdById` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `ProgressCheck_assignmentId_key` UNIQUE (`assignmentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `ProgressCheck_classId_createdAt_idx` ON `ProgressCheck`(`classId`, `createdAt`);

CREATE TABLE `StrategySurvey` (
  `id` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `answers` JSON NOT NULL,
  `result` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `StrategySurvey_studentId_createdAt_idx` ON `StrategySurvey`(`studentId`, `createdAt`);

CREATE TABLE `LessonRun` (
  `id` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `skillId` VARCHAR(191) NOT NULL,
  `source` VARCHAR(10) NOT NULL DEFAULT 'STUDENT',
  `phase` VARCHAR(12) NOT NULL DEFAULT 'MODEL',
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `approach` INTEGER NOT NULL DEFAULT 0,
  `log` JSON NOT NULL,
  `organizer` JSON,
  `checkPct` INTEGER,
  `passed` BOOLEAN,
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `finishedAt` DATETIME(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `LessonRun_studentId_skillId_idx` ON `LessonRun`(`studentId`, `skillId`);

CREATE INDEX `LessonRun_schoolId_updatedAt_idx` ON `LessonRun`(`schoolId`, `updatedAt`);

CREATE TABLE `RRArticle` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191),
  `code` VARCHAR(40) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `topic` VARCHAR(60) NOT NULL,
  `summary` VARCHAR(400),
  `pollStatement` VARCHAR(300) NOT NULL,
  `status` VARCHAR(10) NOT NULL DEFAULT 'DRAFT',
  `createdById` VARCHAR(191),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `deletedAt` DATETIME(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `RRArticle_schoolId_status_idx` ON `RRArticle`(`schoolId`, `status`);

CREATE INDEX `RRArticle_code_idx` ON `RRArticle`(`code`);

CREATE TABLE `RRVersion` (
  `id` VARCHAR(191) NOT NULL,
  `articleId` VARCHAR(191) NOT NULL,
  `level` INTEGER NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `body` TEXT NOT NULL,
  `wordCount` INTEGER NOT NULL,
  `estLevel` INTEGER NOT NULL,
  `officialLexile` INTEGER,
  PRIMARY KEY (`id`),
  CONSTRAINT `RRVersion_articleId_level_key` UNIQUE (`articleId`, `level`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RRQuestion` (
  `id` VARCHAR(191) NOT NULL,
  `articleId` VARCHAR(191) NOT NULL,
  `band` VARCHAR(4) NOT NULL,
  `number` INTEGER NOT NULL,
  `stem` TEXT NOT NULL,
  `options` JSON NOT NULL,
  `answer` VARCHAR(1) NOT NULL,
  `skill` VARCHAR(30) NOT NULL,
  `rationale` JSON,
  PRIMARY KEY (`id`),
  CONSTRAINT `RRQuestion_articleId_band_number_key` UNIQUE (`articleId`, `band`, `number`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RRPrompt` (
  `id` VARCHAR(191) NOT NULL,
  `articleId` VARCHAR(191) NOT NULL,
  `band` VARCHAR(4) NOT NULL,
  `prompt` TEXT NOT NULL,
  `checklist` JSON,
  `keyWords` JSON,
  PRIMARY KEY (`id`),
  CONSTRAINT `RRPrompt_articleId_band_key` UNIQUE (`articleId`, `band`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RRStudent` (
  `studentId` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `level` INTEGER NOT NULL,
  `startLevel` INTEGER NOT NULL,
  `source` VARCHAR(10) NOT NULL,
  `placedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `articlesDone` INTEGER NOT NULL DEFAULT 0,
  `weeklyGoal` INTEGER NOT NULL DEFAULT 2,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`studentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `RRStudent_schoolId_idx` ON `RRStudent`(`schoolId`);

CREATE TABLE `RRLevelChange` (
  `id` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `fromLevel` INTEGER NOT NULL,
  `toLevel` INTEGER NOT NULL,
  `reason` VARCHAR(300) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `RRLevelChange_studentId_createdAt_idx` ON `RRLevelChange`(`studentId`, `createdAt`);

CREATE INDEX `RRLevelChange_schoolId_createdAt_idx` ON `RRLevelChange`(`schoolId`, `createdAt`);

CREATE TABLE `RRRun` (
  `id` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `articleId` VARCHAR(191) NOT NULL,
  `versionLevel` INTEGER NOT NULL,
  `band` VARCHAR(4) NOT NULL,
  `step` VARCHAR(8) NOT NULL DEFAULT 'PREPOLL',
  `prePoll` INTEGER,
  `postPoll` INTEGER,
  `readSeconds` INTEGER,
  `answers` JSON,
  `score` INTEGER,
  `writing` TEXT,
  `writingScore` INTEGER,
  `writingComment` VARCHAR(1000),
  `writingScoredById` VARCHAR(191),
  `levelBefore` INTEGER NOT NULL,
  `levelAfter` INTEGER,
  `firstTry` BOOLEAN NOT NULL DEFAULT true,
  `stretch` BOOLEAN NOT NULL DEFAULT false,
  `annotations` JSON,
  `listened` BOOLEAN NOT NULL DEFAULT false,
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completedAt` DATETIME(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `RRRun_studentId_completedAt_idx` ON `RRRun`(`studentId`, `completedAt`);

CREATE INDEX `RRRun_schoolId_completedAt_idx` ON `RRRun`(`schoolId`, `completedAt`);

CREATE INDEX `RRRun_articleId_idx` ON `RRRun`(`articleId`);

CREATE TABLE `RRPlacement` (
  `id` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `startLevel` INTEGER NOT NULL,
  `steps` JSON NOT NULL,
  `result` INTEGER,
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completedAt` DATETIME(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `RRPlacement_studentId_startedAt_idx` ON `RRPlacement`(`studentId`, `startedAt`);

CREATE TABLE `RRClassArticle` (
  `id` VARCHAR(191) NOT NULL,
  `classId` VARCHAR(191) NOT NULL,
  `articleId` VARCHAR(191) NOT NULL,
  `assignedById` VARCHAR(191) NOT NULL,
  `dueAt` DATETIME(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `RRClassArticle_classId_articleId_key` UNIQUE (`classId`, `articleId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `QuestionGradeStat` (
  `id` VARCHAR(191) NOT NULL,
  `questionId` VARCHAR(191) NOT NULL,
  `grade` INTEGER NOT NULL,
  `responses` INTEGER NOT NULL,
  `correct` INTEGER NOT NULL,
  `pct` DOUBLE NOT NULL,
  `responsesOnLevel` INTEGER NOT NULL DEFAULT 0,
  `pctOnLevel` DOUBLE,
  `optionShares` JSON,
  `discrimination` DOUBLE,
  `medianMs` INTEGER,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `QuestionGradeStat_questionId_grade_key` UNIQUE (`questionId`, `grade`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `QuestionGradeStat_grade_responses_idx` ON `QuestionGradeStat`(`grade`, `responses`);

CREATE TABLE `QuestionLevelChange` (
  `id` VARCHAR(191) NOT NULL,
  `questionId` VARCHAR(191) NOT NULL,
  `grade` INTEGER NOT NULL,
  `fromLevel` VARCHAR(6) NOT NULL,
  `toLevel` VARCHAR(6) NOT NULL,
  `fromDifficulty` INTEGER NOT NULL,
  `toDifficulty` INTEGER NOT NULL,
  `pct` DOUBLE NOT NULL,
  `responses` INTEGER NOT NULL,
  `basis` VARCHAR(20) NOT NULL,
  `source` VARCHAR(10) NOT NULL,
  `reason` VARCHAR(400) NOT NULL,
  `approvedById` VARCHAR(191),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `QuestionLevelChange_questionId_createdAt_idx` ON `QuestionLevelChange`(`questionId`, `createdAt`);

CREATE INDEX `QuestionLevelChange_createdAt_idx` ON `QuestionLevelChange`(`createdAt`);

CREATE TABLE `QuestionAlert` (
  `id` VARCHAR(191) NOT NULL,
  `questionId` VARCHAR(191) NOT NULL,
  `grade` INTEGER NOT NULL,
  `kind` VARCHAR(24) NOT NULL,
  `detail` VARCHAR(400) NOT NULL,
  `data` JSON,
  `status` VARCHAR(10) NOT NULL DEFAULT 'OPEN',
  `heldBack` BOOLEAN NOT NULL DEFAULT false,
  `resolvedById` VARCHAR(191),
  `resolvedAt` DATETIME(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `QuestionAlert_questionId_grade_kind_key` UNIQUE (`questionId`, `grade`, `kind`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `QuestionAlert_questionId_status_idx` ON `QuestionAlert`(`questionId`, `status`);

CREATE INDEX `QuestionAlert_status_createdAt_idx` ON `QuestionAlert`(`status`, `createdAt`);

CREATE TABLE `SkillEvidence` (
  `id` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `skillId` VARCHAR(191) NOT NULL,
  `source` VARCHAR(12) NOT NULL,
  `refId` VARCHAR(120) NOT NULL,
  `credit` DOUBLE NOT NULL,
  `difficultyB` DOUBLE NOT NULL DEFAULT 0,
  `guessC` DOUBLE NOT NULL DEFAULT 0,
  `weight` DOUBLE NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `SkillEvidence_studentId_source_refId_key` UNIQUE (`studentId`, `source`, `refId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `SkillEvidence_studentId_skillId_createdAt_idx` ON `SkillEvidence`(`studentId`, `skillId`, `createdAt`);

CREATE TABLE `StudentLevelState` (
  `studentId` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `level` ENUM('ABOVE', 'ON', 'BELOW') NOT NULL,
  `source` VARCHAR(12) NOT NULL,
  `reason` VARCHAR(500) NOT NULL,
  `since` DATETIME(3) NOT NULL,
  `pending` ENUM('ABOVE', 'ON', 'BELOW'),
  `pendingSince` DATETIME(3),
  `pendingCount` INTEGER NOT NULL DEFAULT 0,
  `theta` DOUBLE,
  `thetaSE` DOUBLE,
  `effN` DOUBLE NOT NULL DEFAULT 0,
  `thetaRecent` DOUBLE,
  `thetaPrior` DOUBLE,
  `declining` BOOLEAN NOT NULL DEFAULT false,
  `evaluatedAt` DATETIME(3) NOT NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`studentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `StudentLevelState_schoolId_level_idx` ON `StudentLevelState`(`schoolId`, `level`);

CREATE TABLE `NafsArea` (
  `id` VARCHAR(191) NOT NULL,
  `code` VARCHAR(32) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `NafsArea_code_key` UNIQUE (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `NafsSkillLink` (
  `familyId` VARCHAR(191) NOT NULL,
  `areaId` VARCHAR(191) NOT NULL,
  `source` VARCHAR(8) NOT NULL,
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`familyId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `NafsSkillLink_areaId_idx` ON `NafsSkillLink`(`areaId`);

CREATE TABLE `NafsQuestionArea` (
  `questionId` VARCHAR(191) NOT NULL,
  `areaId` VARCHAR(191) NOT NULL,
  `setById` VARCHAR(191),
  `setAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`questionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `NafsQuestionArea_areaId_idx` ON `NafsQuestionArea`(`areaId`);

CREATE TABLE `SkillLinkReview` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(16) NOT NULL,
  `subjectId` VARCHAR(64) NOT NULL,
  `excerpt` VARCHAR(200) NOT NULL,
  `guessId` VARCHAR(40),
  `guessLabel` VARCHAR(160),
  `confidence` DOUBLE NOT NULL,
  `reason` VARCHAR(255) NOT NULL,
  `status` VARCHAR(10) NOT NULL DEFAULT 'OPEN',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `reviewedById` VARCHAR(191),
  `reviewedAt` DATETIME(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `SkillLinkReview_schoolId_kind_subjectId_key` UNIQUE (`schoolId`, `kind`, `subjectId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `SkillLinkReview_schoolId_status_idx` ON `SkillLinkReview`(`schoolId`, `status`);

CREATE TABLE `TeacherTest` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `classId` VARCHAR(191) NOT NULL,
  `teacherId` VARCHAR(191) NOT NULL,
  `createdById` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `testType` VARCHAR(24) NOT NULL,
  `levelMode` VARCHAR(8) NOT NULL DEFAULT 'SAME',
  `skillIds` JSON NOT NULL,
  `openAt` DATETIME(3),
  `dueAt` DATETIME(3),
  `timeLimitMin` INTEGER,
  `shuffle` BOOLEAN NOT NULL DEFAULT false,
  `templateId` VARCHAR(191),
  `reteachAt` DATETIME(3),
  `nafsPlanAt` DATETIME(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `deletedAt` DATETIME(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `TeacherTest_classId_createdAt_idx` ON `TeacherTest`(`classId`, `createdAt`);

CREATE INDEX `TeacherTest_schoolId_teacherId_idx` ON `TeacherTest`(`schoolId`, `teacherId`);

CREATE TABLE `TestTemplate` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `createdById` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `testType` VARCHAR(24) NOT NULL,
  `spec` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `deletedAt` DATETIME(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `TestTemplate_schoolId_createdById_idx` ON `TestTemplate`(`schoolId`, `createdById`);

CREATE TABLE `TtsAudio` (
  `id` VARCHAR(191) NOT NULL,
  `textHash` VARCHAR(64) NOT NULL,
  `provider` VARCHAR(20) NOT NULL,
  `voice` VARCHAR(120) NOT NULL,
  `mime` VARCHAR(40) NOT NULL,
  `bytes` MEDIUMBLOB NOT NULL,
  `size` INTEGER NOT NULL,
  `durationMs` INTEGER NOT NULL,
  `chars` INTEGER NOT NULL,
  `timings` MEDIUMTEXT NOT NULL,
  `source` VARCHAR(80),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `TtsAudio_textHash_key` UNIQUE (`textHash`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `StudentReward` (
  `studentId` VARCHAR(191) NOT NULL,
  `coins` INTEGER NOT NULL DEFAULT 0,
  `earned` INTEGER NOT NULL DEFAULT 0,
  `avatar` JSON,
  `favoriteBadge` VARCHAR(40),
  `syncedAt` DATETIME(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`studentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CoinLedger` (
  `id` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `amount` INTEGER NOT NULL,
  `reason` VARCHAR(24) NOT NULL,
  `refId` VARCHAR(120) NOT NULL,
  `note` VARCHAR(200),
  `createdById` VARCHAR(191),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `CoinLedger_studentId_reason_refId_key` UNIQUE (`studentId`, `reason`, `refId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `CoinLedger_studentId_createdAt_idx` ON `CoinLedger`(`studentId`, `createdAt`);

CREATE TABLE `QotdAnswer` (
  `id` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `day` VARCHAR(10) NOT NULL,
  `questionId` VARCHAR(191) NOT NULL,
  `skillId` VARCHAR(191),
  `level` VARCHAR(8) NOT NULL,
  `correct` BOOLEAN NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `QotdAnswer_studentId_day_key` UNIQUE (`studentId`, `day`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `QotdAnswer_studentId_correct_idx` ON `QotdAnswer`(`studentId`, `correct`);

CREATE TABLE `Certificate` (
  `id` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191) NOT NULL,
  `studentId` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(12) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `detail` VARCHAR(300),
  `refId` VARCHAR(120) NOT NULL,
  `createdById` VARCHAR(191),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `Certificate_studentId_kind_refId_key` UNIQUE (`studentId`, `kind`, `refId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `Certificate_studentId_createdAt_idx` ON `Certificate`(`studentId`, `createdAt`);

CREATE TABLE `Feedback` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `schoolId` VARCHAR(191),
  `role` VARCHAR(20) NOT NULL,
  `path` VARCHAR(300),
  `message` VARCHAR(2000) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `resolved` BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `Feedback_schoolId_resolved_createdAt_idx` ON `Feedback`(`schoolId`, `resolved`, `createdAt`);

CREATE INDEX `Feedback_userId_createdAt_idx` ON `Feedback`(`userId`, `createdAt`);

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
ALTER TABLE `CurriculumMapNode` ADD CONSTRAINT `CurriculumMapNode_gradeId_fkey` FOREIGN KEY (`gradeId`) REFERENCES `Grade`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `CurriculumMapNode` ADD CONSTRAINT `CurriculumMapNode_bookId_fkey` FOREIGN KEY (`bookId`) REFERENCES `Book`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `CurriculumMapNode` ADD CONSTRAINT `CurriculumMapNode_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `CurriculumMapNode`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `QuestionMapLink` ADD CONSTRAINT `QuestionMapLink_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `Question`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `QuestionMapLink` ADD CONSTRAINT `QuestionMapLink_nodeId_fkey` FOREIGN KEY (`nodeId`) REFERENCES `CurriculumMapNode`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `QuestionUse` ADD CONSTRAINT `QuestionUse_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `Question`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
