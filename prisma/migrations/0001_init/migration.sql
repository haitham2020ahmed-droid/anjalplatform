-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `username` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NULL,
    `displayName` VARCHAR(191) NOT NULL,
    `role` ENUM('SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'STUDENT', 'PARENT') NOT NULL,
    `schoolId` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sessionVersion` INTEGER NOT NULL DEFAULT 0,
    `mustChangePassword` BOOLEAN NOT NULL DEFAULT false,
    `passwordChangedAt` DATETIME(3) NULL,
    `lastLoginAt` DATETIME(3) NULL,
    `failedLogins` INTEGER NOT NULL DEFAULT 0,
    `lockedUntil` DATETIME(3) NULL,
    `uiLang` VARCHAR(5) NULL,
    `tourSeenAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    UNIQUE INDEX `User_username_key`(`username`),
    INDEX `User_schoolId_role_idx`(`schoolId`, `role`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Session` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ip` VARCHAR(191) NULL,
    `userAgent` VARCHAR(255) NULL,

    INDEX `Session_userId_idx`(`userId`),
    INDEX `Session_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RolePermission` (
    `id` VARCHAR(191) NOT NULL,
    `role` ENUM('SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'STUDENT', 'PARENT') NOT NULL,
    `permission` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `RolePermission_role_permission_key`(`role`, `permission`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `School` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `logoUrl` VARCHAR(191) NULL,
    `timezone` VARCHAR(191) NOT NULL DEFAULT 'Asia/Riyadh',
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `School_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SchoolSetting` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `value` JSON NOT NULL,
    `updatedBy` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SchoolSetting_schoolId_key_key`(`schoolId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AcademicYear` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NOT NULL,
    `isCurrent` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `AcademicYear_schoolId_name_key`(`schoolId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Term` (
    `id` VARCHAR(191) NOT NULL,
    `academicYearId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Term_academicYearId_name_key`(`academicYearId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Grade` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `level` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `Grade_schoolId_level_key`(`schoolId`, `level`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Class` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `gradeId` VARCHAR(191) NOT NULL,
    `academicYearId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deletedAt` DATETIME(3) NULL,

    INDEX `Class_gradeId_idx`(`gradeId`),
    UNIQUE INDEX `Class_academicYearId_name_key`(`academicYearId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Teacher` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NULL,

    UNIQUE INDEX `Teacher_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClassTeacher` (
    `classId` VARCHAR(191) NOT NULL,
    `teacherId` VARCHAR(191) NOT NULL,
    `isLead` BOOLEAN NOT NULL DEFAULT true,

    INDEX `ClassTeacher_teacherId_idx`(`teacherId`),
    PRIMARY KEY (`classId`, `teacherId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Student` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `gradeId` VARCHAR(191) NOT NULL,
    `studentNumber` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Student_userId_key`(`userId`),
    INDEX `Student_gradeId_idx`(`gradeId`),
    UNIQUE INDEX `Student_schoolId_studentNumber_key`(`schoolId`, `studentNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClassMembership` (
    `classId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `leftAt` DATETIME(3) NULL,

    INDEX `ClassMembership_studentId_idx`(`studentId`),
    PRIMARY KEY (`classId`, `studentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Parent` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `Parent_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ParentStudent` (
    `parentId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `relationship` VARCHAR(191) NULL,

    INDEX `ParentStudent_studentId_idx`(`studentId`),
    PRIMARY KEY (`parentId`, `studentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Book` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `publisher` VARCHAR(191) NULL,
    `edition` VARCHAR(191) NULL,

    UNIQUE INDEX `Book_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Curriculum` (
    `id` VARCHAR(191) NOT NULL,
    `gradeId` VARCHAR(191) NOT NULL,
    `bookId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Curriculum_gradeId_bookId_key`(`gradeId`, `bookId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Unit` (
    `id` VARCHAR(191) NOT NULL,
    `curriculumId` VARCHAR(191) NOT NULL,
    `number` INTEGER NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Unit_curriculumId_number_key`(`curriculumId`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Lesson` (
    `id` VARCHAR(191) NOT NULL,
    `unitId` VARCHAR(191) NOT NULL,
    `number` INTEGER NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `genre` VARCHAR(191) NULL,
    `weeks` JSON NULL,
    `texts` JSON NULL,
    `metadata` JSON NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Lesson_unitId_number_key`(`unitId`, `number`),
    UNIQUE INDEX `Lesson_unitId_code_key`(`unitId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SkillFamily` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `domain` ENUM('READING', 'VOCABULARY', 'GRAMMAR', 'LANGUAGE', 'WRITING', 'WORD_STUDY') NOT NULL,
    `category` ENUM('LITERATURE', 'INFORMATIONAL', 'COMPREHENSION', 'VOCABULARY', 'WORD_STUDY', 'GRAMMAR', 'MECHANICS', 'PHONICS_WORD_STUDY', 'WRITING') NOT NULL,
    `mapGoalAreaId` VARCHAR(191) NULL,

    UNIQUE INDEX `SkillFamily_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Skill` (
    `id` VARCHAR(191) NOT NULL,
    `curriculumId` VARCHAR(191) NOT NULL,
    `familyId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `domain` ENUM('READING', 'VOCABULARY', 'GRAMMAR', 'LANGUAGE', 'WRITING', 'WORD_STUDY') NOT NULL,
    `category` ENUM('LITERATURE', 'INFORMATIONAL', 'COMPREHENSION', 'VOCABULARY', 'WORD_STUDY', 'GRAMMAR', 'MECHANICS', 'PHONICS_WORD_STUDY', 'WRITING') NOT NULL,
    `sequence` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `deletedAt` DATETIME(3) NULL,

    INDEX `Skill_familyId_idx`(`familyId`),
    INDEX `Skill_domain_idx`(`domain`),
    UNIQUE INDEX `Skill_curriculumId_code_key`(`curriculumId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Subskill` (
    `id` VARCHAR(191) NOT NULL,
    `skillId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `content` JSON NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Subskill_skillId_code_key`(`skillId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LessonSkill` (
    `lessonId` VARCHAR(191) NOT NULL,
    `skillId` VARCHAR(191) NOT NULL,
    `subskillId` VARCHAR(191) NULL,
    `role` ENUM('COMPREHENSION_SKILL', 'STRATEGY_AND_FEATURE', 'VOCABULARY_STRATEGY', 'AUTHORS_CRAFT', 'GRAMMAR', 'SPELLING', 'WRITING') NOT NULL,
    `label` VARCHAR(191) NOT NULL,

    INDEX `LessonSkill_skillId_idx`(`skillId`),
    PRIMARY KEY (`lessonId`, `skillId`, `label`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UnitSkill` (
    `unitId` VARCHAR(191) NOT NULL,
    `skillId` VARCHAR(191) NOT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,

    INDEX `UnitSkill_skillId_idx`(`skillId`),
    PRIMARY KEY (`unitId`, `skillId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Standard` (
    `id` VARCHAR(191) NOT NULL,
    `framework` ENUM('CCSS_ELA', 'MAP_CONTINUUM', 'CURRICULUM_MAP', 'SCHOOL_OBJECTIVE') NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `gradeLevel` INTEGER NULL,
    `strand` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `Standard_framework_code_key`(`framework`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SkillStandard` (
    `skillId` VARCHAR(191) NOT NULL,
    `standardId` VARCHAR(191) NOT NULL,
    `isPrimary` BOOLEAN NOT NULL DEFAULT false,

    INDEX `SkillStandard_standardId_idx`(`standardId`),
    PRIMARY KEY (`skillId`, `standardId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
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

    INDEX `LearningStatement_subject_ritLow_idx`(`subject`, `ritLow`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MapGoalArea` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `MapGoalArea_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SkillPrerequisite` (
    `skillId` VARCHAR(191) NOT NULL,
    `prerequisiteSkillId` VARCHAR(191) NOT NULL,
    `weight` DOUBLE NOT NULL DEFAULT 0.5,
    `minimumMastery` INTEGER NOT NULL DEFAULT 60,

    INDEX `SkillPrerequisite_prerequisiteSkillId_idx`(`prerequisiteSkillId`),
    PRIMARY KEY (`skillId`, `prerequisiteSkillId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReadingPassage` (
    `id` VARCHAR(191) NOT NULL,
    `externalRef` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `body` MEDIUMTEXT NOT NULL,
    `genre` VARCHAR(191) NULL,
    `gradeBand` VARCHAR(191) NULL,
    `wordCount` INTEGER NOT NULL,
    `sentenceCount` INTEGER NOT NULL,
    `avgSentenceLength` DOUBLE NOT NULL,
    `avgWordLength` DOUBLE NOT NULL,
    `gradeLevel` INTEGER NULL,
    `platformReadingLevel` INTEGER NULL,
    `estimatedDifficulty` DOUBLE NULL,
    `status` ENUM('DRAFT', 'UNDER_REVIEW', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `origin` ENUM('TEACHER_AUTHORED', 'SCHOOL_BOOKLET', 'IMPORTED', 'AI_GENERATED', 'DEMO') NOT NULL DEFAULT 'TEACHER_AUTHORED',
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `ReadingPassage_externalRef_key`(`externalRef`),
    INDEX `ReadingPassage_platformReadingLevel_idx`(`platformReadingLevel`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OfficialReadingMeasure` (
    `id` VARCHAR(191) NOT NULL,
    `passageId` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `value` VARCHAR(191) NOT NULL,
    `sourceRef` VARCHAR(191) NULL,
    `importedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QuestionType` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `isAutoScored` BOOLEAN NOT NULL DEFAULT true,
    `schema` JSON NULL,

    UNIQUE INDEX `QuestionType_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Question` (
    `id` VARCHAR(191) NOT NULL,
    `externalRef` VARCHAR(191) NULL,
    `skillId` VARCHAR(191) NOT NULL,
    `subskillId` VARCHAR(191) NULL,
    `lessonId` VARCHAR(191) NULL,
    `passageId` VARCHAR(191) NULL,
    `imageId` VARCHAR(191) NULL,
    `standardId` VARCHAR(191) NULL,
    `typeId` VARCHAR(191) NOT NULL,
    `stem` TEXT NOT NULL,
    `content` JSON NOT NULL,
    `hint` TEXT NULL,
    `difficultyLevel` INTEGER NOT NULL,
    `irtA` DOUBLE NOT NULL DEFAULT 1.0,
    `irtB` DOUBLE NOT NULL,
    `irtC` DOUBLE NOT NULL DEFAULT 0.0,
    `calibrated` BOOLEAN NOT NULL DEFAULT false,
    `estimatedSeconds` INTEGER NOT NULL DEFAULT 45,
    `tags` JSON NULL,
    `status` ENUM('DRAFT', 'UNDER_REVIEW', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `origin` ENUM('TEACHER_AUTHORED', 'SCHOOL_BOOKLET', 'IMPORTED', 'AI_GENERATED', 'DEMO') NOT NULL DEFAULT 'TEACHER_AUTHORED',
    `aiStatus` ENUM('AI_GENERATED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED') NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdById` VARCHAR(191) NULL,
    `reviewedById` VARCHAR(191) NULL,
    `publishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,
    `lexile` INTEGER NULL,
    `mapTest` VARCHAR(20) NULL,
    `mapInstructionalArea` VARCHAR(80) NULL,
    `mapAreaSource` VARCHAR(16) NULL,
    `dok` INTEGER NULL,
    `dokSource` VARCHAR(8) NULL,
    `estimatedLevel` INTEGER NULL,
    `estimatedB` DOUBLE NULL,
    `difficultyFactors` JSON NULL,
    `difficultySource` VARCHAR(12) NULL,
    `textLevel` INTEGER NULL,
    `intelligenceAt` DATETIME(3) NULL,
    `metaReviewedAt` DATETIME(3) NULL,

    INDEX `Question_skillId_status_irtB_idx`(`skillId`, `status`, `irtB`),
    INDEX `Question_status_origin_idx`(`status`, `origin`),
    INDEX `Question_standardId_idx`(`standardId`),
    INDEX `Question_mapInstructionalArea_status_idx`(`mapInstructionalArea`, `status`),
    INDEX `Question_intelligenceAt_idx`(`intelligenceAt`),
    UNIQUE INDEX `Question_skillId_externalRef_key`(`skillId`, `externalRef`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QuestionOption` (
    `id` VARCHAR(191) NOT NULL,
    `questionId` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `text` TEXT NOT NULL,
    `isCorrect` BOOLEAN NOT NULL DEFAULT false,
    `rationale` TEXT NULL,
    `order` INTEGER NOT NULL,
    `misconception` VARCHAR(40) NULL,
    `misconceptionSource` VARCHAR(8) NULL,

    INDEX `QuestionOption_questionId_idx`(`questionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QuestionAnswer` (
    `id` VARCHAR(191) NOT NULL,
    `questionId` VARCHAR(191) NOT NULL,
    `value` JSON NOT NULL,
    `isPrimary` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QuestionExplanation` (
    `id` VARCHAR(191) NOT NULL,
    `questionId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `body` JSON NOT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QuestionStats` (
    `questionId` VARCHAR(191) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `correct` INTEGER NOT NULL DEFAULT 0,
    `pValue` DOUBLE NULL,
    `pointBiserial` DOUBLE NULL,
    `avgResponseMs` INTEGER NULL,
    `distractorCounts` JSON NULL,
    `flags` JSON NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`questionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PracticeSession` (
    `id` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `skillId` VARCHAR(191) NULL,
    `assessmentId` VARCHAR(191) NULL,
    `assignmentId` VARCHAR(191) NULL,
    `mode` ENUM('ADAPTIVE_PRACTICE', 'DIAGNOSTIC', 'PLACEMENT', 'UNIT_QUIZ', 'BENCHMARK', 'TEACHER_QUIZ', 'FINAL') NOT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `endedAt` DATETIME(3) NULL,
    `questionCount` INTEGER NOT NULL DEFAULT 0,
    `correctCount` INTEGER NOT NULL DEFAULT 0,
    `activeMs` INTEGER NOT NULL DEFAULT 0,
    `currentQuestionId` VARCHAR(191) NULL,
    `currentServedAt` DATETIME(3) NULL,
    `currentOrder` JSON NULL,
    `lastTargetB` DOUBLE NULL,
    `endReason` VARCHAR(191) NULL,
    `goalReachedAt` DATETIME(3) NULL,
    `hintQuestionId` VARCHAR(191) NULL,

    INDEX `PracticeSession_studentId_startedAt_idx`(`studentId`, `startedAt`),
    INDEX `PracticeSession_assignmentId_idx`(`assignmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QuestionAttempt` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `sessionId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `questionId` VARCHAR(191) NOT NULL,
    `skillId` VARCHAR(191) NOT NULL,
    `response` JSON NOT NULL,
    `isCorrect` BOOLEAN NOT NULL,
    `partialCredit` DOUBLE NULL,
    `responseMs` INTEGER NOT NULL,
    `usedHint` BOOLEAN NOT NULL DEFAULT false,
    `rapidGuess` BOOLEAN NOT NULL DEFAULT false,
    `difficultyB` DOUBLE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `misconception` VARCHAR(40) NULL,
    `source` VARCHAR(12) NULL,

    INDEX `QuestionAttempt_studentId_skillId_createdAt_idx`(`studentId`, `skillId`, `createdAt`),
    INDEX `QuestionAttempt_studentId_createdAt_idx`(`studentId`, `createdAt`),
    INDEX `QuestionAttempt_questionId_createdAt_idx`(`questionId`, `createdAt`),
    INDEX `QuestionAttempt_skillId_createdAt_idx`(`skillId`, `createdAt`),
    INDEX `QuestionAttempt_sessionId_idx`(`sessionId`),
    INDEX `QuestionAttempt_studentId_misconception_idx`(`studentId`, `misconception`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AdaptiveDecisionLog` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `studentId` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `attemptId` BIGINT NULL,
    `questionId` VARCHAR(191) NULL,
    `skillId` VARCHAR(191) NOT NULL,
    `previousTheta` DOUBLE NOT NULL,
    `newTheta` DOUBLE NOT NULL,
    `thetaSE` DOUBLE NOT NULL,
    `questionDifficulty` DOUBLE NULL,
    `responseCorrect` BOOLEAN NULL,
    `responseMs` INTEGER NULL,
    `masteryBefore` DOUBLE NULL,
    `masteryAfter` DOUBLE NULL,
    `nextQuestionId` VARCHAR(191) NULL,
    `nextTargetB` DOUBLE NULL,
    `reason` TEXT NOT NULL,
    `reasonCode` VARCHAR(191) NOT NULL,
    `engineVersion` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AdaptiveDecisionLog_studentId_createdAt_idx`(`studentId`, `createdAt`),
    INDEX `AdaptiveDecisionLog_sessionId_idx`(`sessionId`),
    INDEX `AdaptiveDecisionLog_questionId_idx`(`questionId`),
    INDEX `AdaptiveDecisionLog_attemptId_idx`(`attemptId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StudentAbility` (
    `id` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `scope` VARCHAR(191) NOT NULL,
    `skillId` VARCHAR(191) NULL,
    `domain` ENUM('READING', 'VOCABULARY', 'GRAMMAR', 'LANGUAGE', 'WRITING', 'WORD_STUDY') NULL,
    `theta` DOUBLE NOT NULL DEFAULT 0,
    `thetaSE` DOUBLE NOT NULL DEFAULT 1,
    `responses` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `StudentAbility_skillId_idx`(`skillId`),
    UNIQUE INDEX `StudentAbility_studentId_scope_key`(`studentId`, `scope`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AbilitySnapshot` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `studentId` VARCHAR(191) NOT NULL,
    `scope` VARCHAR(191) NOT NULL,
    `theta` DOUBLE NOT NULL,
    `mastery` DOUBLE NULL,
    `takenOn` DATE NOT NULL,

    INDEX `AbilitySnapshot_takenOn_idx`(`takenOn`),
    UNIQUE INDEX `AbilitySnapshot_studentId_scope_takenOn_key`(`studentId`, `scope`, `takenOn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StudentSkillMastery` (
    `studentId` VARCHAR(191) NOT NULL,
    `skillId` VARCHAR(191) NOT NULL,
    `score` DOUBLE NOT NULL DEFAULT 0,
    `band` ENUM('BEGINNING', 'DEVELOPING', 'APPROACHING', 'PROFICIENT', 'MASTERED') NOT NULL DEFAULT 'BEGINNING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `correct` INTEGER NOT NULL DEFAULT 0,
    `maxLevelCorrect` INTEGER NOT NULL DEFAULT 0,
    `isMastered` BOOLEAN NOT NULL DEFAULT false,
    `masteredAt` DATETIME(3) NULL,
    `lastPracticedAt` DATETIME(3) NULL,
    `components` JSON NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `nextReviewAt` DATETIME(3) NULL,
    `reviewStep` INTEGER NOT NULL DEFAULT 0,

    INDEX `StudentSkillMastery_skillId_band_idx`(`skillId`, `band`),
    PRIMARY KEY (`studentId`, `skillId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReadingLevelBand` (
    `id` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `minPrl` INTEGER NOT NULL,
    `maxPrl` INTEGER NOT NULL,
    `gradeBand` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StudentReadingRange` (
    `id` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `lowPrl` INTEGER NOT NULL,
    `highPrl` INTEGER NOT NULL,
    `evidence` INTEGER NOT NULL,
    `computedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StudentReadingRange_studentId_computedAt_idx`(`studentId`, `computedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Assignment` (
    `id` VARCHAR(191) NOT NULL,
    `classId` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `target` ENUM('SKILL', 'UNIT', 'ASSESSMENT') NOT NULL,
    `unitId` VARCHAR(191) NULL,
    `skillIds` JSON NULL,
    `skillId` VARCHAR(191) NULL,
    `startAt` DATETIME(3) NULL,
    `note` TEXT NULL,
    `track` VARCHAR(16) NOT NULL DEFAULT 'CURRICULUM',
    `program` VARCHAR(16) NULL,
    `assessmentId` VARCHAR(191) NULL,
    `targetMastery` INTEGER NULL,
    `curriculumPlanId` VARCHAR(191) NULL,
    `dueAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deletedAt` DATETIME(3) NULL,
    `testId` VARCHAR(191) NULL,
    `shuffle` BOOLEAN NOT NULL DEFAULT false,
    `questionIds` JSON NULL,

    INDEX `Assignment_classId_dueAt_idx`(`classId`, `dueAt`),
    INDEX `Assignment_skillId_idx`(`skillId`),
    INDEX `Assignment_testId_idx`(`testId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AssignmentStudent` (
    `assignmentId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `status` ENUM('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE') NOT NULL DEFAULT 'NOT_STARTED',
    `progress` DOUBLE NOT NULL DEFAULT 0,
    `completedAt` DATETIME(3) NULL,

    INDEX `AssignmentStudent_studentId_status_idx`(`studentId`, `status`),
    PRIMARY KEY (`assignmentId`, `studentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Assessment` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `type` ENUM('DIAGNOSTIC', 'PLACEMENT', 'UNIT_QUIZ', 'BENCHMARK', 'TEACHER_QUIZ', 'FINAL') NOT NULL,
    `unitId` VARCHAR(191) NULL,
    `isAdaptive` BOOLEAN NOT NULL DEFAULT false,
    `maxQuestions` INTEGER NULL,
    `targetCorrect` INTEGER NULL,
    `timeLimitMin` INTEGER NULL,
    `status` ENUM('DRAFT', 'UNDER_REVIEW', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AssessmentQuestion` (
    `assessmentId` VARCHAR(191) NOT NULL,
    `questionId` VARCHAR(191) NOT NULL,
    `order` INTEGER NOT NULL,
    `points` DOUBLE NOT NULL DEFAULT 1,

    PRIMARY KEY (`assessmentId`, `questionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExternalAssessmentSource` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `notes` TEXT NULL,

    UNIQUE INDEX `ExternalAssessmentSource_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExternalSkillRef` (
    `id` VARCHAR(191) NOT NULL,
    `sourceId` VARCHAR(191) NOT NULL,
    `externalCode` VARCHAR(191) NOT NULL,
    `externalName` VARCHAR(191) NOT NULL,
    `gradeLevel` INTEGER NULL,
    `skillId` VARCHAR(191) NULL,

    UNIQUE INDEX `ExternalSkillRef_sourceId_externalCode_gradeLevel_key`(`sourceId`, `externalCode`, `gradeLevel`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExternalAssessmentResult` (
    `id` VARCHAR(191) NOT NULL,
    `sourceId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `importJobId` VARCHAR(191) NULL,
    `externalSkill` VARCHAR(191) NULL,
    `score` DOUBLE NULL,
    `questions` INTEGER NULL,
    `timeSpentSec` INTEGER NULL,
    `takenOn` DATETIME(3) NULL,
    `raw` JSON NOT NULL,
    `importedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ExternalAssessmentResult_studentId_sourceId_idx`(`studentId`, `sourceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MapResult` (
    `id` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `importJobId` VARCHAR(191) NULL,
    `testDate` DATETIME(3) NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `goalName` VARCHAR(191) NULL,
    `goalAreaId` VARCHAR(191) NULL,
    `rit` INTEGER NOT NULL,
    `ritSE` DOUBLE NULL,
    `achievementPercentile` INTEGER NULL,
    `growthPercentile` INTEGER NULL,
    `projectedGrowth` INTEGER NULL,
    `termName` VARCHAR(191) NULL,
    `importedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lexile` INTEGER NULL,
    `rapidGuessPct` INTEGER NULL,
    `observedGrowth` INTEGER NULL,
    `conditionalGrowthIndex` DOUBLE NULL,
    `metProjectedGrowth` VARCHAR(8) NULL,
    `testMinutes` INTEGER NULL,
    `lexileLow` INTEGER NULL,
    `lexileHigh` INTEGER NULL,
    `typicalGrowth` INTEGER NULL,
    `proficiency` VARCHAR(40) NULL,
    `descriptor` VARCHAR(10) NULL,

    INDEX `MapResult_studentId_testDate_idx`(`studentId`, `testDate`),
    INDEX `MapResult_studentId_subject_testDate_idx`(`studentId`, `subject`, `testDate`),
    INDEX `MapResult_termName_idx`(`termName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BenchmarkReference` (
    `id` VARCHAR(191) NOT NULL,
    `scope` VARCHAR(191) NOT NULL,
    `metric` VARCHAR(191) NOT NULL,
    `gradeLevel` INTEGER NOT NULL,
    `season` VARCHAR(191) NULL,
    `value` DOUBLE NOT NULL,
    `source` VARCHAR(191) NOT NULL,
    `importedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `BenchmarkReference_scope_metric_gradeLevel_season_key`(`scope`, `metric`, `gradeLevel`, `season`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
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
    `preview` JSON NULL,
    `errors` JSON NULL,
    `fileSha256` VARCHAR(191) NULL,
    `payload` JSON NULL,
    `options` JSON NULL,
    `summary` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,

    INDEX `ImportJob_kind_status_idx`(`kind`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Recommendation` (
    `id` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `skillId` VARCHAR(191) NOT NULL,
    `targetLevel` INTEGER NOT NULL,
    `score` DOUBLE NOT NULL,
    `reasons` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `dismissedAt` DATETIME(3) NULL,
    `source` VARCHAR(16) NULL,
    `masteryAtRec` DOUBLE NULL,
    `followedAt` DATETIME(3) NULL,
    `evaluatedAt` DATETIME(3) NULL,
    `masteryAfter` DOUBLE NULL,
    `outcome` VARCHAR(12) NULL,

    INDEX `Recommendation_studentId_createdAt_idx`(`studentId`, `createdAt`),
    INDEX `Recommendation_studentId_skillId_createdAt_idx`(`studentId`, `skillId`, `createdAt`),
    INDEX `Recommendation_evaluatedAt_createdAt_idx`(`evaluatedAt`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InterventionAlert` (
    `id` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `skillId` VARCHAR(191) NULL,
    `ruleCode` VARCHAR(191) NOT NULL,
    `message` VARCHAR(191) NOT NULL,
    `evidence` JSON NOT NULL,
    `resolvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `InterventionAlert_studentId_resolvedAt_idx`(`studentId`, `resolvedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` ENUM('NEW_ASSIGNMENT', 'ASSIGNMENT_DUE', 'SKILL_MASTERED', 'TEACHER_FEEDBACK', 'NEW_BADGE', 'ASSESSMENT_AVAILABLE', 'PARENT_PROGRESS', 'INTERVENTION_ALERT', 'REPORT_APPROVAL', 'DAILY_DIGEST', 'ADMIN_MESSAGE', 'TIER_CHANGE') NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `link` VARCHAR(191) NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_userId_readAt_idx`(`userId`, `readAt`),
    INDEX `Notification_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Badge` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `criteria` JSON NOT NULL,

    UNIQUE INDEX `Badge_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StudentBadge` (
    `studentId` VARCHAR(191) NOT NULL,
    `badgeId` VARCHAR(191) NOT NULL,
    `awardedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`studentId`, `badgeId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `XpEvent` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `studentId` VARCHAR(191) NOT NULL,
    `points` INTEGER NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `XpEvent_studentId_createdAt_idx`(`studentId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `actorId` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NULL,
    `before` JSON NULL,
    `after` JSON NULL,
    `ip` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_entityType_entityId_idx`(`entityType`, `entityId`),
    INDEX `AuditLog_actorId_createdAt_idx`(`actorId`, `createdAt`),
    INDEX `AuditLog_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StudentDailyActivity` (
    `studentId` VARCHAR(191) NOT NULL,
    `day` DATE NOT NULL,
    `questions` INTEGER NOT NULL DEFAULT 0,
    `correct` INTEGER NOT NULL DEFAULT 0,
    `activeMs` INTEGER NOT NULL DEFAULT 0,
    `skillsPracticed` INTEGER NOT NULL DEFAULT 0,
    `maxLevel` INTEGER NOT NULL DEFAULT 0,

    INDEX `StudentDailyActivity_day_idx`(`day`),
    PRIMARY KEY (`studentId`, `day`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClassSkillDaily` (
    `classId` VARCHAR(191) NOT NULL,
    `skillId` VARCHAR(191) NOT NULL,
    `day` DATE NOT NULL,
    `studentsPracticed` INTEGER NOT NULL DEFAULT 0,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `correct` INTEGER NOT NULL DEFAULT 0,
    `avgMastery` DOUBLE NULL,
    `masteredStudents` INTEGER NOT NULL DEFAULT 0,

    INDEX `ClassSkillDaily_skillId_day_idx`(`skillId`, `day`),
    PRIMARY KEY (`classId`, `skillId`, `day`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RateLimitBucket` (
    `key` VARCHAR(191) NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 0,
    `windowStart` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `RateLimitBucket_windowStart_idx`(`windowStart`),
    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
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

    UNIQUE INDEX `DiagnosticResult_sessionId_key`(`sessionId`),
    INDEX `DiagnosticResult_studentId_takenAt_idx`(`studentId`, `takenAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ImportedQuestionLog` (
    `id` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NOT NULL,
    `rowIndex` INTEGER NOT NULL,
    `status` ENUM('VALID', 'INVALID', 'DUPLICATE', 'IMPORTED', 'REPLACED', 'SKIPPED', 'FAILED') NOT NULL,
    `decision` ENUM('IMPORT', 'SKIP', 'REPLACE', 'FORCE') NOT NULL DEFAULT 'IMPORT',
    `selected` BOOLEAN NOT NULL DEFAULT true,
    `source` TEXT NOT NULL,
    `detected` JSON NOT NULL,
    `errors` JSON NULL,
    `warnings` JSON NULL,
    `duplicateOfId` VARCHAR(191) NULL,
    `similarity` DOUBLE NULL,
    `questionId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ImportedQuestionLog_jobId_status_idx`(`jobId`, `status`),
    UNIQUE INDEX `ImportedQuestionLog_jobId_rowIndex_key`(`jobId`, `rowIndex`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QuestionImage` (
    `id` VARCHAR(191) NOT NULL,
    `mime` VARCHAR(40) NOT NULL,
    `bytes` MEDIUMBLOB NOT NULL,
    `size` INTEGER NOT NULL,
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `sha256` VARCHAR(64) NOT NULL,
    `altText` VARCHAR(300) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `QuestionImage_sha256_idx`(`sha256`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CurriculumMapNode` (
    `id` VARCHAR(191) NOT NULL,
    `gradeId` VARCHAR(191) NOT NULL,
    `parentId` VARCHAR(191) NULL,
    `kind` ENUM('BOOK', 'UNIT', 'TEXT_SET', 'SELECTION', 'CATEGORY', 'LEVEL') NOT NULL,
    `code` VARCHAR(120) NOT NULL,
    `number` INTEGER NULL,
    `title` VARCHAR(255) NOT NULL,
    `heading` VARCHAR(255) NULL,
    `sharedRead` VARCHAR(255) NULL,
    `genre` VARCHAR(120) NULL,
    `categoryType` ENUM('CONCEPT_VOCABULARY', 'ANALYZE_CRAFT_AND_STRUCTURE', 'RESPOND_TO_READING') NULL,
    `skills` VARCHAR(500) NULL,
    `level` ENUM('ABOVE', 'ON', 'BELOW') NULL,
    `acceptsQuestions` BOOLEAN NOT NULL DEFAULT false,
    `bookId` VARCHAR(191) NULL,
    `sortOrder` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CurriculumMapNode_gradeId_parentId_sortOrder_idx`(`gradeId`, `parentId`, `sortOrder`),
    INDEX `CurriculumMapNode_acceptsQuestions_idx`(`acceptsQuestions`),
    UNIQUE INDEX `CurriculumMapNode_gradeId_code_key`(`gradeId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QuestionMapLink` (
    `questionId` VARCHAR(191) NOT NULL,
    `nodeId` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `QuestionMapLink_nodeId_idx`(`nodeId`),
    PRIMARY KEY (`questionId`, `nodeId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QuestionUse` (
    `questionId` VARCHAR(191) NOT NULL,
    `use` ENUM('PLACEMENT', 'MAP_TEST') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `QuestionUse_use_idx`(`use`),
    PRIMARY KEY (`questionId`, `use`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SchoolAsset` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(30) NOT NULL,
    `mime` VARCHAR(60) NOT NULL,
    `bytes` MEDIUMBLOB NOT NULL,
    `sha256` VARCHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SchoolAsset_schoolId_kind_idx`(`schoolId`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StudentLevel` (
    `studentId` VARCHAR(191) NOT NULL,
    `level` ENUM('ABOVE', 'ON', 'BELOW') NOT NULL,
    `source` VARCHAR(20) NOT NULL,
    `setById` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`studentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReadMasterArticle` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(60) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `topic` VARCHAR(191) NULL,
    `gradeLevel` INTEGER NOT NULL,
    `skillId` VARCHAR(191) NULL,
    `skillName` VARCHAR(191) NULL,
    `standardCode` VARCHAR(80) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ReadMasterArticle_schoolId_gradeLevel_idx`(`schoolId`, `gradeLevel`),
    UNIQUE INDEX `ReadMasterArticle_schoolId_code_key`(`schoolId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReadMasterVersion` (
    `id` VARCHAR(191) NOT NULL,
    `articleId` VARCHAR(191) NOT NULL,
    `level` ENUM('ABOVE', 'ON', 'BELOW') NOT NULL,
    `lexile` INTEGER NOT NULL,
    `body` TEXT NOT NULL,
    `wordCount` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ReadMasterVersion_articleId_level_key`(`articleId`, `level`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReadMasterQuestion` (
    `versionId` VARCHAR(191) NOT NULL,
    `questionId` VARCHAR(191) NOT NULL,
    `order` INTEGER NOT NULL,

    INDEX `ReadMasterQuestion_questionId_idx`(`questionId`),
    PRIMARY KEY (`versionId`, `questionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StudentReadingLexile` (
    `studentId` VARCHAR(191) NOT NULL,
    `lexile` INTEGER NOT NULL,
    `source` VARCHAR(20) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`studentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
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
    `seconds` INTEGER NULL,
    `rapid` INTEGER NULL,
    `practice` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ReadMasterAttempt_studentId_idx`(`studentId`),
    INDEX `ReadMasterAttempt_articleId_idx`(`articleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SkillPlan` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `classId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(12) NOT NULL DEFAULT 'PLACES',
    `targetCorrect` INTEGER NULL,
    `openUnits` JSON NULL,
    `unitDates` JSON NULL,
    `gradeLevel` INTEGER NOT NULL,
    `note` VARCHAR(1000) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SkillPlan_schoolId_classId_idx`(`schoolId`, `classId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SkillPlanItem` (
    `id` VARCHAR(191) NOT NULL,
    `planId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(80) NOT NULL,
    `label` VARCHAR(255) NOT NULL,
    `assignmentIds` JSON NOT NULL,
    `order` INTEGER NOT NULL,

    INDEX `SkillPlanItem_planId_idx`(`planId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LiveGame` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `classId` VARCHAR(191) NULL,
    `hostId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(8) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `questionIds` JSON NOT NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'LOBBY',
    `currentIndex` INTEGER NOT NULL DEFAULT -1,
    `questionStartedAt` DATETIME(3) NULL,
    `secondsPerQuestion` INTEGER NOT NULL DEFAULT 20,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,
    `mode` VARCHAR(32) NULL,
    `summary` JSON NULL,

    INDEX `LiveGame_code_status_idx`(`code`, `status`),
    INDEX `LiveGame_schoolId_createdAt_idx`(`schoolId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LiveGamePlayer` (
    `id` VARCHAR(191) NOT NULL,
    `gameId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `nickname` VARCHAR(60) NOT NULL,
    `score` INTEGER NOT NULL DEFAULT 0,
    `streak` INTEGER NOT NULL DEFAULT 0,
    `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `LiveGamePlayer_gameId_studentId_key`(`gameId`, `studentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
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

    INDEX `LiveGameAnswer_gameId_questionIndex_idx`(`gameId`, `questionIndex`),
    UNIQUE INDEX `LiveGameAnswer_playerId_questionIndex_key`(`playerId`, `questionIndex`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
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
    `liveGameId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `GamePlay_schoolId_createdAt_idx`(`schoolId`, `createdAt`),
    INDEX `GamePlay_studentId_createdAt_idx`(`studentId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GameRating` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `gameId` VARCHAR(32) NOT NULL,
    `stars` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `GameRating_schoolId_gameId_idx`(`schoolId`, `gameId`),
    UNIQUE INDEX `GameRating_studentId_gameId_key`(`studentId`, `gameId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LiveChallengeTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(150) NOT NULL,
    `spec` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LiveChallengeTemplate_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CrossGradeBridge` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `fromCode` VARCHAR(80) NOT NULL,
    `challengeCode` VARCHAR(80) NULL,
    `supportCode` VARCHAR(80) NULL,
    `source` VARCHAR(12) NOT NULL DEFAULT 'IMPORT',
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CrossGradeBridge_schoolId_fromCode_key`(`schoolId`, `fromCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StudentCategoryLevel` (
    `studentId` VARCHAR(191) NOT NULL,
    `category` VARCHAR(8) NOT NULL,
    `level` ENUM('ABOVE', 'ON', 'BELOW') NOT NULL,
    `source` VARCHAR(20) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`studentId`, `category`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
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
    `hint` TEXT NULL,
    `modelAnswer` TEXT NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `RespondActivity_schoolId_code_key`(`schoolId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RespondAssignment` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `classId` VARCHAR(191) NOT NULL,
    `setCode` VARCHAR(120) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `dueAt` DATETIME(3) NULL,
    `note` VARCHAR(1000) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deletedAt` DATETIME(3) NULL,

    INDEX `RespondAssignment_classId_createdAt_idx`(`classId`, `createdAt`),
    INDEX `RespondAssignment_schoolId_setCode_idx`(`schoolId`, `setCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RespondAssignmentStudent` (
    `assignmentId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `level` ENUM('ABOVE', 'ON', 'BELOW') NOT NULL,
    `finishedAt` DATETIME(3) NULL,
    `score` INTEGER NULL,
    `feedback` VARCHAR(1000) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `RespondAssignmentStudent_studentId_idx`(`studentId`),
    PRIMARY KEY (`assignmentId`, `studentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AiJob` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `tool` VARCHAR(20) NOT NULL,
    `scope` JSON NOT NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'QUEUED',
    `total` INTEGER NOT NULL DEFAULT 0,
    `done` INTEGER NOT NULL DEFAULT 0,
    `failed` INTEGER NOT NULL DEFAULT 0,
    `note` VARCHAR(500) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `finishedAt` DATETIME(3) NULL,

    INDEX `AiJob_schoolId_createdAt_idx`(`schoolId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AiJobItem` (
    `id` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NOT NULL,
    `targetId` VARCHAR(60) NOT NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `error` VARCHAR(500) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AiJobItem_jobId_status_idx`(`jobId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AiSuggestion` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NULL,
    `tool` VARCHAR(20) NOT NULL,
    `kind` VARCHAR(20) NOT NULL,
    `questionId` VARCHAR(60) NULL,
    `passageId` VARCHAR(60) NULL,
    `severity` INTEGER NOT NULL DEFAULT 3,
    `detail` TEXT NOT NULL,
    `data` JSON NOT NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'SUGGESTED',
    `reviewedById` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AiSuggestion_schoolId_tool_status_idx`(`schoolId`, `tool`, `status`),
    INDEX `AiSuggestion_questionId_idx`(`questionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AiRequestLog` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `tool` VARCHAR(20) NOT NULL,
    `provider` VARCHAR(20) NOT NULL,
    `model` VARCHAR(80) NOT NULL,
    `ok` BOOLEAN NOT NULL,
    `items` INTEGER NOT NULL DEFAULT 0,
    `ms` INTEGER NOT NULL DEFAULT 0,
    `error` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AiRequestLog_schoolId_createdAt_idx`(`schoolId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MapPlan` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `classId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(10) NOT NULL,
    `term` VARCHAR(40) NOT NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'DRAFT',
    `items` JSON NOT NULL,
    `note` VARCHAR(1000) NULL,
    `dueAt` DATETIME(3) NULL,
    `assignmentIds` JSON NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `sentAt` DATETIME(3) NULL,
    `editedAt` DATETIME(3) NULL,

    INDEX `MapPlan_classId_subject_term_idx`(`classId`, `subject`, `term`),
    INDEX `MapPlan_studentId_idx`(`studentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StudentAlert` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `classId` VARCHAR(191) NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(20) NOT NULL,
    `key` VARCHAR(120) NOT NULL,
    `detail` VARCHAR(500) NOT NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'OPEN',
    `action` VARCHAR(1000) NULL,
    `handledById` VARCHAR(191) NULL,
    `handledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StudentAlert_schoolId_status_idx`(`schoolId`, `status`),
    INDEX `StudentAlert_classId_status_idx`(`classId`, `status`),
    UNIQUE INDEX `StudentAlert_studentId_key_key`(`studentId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WordEntry` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `word` VARCHAR(64) NOT NULL,
    `phonetic` VARCHAR(120) NULL,
    `audioUrl` VARCHAR(500) NULL,
    `meanings` JSON NOT NULL,
    `source` VARCHAR(10) NOT NULL DEFAULT 'API',
    `isVocab` BOOLEAN NOT NULL DEFAULT false,
    `arabicGloss` VARCHAR(200) NULL,
    `contextSentence` VARCHAR(300) NULL,
    `updatedById` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `WordEntry_schoolId_word_key`(`schoolId`, `word`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StudentWord` (
    `studentId` VARCHAR(191) NOT NULL,
    `word` VARCHAR(64) NOT NULL,
    `lookups` INTEGER NOT NULL DEFAULT 1,
    `firstAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `quizRight` INTEGER NOT NULL DEFAULT 0,
    `quizWrong` INTEGER NOT NULL DEFAULT 0,
    `lastQuizAt` DATETIME(3) NULL,
    `nextReviewAt` DATETIME(3) NULL,
    `reviewStep` INTEGER NOT NULL DEFAULT 0,
    `myExample` VARCHAR(300) NULL,
    `notExample` VARCHAR(300) NULL,

    INDEX `StudentWord_studentId_lastAt_idx`(`studentId`, `lastAt`),
    PRIMARY KEY (`studentId`, `word`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MissingWord` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `word` VARCHAR(64) NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 1,
    `lastSentence` VARCHAR(300) NULL,
    `checkedAt` DATETIME(3) NULL,
    `firstAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MissingWord_schoolId_count_idx`(`schoolId`, `count`),
    UNIQUE INDEX `MissingWord_schoolId_word_key`(`schoolId`, `word`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkComment` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `assignmentId` VARCHAR(191) NULL,
    `authorId` VARCHAR(191) NOT NULL,
    `body` VARCHAR(2000) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `WorkComment_studentId_createdAt_idx`(`studentId`, `createdAt`),
    INDEX `WorkComment_assignmentId_idx`(`assignmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QuestionFlag` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `questionId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `reason` VARCHAR(40) NOT NULL,
    `note` VARCHAR(500) NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'OPEN',
    `resolvedById` VARCHAR(191) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `QuestionFlag_schoolId_status_idx`(`schoolId`, `status`),
    UNIQUE INDEX `QuestionFlag_questionId_studentId_key`(`questionId`, `studentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WeeklyGoal` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `scope` VARCHAR(10) NOT NULL,
    `ownerId` VARCHAR(191) NOT NULL,
    `weekStart` DATETIME(3) NOT NULL,
    `kind` VARCHAR(10) NOT NULL,
    `target` INTEGER NOT NULL,
    `title` VARCHAR(160) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `WeeklyGoal_scope_ownerId_weekStart_key`(`scope`, `ownerId`, `weekStart`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExitTicket` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `classId` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `questionIds` JSON NOT NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'OPEN',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `closedAt` DATETIME(3) NULL,

    INDEX `ExitTicket_classId_status_idx`(`classId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExitTicketAnswer` (
    `ticketId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `questionId` VARCHAR(191) NOT NULL,
    `isCorrect` BOOLEAN NOT NULL,
    `response` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ExitTicketAnswer_ticketId_idx`(`ticketId`),
    PRIMARY KEY (`ticketId`, `studentId`, `questionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Worksheet` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `grade` INTEGER NULL,
    `questionIds` JSON NOT NULL,
    `shared` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Worksheet_schoolId_shared_idx`(`schoolId`, `shared`),
    INDEX `Worksheet_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MapSimWindow` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(160) NOT NULL,
    `grade` INTEGER NULL,
    `season` VARCHAR(10) NOT NULL,
    `subjects` JSON NOT NULL,
    `items` INTEGER NOT NULL DEFAULT 50,
    `opensAt` DATETIME(3) NOT NULL,
    `closesAt` DATETIME(3) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MapSimWindow_schoolId_closesAt_idx`(`schoolId`, `closesAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MapSimSession` (
    `id` VARCHAR(191) NOT NULL,
    `windowId` VARCHAR(191) NULL,
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
    `servedQuestionId` VARCHAR(191) NULL,
    `servedAt` DATETIME(3) NULL,
    `resultRit` INTEGER NULL,
    `resultLow` INTEGER NULL,
    `resultHigh` INTEGER NULL,
    `areas` JSON NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,

    INDEX `MapSimSession_windowId_studentId_idx`(`windowId`, `studentId`),
    INDEX `MapSimSession_studentId_status_idx`(`studentId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
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

    INDEX `MapSimAnswer_questionId_idx`(`questionId`),
    PRIMARY KEY (`sessionId`, `n`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TeacherNote` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `authorId` VARCHAR(191) NOT NULL,
    `body` VARCHAR(1000) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TeacherNote_studentId_createdAt_idx`(`studentId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WritingTask` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `classId` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(12) NOT NULL DEFAULT 'WRITE',
    `title` VARCHAR(191) NOT NULL,
    `prompt` TEXT NOT NULL,
    `passage` TEXT NULL,
    `minWords` INTEGER NULL,
    `dueAt` DATETIME(3) NULL,
    `genre` VARCHAR(14) NOT NULL DEFAULT 'FREE',
    `skillId` VARCHAR(191) NULL,
    `staged` BOOLEAN NOT NULL DEFAULT false,
    `sources` JSON NULL,
    `research` JSON NULL,
    `aiFeedback` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deletedAt` DATETIME(3) NULL,

    INDEX `WritingTask_classId_createdAt_idx`(`classId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WritingSubmission` (
    `taskId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `text` TEXT NULL,
    `audio` MEDIUMBLOB NULL,
    `audioType` VARCHAR(60) NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'DRAFT',
    `scores` JSON NULL,
    `comment` VARCHAR(2000) NULL,
    `scoredById` VARCHAR(191) NULL,
    `wcpm` INTEGER NULL,
    `submittedAt` DATETIME(3) NULL,
    `scoredAt` DATETIME(3) NULL,
    `stage` VARCHAR(8) NULL,
    `plan` JSON NULL,
    `firstDraft` TEXT NULL,
    `checklist` JSON NULL,
    `researchAnswers` JSON NULL,
    `aiDraft` JSON NULL,
    `aiStatus` VARCHAR(9) NOT NULL DEFAULT 'NONE',
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `WritingSubmission_studentId_status_idx`(`studentId`, `status`),
    PRIMARY KEY (`taskId`, `studentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ErrorLog` (
    `id` VARCHAR(191) NOT NULL,
    `source` VARCHAR(10) NOT NULL,
    `message` VARCHAR(1000) NOT NULL,
    `path` VARCHAR(300) NULL,
    `digest` VARCHAR(100) NULL,
    `userId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ErrorLog_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DiagnosticTest` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `grade` INTEGER NOT NULL,
    `year` VARCHAR(9) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `assessmentId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'DRAFT',
    `opensAt` DATETIME(3) NULL,
    `closesAt` DATETIME(3) NULL,
    `bands` JSON NULL,
    `adaptive` BOOLEAN NOT NULL DEFAULT false,
    `design` JSON NULL,
    `period` VARCHAR(3) NOT NULL DEFAULT 'BOY',
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DiagnosticTest_schoolId_grade_idx`(`schoolId`, `grade`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
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
    `theta` DOUBLE NULL,
    `thetaSE` DOUBLE NULL,
    `ritEstimate` INTEGER NULL,
    `byArea` JSON NULL,
    `completedAt` DATETIME(3) NOT NULL,
    `sharedAt` DATETIME(3) NULL,
    `teacherNote` VARCHAR(1000) NULL,

    INDEX `DiagnosticScore_studentId_idx`(`studentId`),
    UNIQUE INDEX `DiagnosticScore_diagnosticId_studentId_key`(`diagnosticId`, `studentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FluencyCheck` (
    `id` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `wcpm` INTEGER NOT NULL,
    `accuracy` INTEGER NULL,
    `note` VARCHAR(500) NULL,
    `source` VARCHAR(10) NOT NULL DEFAULT 'TEACHER',
    `checkedById` VARCHAR(191) NULL,
    `checkedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `season` VARCHAR(6) NULL,
    `percentile` INTEGER NULL,
    `prosody` JSON NULL,
    `comprehension` INTEGER NULL,

    INDEX `FluencyCheck_studentId_checkedAt_idx`(`studentId`, `checkedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WeeklyCheck` (
    `id` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `week` VARCHAR(10) NOT NULL,
    `assignmentId` VARCHAR(191) NOT NULL,
    `correct` INTEGER NOT NULL DEFAULT 0,
    `total` INTEGER NOT NULL DEFAULT 0,
    `ritBefore` INTEGER NULL,
    `ritAfter` INTEGER NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `WeeklyCheck_studentId_week_key`(`studentId`, `week`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FluencyPractice` (
    `id` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `mode` VARCHAR(8) NOT NULL,
    `passageKey` VARCHAR(60) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `lexile` INTEGER NULL,
    `wordsRead` INTEGER NOT NULL,
    `wordsCorrect` INTEGER NOT NULL,
    `seconds` INTEGER NOT NULL,
    `wcpm` INTEGER NOT NULL,
    `accuracy` INTEGER NOT NULL,
    `expression` INTEGER NULL,
    `level` VARCHAR(6) NULL,
    `errors` JSON NOT NULL,
    `patterns` JSON NULL,
    `plan` JSON NULL,
    `prosody` JSON NULL,
    `hesitations` INTEGER NULL,
    `comprehension` INTEGER NULL,
    `practiceKind` VARCHAR(10) NULL,
    `trial` INTEGER NULL,
    `percentile` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FluencyPractice_studentId_createdAt_idx`(`studentId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FamilyReport` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(12) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `content` JSON NOT NULL,
    `refId` VARCHAR(40) NULL,
    `status` VARCHAR(10) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `submittedAt` DATETIME(3) NULL,
    `reviewedById` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `reviewNote` TEXT NULL,
    `seenByParentAt` DATETIME(3) NULL,
    `seenByStudentAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FamilyReport_schoolId_status_idx`(`schoolId`, `status`),
    INDEX `FamilyReport_studentId_status_idx`(`studentId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QuestionStandardFix` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `questionId` VARCHAR(191) NOT NULL,
    `fromCode` VARCHAR(40) NULL,
    `toCode` VARCHAR(40) NOT NULL,
    `reason` VARCHAR(255) NOT NULL,
    `status` VARCHAR(10) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reviewedById` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,

    INDEX `QuestionStandardFix_schoolId_status_idx`(`schoolId`, `status`),
    INDEX `QuestionStandardFix_questionId_idx`(`questionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StudentProfile` (
    `studentId` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `level` VARCHAR(8) NOT NULL,
    `levelSource` VARCHAR(16) NOT NULL,
    `levelAt` DATETIME(3) NULL,
    `readingRit` INTEGER NULL,
    `languageRit` INTEGER NULL,
    `estReadingRit` INTEGER NULL,
    `estLanguageRit` INTEGER NULL,
    `lexile` INTEGER NULL,
    `theta` DOUBLE NULL,
    `practiceDays14` INTEGER NOT NULL DEFAULT 0,
    `predictedTerm` VARCHAR(12) NULL,
    `predictedReading` INTEGER NULL,
    `predictedLanguage` INTEGER NULL,
    `predictedRange` INTEGER NULL,
    `goalReading` INTEGER NULL,
    `goalChance` INTEGER NULL,
    `misconceptions` JSON NULL,
    `weakestArea` VARCHAR(12) NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `intelligence` JSON NULL,
    `riskScore` INTEGER NULL,
    `riskReasons` JSON NULL,

    INDEX `StudentProfile_schoolId_level_idx`(`schoolId`, `level`),
    PRIMARY KEY (`studentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
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
    `result` JSON NULL,
    `evaluatedAt` DATETIME(3) NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'ACTIVE',

    INDEX `Intervention_classId_status_idx`(`classId`, `status`),
    INDEX `Intervention_schoolId_status_idx`(`schoolId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RiskSnapshot` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `studentId` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `takenOn` DATE NOT NULL,
    `score` INTEGER NOT NULL,
    `features` JSON NOT NULL,
    `model` VARCHAR(16) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RiskSnapshot_schoolId_takenOn_idx`(`schoolId`, `takenOn`),
    UNIQUE INDEX `RiskSnapshot_studentId_takenOn_key`(`studentId`, `takenOn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PredictionModel` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(20) NOT NULL,
    `weights` JSON NOT NULL,
    `metrics` JSON NOT NULL,
    `n` INTEGER NOT NULL DEFAULT 0,
    `trainedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PredictionModel_schoolId_kind_key`(`schoolId`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AdminMessage` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `senderId` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(150) NOT NULL,
    `body` TEXT NOT NULL,
    `link` VARCHAR(300) NULL,
    `audience` JSON NOT NULL,
    `recipients` INTEGER NOT NULL DEFAULT 0,
    `emailed` INTEGER NOT NULL DEFAULT 0,
    `emailFailed` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AdminMessage_schoolId_createdAt_idx`(`schoolId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AdminMessageRecipient` (
    `id` VARCHAR(191) NOT NULL,
    `messageId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `notificationId` VARCHAR(191) NULL,
    `emailStatus` VARCHAR(10) NOT NULL,
    `readAt` DATETIME(3) NULL,

    INDEX `AdminMessageRecipient_userId_idx`(`userId`),
    UNIQUE INDEX `AdminMessageRecipient_messageId_userId_key`(`messageId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StudentTier` (
    `studentId` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `tier` INTEGER NOT NULL DEFAULT 1,
    `source` VARCHAR(8) NOT NULL DEFAULT 'AUTO',
    `locked` BOOLEAN NOT NULL DEFAULT false,
    `reason` TEXT NOT NULL,
    `focusSkillId` VARCHAR(191) NULL,
    `since` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reviewAt` DATETIME(3) NULL,
    `monitorEveryDays` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `StudentTier_schoolId_tier_idx`(`schoolId`, `tier`),
    PRIMARY KEY (`studentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TierChange` (
    `id` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `fromTier` INTEGER NOT NULL,
    `toTier` INTEGER NOT NULL,
    `source` VARCHAR(8) NOT NULL,
    `reason` TEXT NOT NULL,
    `evidence` JSON NULL,
    `changedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TierChange_studentId_createdAt_idx`(`studentId`, `createdAt`),
    INDEX `TierChange_schoolId_createdAt_idx`(`schoolId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DataMeeting` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `classId` VARCHAR(191) NULL,
    `gradeLevel` INTEGER NULL,
    `heldOn` DATETIME(3) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `snapshot` JSON NOT NULL,
    `decisions` JSON NOT NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DataMeeting_schoolId_heldOn_idx`(`schoolId`, `heldOn`),
    INDEX `DataMeeting_classId_heldOn_idx`(`classId`, `heldOn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DecodingScreen` (
    `id` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `reason` VARCHAR(8) NOT NULL DEFAULT 'TEACHER',
    `items` JSON NOT NULL,
    `result` JSON NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,

    INDEX `DecodingScreen_studentId_startedAt_idx`(`studentId`, `startedAt`),
    INDEX `DecodingScreen_schoolId_completedAt_idx`(`schoolId`, `completedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
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

    INDEX `ProgressCheck_classId_createdAt_idx`(`classId`, `createdAt`),
    UNIQUE INDEX `ProgressCheck_assignmentId_key`(`assignmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StrategySurvey` (
    `id` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `answers` JSON NOT NULL,
    `result` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StrategySurvey_studentId_createdAt_idx`(`studentId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
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
    `organizer` JSON NULL,
    `checkPct` INTEGER NULL,
    `passed` BOOLEAN NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `finishedAt` DATETIME(3) NULL,

    INDEX `LessonRun_studentId_skillId_idx`(`studentId`, `skillId`),
    INDEX `LessonRun_schoolId_updatedAt_idx`(`schoolId`, `updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RRArticle` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NULL,
    `code` VARCHAR(40) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `topic` VARCHAR(60) NOT NULL,
    `summary` VARCHAR(400) NULL,
    `pollStatement` VARCHAR(300) NOT NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'DRAFT',
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `RRArticle_schoolId_status_idx`(`schoolId`, `status`),
    INDEX `RRArticle_code_idx`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RRVersion` (
    `id` VARCHAR(191) NOT NULL,
    `articleId` VARCHAR(191) NOT NULL,
    `level` INTEGER NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `wordCount` INTEGER NOT NULL,
    `estLevel` INTEGER NOT NULL,
    `officialLexile` INTEGER NULL,

    UNIQUE INDEX `RRVersion_articleId_level_key`(`articleId`, `level`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RRQuestion` (
    `id` VARCHAR(191) NOT NULL,
    `articleId` VARCHAR(191) NOT NULL,
    `band` VARCHAR(4) NOT NULL,
    `number` INTEGER NOT NULL,
    `stem` TEXT NOT NULL,
    `options` JSON NOT NULL,
    `answer` VARCHAR(1) NOT NULL,
    `skill` VARCHAR(30) NOT NULL,
    `rationale` JSON NULL,

    UNIQUE INDEX `RRQuestion_articleId_band_number_key`(`articleId`, `band`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RRPrompt` (
    `id` VARCHAR(191) NOT NULL,
    `articleId` VARCHAR(191) NOT NULL,
    `band` VARCHAR(4) NOT NULL,
    `prompt` TEXT NOT NULL,
    `checklist` JSON NULL,
    `keyWords` JSON NULL,

    UNIQUE INDEX `RRPrompt_articleId_band_key`(`articleId`, `band`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
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

    INDEX `RRStudent_schoolId_idx`(`schoolId`),
    PRIMARY KEY (`studentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RRLevelChange` (
    `id` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `fromLevel` INTEGER NOT NULL,
    `toLevel` INTEGER NOT NULL,
    `reason` VARCHAR(300) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RRLevelChange_studentId_createdAt_idx`(`studentId`, `createdAt`),
    INDEX `RRLevelChange_schoolId_createdAt_idx`(`schoolId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RRRun` (
    `id` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `articleId` VARCHAR(191) NOT NULL,
    `versionLevel` INTEGER NOT NULL,
    `band` VARCHAR(4) NOT NULL,
    `step` VARCHAR(8) NOT NULL DEFAULT 'PREPOLL',
    `prePoll` INTEGER NULL,
    `postPoll` INTEGER NULL,
    `readSeconds` INTEGER NULL,
    `answers` JSON NULL,
    `score` INTEGER NULL,
    `writing` TEXT NULL,
    `writingScore` INTEGER NULL,
    `writingComment` VARCHAR(1000) NULL,
    `writingScoredById` VARCHAR(191) NULL,
    `levelBefore` INTEGER NOT NULL,
    `levelAfter` INTEGER NULL,
    `firstTry` BOOLEAN NOT NULL DEFAULT true,
    `stretch` BOOLEAN NOT NULL DEFAULT false,
    `annotations` JSON NULL,
    `listened` BOOLEAN NOT NULL DEFAULT false,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,

    INDEX `RRRun_studentId_completedAt_idx`(`studentId`, `completedAt`),
    INDEX `RRRun_schoolId_completedAt_idx`(`schoolId`, `completedAt`),
    INDEX `RRRun_articleId_idx`(`articleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RRPlacement` (
    `id` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `startLevel` INTEGER NOT NULL,
    `steps` JSON NOT NULL,
    `result` INTEGER NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,

    INDEX `RRPlacement_studentId_startedAt_idx`(`studentId`, `startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RRClassArticle` (
    `id` VARCHAR(191) NOT NULL,
    `classId` VARCHAR(191) NOT NULL,
    `articleId` VARCHAR(191) NOT NULL,
    `assignedById` VARCHAR(191) NOT NULL,
    `dueAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `RRClassArticle_classId_articleId_key`(`classId`, `articleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QuestionGradeStat` (
    `id` VARCHAR(191) NOT NULL,
    `questionId` VARCHAR(191) NOT NULL,
    `grade` INTEGER NOT NULL,
    `responses` INTEGER NOT NULL,
    `correct` INTEGER NOT NULL,
    `pct` DOUBLE NOT NULL,
    `responsesOnLevel` INTEGER NOT NULL DEFAULT 0,
    `pctOnLevel` DOUBLE NULL,
    `optionShares` JSON NULL,
    `discrimination` DOUBLE NULL,
    `medianMs` INTEGER NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `QuestionGradeStat_grade_responses_idx`(`grade`, `responses`),
    UNIQUE INDEX `QuestionGradeStat_questionId_grade_key`(`questionId`, `grade`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
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
    `approvedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `QuestionLevelChange_questionId_createdAt_idx`(`questionId`, `createdAt`),
    INDEX `QuestionLevelChange_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QuestionAlert` (
    `id` VARCHAR(191) NOT NULL,
    `questionId` VARCHAR(191) NOT NULL,
    `grade` INTEGER NOT NULL,
    `kind` VARCHAR(24) NOT NULL,
    `detail` VARCHAR(400) NOT NULL,
    `data` JSON NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'OPEN',
    `heldBack` BOOLEAN NOT NULL DEFAULT false,
    `resolvedById` VARCHAR(191) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `QuestionAlert_questionId_status_idx`(`questionId`, `status`),
    INDEX `QuestionAlert_status_createdAt_idx`(`status`, `createdAt`),
    UNIQUE INDEX `QuestionAlert_questionId_grade_kind_key`(`questionId`, `grade`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
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

    INDEX `SkillEvidence_studentId_skillId_createdAt_idx`(`studentId`, `skillId`, `createdAt`),
    UNIQUE INDEX `SkillEvidence_studentId_source_refId_key`(`studentId`, `source`, `refId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StudentLevelState` (
    `studentId` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `level` ENUM('ABOVE', 'ON', 'BELOW') NOT NULL,
    `source` VARCHAR(12) NOT NULL,
    `reason` VARCHAR(500) NOT NULL,
    `since` DATETIME(3) NOT NULL,
    `pending` ENUM('ABOVE', 'ON', 'BELOW') NULL,
    `pendingSince` DATETIME(3) NULL,
    `pendingCount` INTEGER NOT NULL DEFAULT 0,
    `theta` DOUBLE NULL,
    `thetaSE` DOUBLE NULL,
    `effN` DOUBLE NOT NULL DEFAULT 0,
    `thetaRecent` DOUBLE NULL,
    `thetaPrior` DOUBLE NULL,
    `declining` BOOLEAN NOT NULL DEFAULT false,
    `evaluatedAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `StudentLevelState_schoolId_level_idx`(`schoolId`, `level`),
    PRIMARY KEY (`studentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NafsArea` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(32) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `NafsArea_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NafsSkillLink` (
    `familyId` VARCHAR(191) NOT NULL,
    `areaId` VARCHAR(191) NOT NULL,
    `source` VARCHAR(8) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `NafsSkillLink_areaId_idx`(`areaId`),
    PRIMARY KEY (`familyId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NafsQuestionArea` (
    `questionId` VARCHAR(191) NOT NULL,
    `areaId` VARCHAR(191) NOT NULL,
    `setById` VARCHAR(191) NULL,
    `setAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `NafsQuestionArea_areaId_idx`(`areaId`),
    PRIMARY KEY (`questionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SkillLinkReview` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(16) NOT NULL,
    `subjectId` VARCHAR(64) NOT NULL,
    `excerpt` VARCHAR(200) NOT NULL,
    `guessId` VARCHAR(40) NULL,
    `guessLabel` VARCHAR(160) NULL,
    `confidence` DOUBLE NOT NULL,
    `reason` VARCHAR(255) NOT NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'OPEN',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reviewedById` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,

    INDEX `SkillLinkReview_schoolId_status_idx`(`schoolId`, `status`),
    UNIQUE INDEX `SkillLinkReview_schoolId_kind_subjectId_key`(`schoolId`, `kind`, `subjectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
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
    `openAt` DATETIME(3) NULL,
    `dueAt` DATETIME(3) NULL,
    `timeLimitMin` INTEGER NULL,
    `shuffle` BOOLEAN NOT NULL DEFAULT false,
    `templateId` VARCHAR(191) NULL,
    `reteachAt` DATETIME(3) NULL,
    `nafsPlanAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deletedAt` DATETIME(3) NULL,

    INDEX `TeacherTest_classId_createdAt_idx`(`classId`, `createdAt`),
    INDEX `TeacherTest_schoolId_teacherId_idx`(`schoolId`, `teacherId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TestTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `testType` VARCHAR(24) NOT NULL,
    `spec` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `TestTemplate_schoolId_createdById_idx`(`schoolId`, `createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
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
    `source` VARCHAR(80) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `TtsAudio_textHash_key`(`textHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StudentReward` (
    `studentId` VARCHAR(191) NOT NULL,
    `coins` INTEGER NOT NULL DEFAULT 0,
    `earned` INTEGER NOT NULL DEFAULT 0,
    `avatar` JSON NULL,
    `favoriteBadge` VARCHAR(40) NULL,
    `syncedAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`studentId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CoinLedger` (
    `id` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `amount` INTEGER NOT NULL,
    `reason` VARCHAR(24) NOT NULL,
    `refId` VARCHAR(120) NOT NULL,
    `note` VARCHAR(200) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CoinLedger_studentId_createdAt_idx`(`studentId`, `createdAt`),
    UNIQUE INDEX `CoinLedger_studentId_reason_refId_key`(`studentId`, `reason`, `refId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QotdAnswer` (
    `id` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `day` VARCHAR(10) NOT NULL,
    `questionId` VARCHAR(191) NOT NULL,
    `skillId` VARCHAR(191) NULL,
    `level` VARCHAR(8) NOT NULL,
    `correct` BOOLEAN NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `QotdAnswer_studentId_correct_idx`(`studentId`, `correct`),
    UNIQUE INDEX `QotdAnswer_studentId_day_key`(`studentId`, `day`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Certificate` (
    `id` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(12) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `detail` VARCHAR(300) NULL,
    `refId` VARCHAR(120) NOT NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Certificate_studentId_createdAt_idx`(`studentId`, `createdAt`),
    UNIQUE INDEX `Certificate_studentId_kind_refId_key`(`studentId`, `kind`, `refId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Feedback` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `schoolId` VARCHAR(191) NULL,
    `role` VARCHAR(20) NOT NULL,
    `path` VARCHAR(300) NULL,
    `message` VARCHAR(2000) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolved` BOOLEAN NOT NULL DEFAULT false,

    INDEX `Feedback_schoolId_resolved_createdAt_idx`(`schoolId`, `resolved`, `createdAt`),
    INDEX `Feedback_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SchoolSetting` ADD CONSTRAINT `SchoolSetting_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AcademicYear` ADD CONSTRAINT `AcademicYear_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Term` ADD CONSTRAINT `Term_academicYearId_fkey` FOREIGN KEY (`academicYearId`) REFERENCES `AcademicYear`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Grade` ADD CONSTRAINT `Grade_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Class` ADD CONSTRAINT `Class_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Class` ADD CONSTRAINT `Class_gradeId_fkey` FOREIGN KEY (`gradeId`) REFERENCES `Grade`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Class` ADD CONSTRAINT `Class_academicYearId_fkey` FOREIGN KEY (`academicYearId`) REFERENCES `AcademicYear`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Teacher` ADD CONSTRAINT `Teacher_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Teacher` ADD CONSTRAINT `Teacher_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClassTeacher` ADD CONSTRAINT `ClassTeacher_classId_fkey` FOREIGN KEY (`classId`) REFERENCES `Class`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClassTeacher` ADD CONSTRAINT `ClassTeacher_teacherId_fkey` FOREIGN KEY (`teacherId`) REFERENCES `Teacher`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Student` ADD CONSTRAINT `Student_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Student` ADD CONSTRAINT `Student_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Student` ADD CONSTRAINT `Student_gradeId_fkey` FOREIGN KEY (`gradeId`) REFERENCES `Grade`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClassMembership` ADD CONSTRAINT `ClassMembership_classId_fkey` FOREIGN KEY (`classId`) REFERENCES `Class`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClassMembership` ADD CONSTRAINT `ClassMembership_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Parent` ADD CONSTRAINT `Parent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ParentStudent` ADD CONSTRAINT `ParentStudent_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `Parent`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ParentStudent` ADD CONSTRAINT `ParentStudent_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Curriculum` ADD CONSTRAINT `Curriculum_gradeId_fkey` FOREIGN KEY (`gradeId`) REFERENCES `Grade`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Curriculum` ADD CONSTRAINT `Curriculum_bookId_fkey` FOREIGN KEY (`bookId`) REFERENCES `Book`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Unit` ADD CONSTRAINT `Unit_curriculumId_fkey` FOREIGN KEY (`curriculumId`) REFERENCES `Curriculum`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lesson` ADD CONSTRAINT `Lesson_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `Unit`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SkillFamily` ADD CONSTRAINT `SkillFamily_mapGoalAreaId_fkey` FOREIGN KEY (`mapGoalAreaId`) REFERENCES `MapGoalArea`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Skill` ADD CONSTRAINT `Skill_curriculumId_fkey` FOREIGN KEY (`curriculumId`) REFERENCES `Curriculum`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Skill` ADD CONSTRAINT `Skill_familyId_fkey` FOREIGN KEY (`familyId`) REFERENCES `SkillFamily`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Subskill` ADD CONSTRAINT `Subskill_skillId_fkey` FOREIGN KEY (`skillId`) REFERENCES `Skill`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LessonSkill` ADD CONSTRAINT `LessonSkill_lessonId_fkey` FOREIGN KEY (`lessonId`) REFERENCES `Lesson`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LessonSkill` ADD CONSTRAINT `LessonSkill_skillId_fkey` FOREIGN KEY (`skillId`) REFERENCES `Skill`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UnitSkill` ADD CONSTRAINT `UnitSkill_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `Unit`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UnitSkill` ADD CONSTRAINT `UnitSkill_skillId_fkey` FOREIGN KEY (`skillId`) REFERENCES `Skill`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SkillStandard` ADD CONSTRAINT `SkillStandard_skillId_fkey` FOREIGN KEY (`skillId`) REFERENCES `Skill`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SkillStandard` ADD CONSTRAINT `SkillStandard_standardId_fkey` FOREIGN KEY (`standardId`) REFERENCES `Standard`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SkillPrerequisite` ADD CONSTRAINT `SkillPrerequisite_skillId_fkey` FOREIGN KEY (`skillId`) REFERENCES `Skill`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SkillPrerequisite` ADD CONSTRAINT `SkillPrerequisite_prerequisiteSkillId_fkey` FOREIGN KEY (`prerequisiteSkillId`) REFERENCES `Skill`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OfficialReadingMeasure` ADD CONSTRAINT `OfficialReadingMeasure_passageId_fkey` FOREIGN KEY (`passageId`) REFERENCES `ReadingPassage`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Question` ADD CONSTRAINT `Question_skillId_fkey` FOREIGN KEY (`skillId`) REFERENCES `Skill`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Question` ADD CONSTRAINT `Question_subskillId_fkey` FOREIGN KEY (`subskillId`) REFERENCES `Subskill`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Question` ADD CONSTRAINT `Question_lessonId_fkey` FOREIGN KEY (`lessonId`) REFERENCES `Lesson`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Question` ADD CONSTRAINT `Question_passageId_fkey` FOREIGN KEY (`passageId`) REFERENCES `ReadingPassage`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Question` ADD CONSTRAINT `Question_standardId_fkey` FOREIGN KEY (`standardId`) REFERENCES `Standard`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Question` ADD CONSTRAINT `Question_typeId_fkey` FOREIGN KEY (`typeId`) REFERENCES `QuestionType`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuestionOption` ADD CONSTRAINT `QuestionOption_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `Question`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuestionAnswer` ADD CONSTRAINT `QuestionAnswer_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `Question`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuestionExplanation` ADD CONSTRAINT `QuestionExplanation_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `Question`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuestionStats` ADD CONSTRAINT `QuestionStats_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `Question`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PracticeSession` ADD CONSTRAINT `PracticeSession_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PracticeSession` ADD CONSTRAINT `PracticeSession_assessmentId_fkey` FOREIGN KEY (`assessmentId`) REFERENCES `Assessment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuestionAttempt` ADD CONSTRAINT `QuestionAttempt_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `PracticeSession`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuestionAttempt` ADD CONSTRAINT `QuestionAttempt_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuestionAttempt` ADD CONSTRAINT `QuestionAttempt_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `Question`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuestionAttempt` ADD CONSTRAINT `QuestionAttempt_skillId_fkey` FOREIGN KEY (`skillId`) REFERENCES `Skill`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AdaptiveDecisionLog` ADD CONSTRAINT `AdaptiveDecisionLog_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StudentAbility` ADD CONSTRAINT `StudentAbility_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StudentAbility` ADD CONSTRAINT `StudentAbility_skillId_fkey` FOREIGN KEY (`skillId`) REFERENCES `Skill`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AbilitySnapshot` ADD CONSTRAINT `AbilitySnapshot_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StudentSkillMastery` ADD CONSTRAINT `StudentSkillMastery_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StudentSkillMastery` ADD CONSTRAINT `StudentSkillMastery_skillId_fkey` FOREIGN KEY (`skillId`) REFERENCES `Skill`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StudentReadingRange` ADD CONSTRAINT `StudentReadingRange_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Assignment` ADD CONSTRAINT `Assignment_classId_fkey` FOREIGN KEY (`classId`) REFERENCES `Class`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Assignment` ADD CONSTRAINT `Assignment_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `Teacher`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Assignment` ADD CONSTRAINT `Assignment_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `Unit`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Assignment` ADD CONSTRAINT `Assignment_assessmentId_fkey` FOREIGN KEY (`assessmentId`) REFERENCES `Assessment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssignmentStudent` ADD CONSTRAINT `AssignmentStudent_assignmentId_fkey` FOREIGN KEY (`assignmentId`) REFERENCES `Assignment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssignmentStudent` ADD CONSTRAINT `AssignmentStudent_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Assessment` ADD CONSTRAINT `Assessment_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `Unit`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssessmentQuestion` ADD CONSTRAINT `AssessmentQuestion_assessmentId_fkey` FOREIGN KEY (`assessmentId`) REFERENCES `Assessment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssessmentQuestion` ADD CONSTRAINT `AssessmentQuestion_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `Question`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExternalSkillRef` ADD CONSTRAINT `ExternalSkillRef_sourceId_fkey` FOREIGN KEY (`sourceId`) REFERENCES `ExternalAssessmentSource`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExternalSkillRef` ADD CONSTRAINT `ExternalSkillRef_skillId_fkey` FOREIGN KEY (`skillId`) REFERENCES `Skill`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExternalAssessmentResult` ADD CONSTRAINT `ExternalAssessmentResult_sourceId_fkey` FOREIGN KEY (`sourceId`) REFERENCES `ExternalAssessmentSource`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExternalAssessmentResult` ADD CONSTRAINT `ExternalAssessmentResult_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MapResult` ADD CONSTRAINT `MapResult_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MapResult` ADD CONSTRAINT `MapResult_goalAreaId_fkey` FOREIGN KEY (`goalAreaId`) REFERENCES `MapGoalArea`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ImportJob` ADD CONSTRAINT `ImportJob_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Recommendation` ADD CONSTRAINT `Recommendation_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InterventionAlert` ADD CONSTRAINT `InterventionAlert_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StudentBadge` ADD CONSTRAINT `StudentBadge_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StudentBadge` ADD CONSTRAINT `StudentBadge_badgeId_fkey` FOREIGN KEY (`badgeId`) REFERENCES `Badge`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `XpEvent` ADD CONSTRAINT `XpEvent_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StudentDailyActivity` ADD CONSTRAINT `StudentDailyActivity_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClassSkillDaily` ADD CONSTRAINT `ClassSkillDaily_classId_fkey` FOREIGN KEY (`classId`) REFERENCES `Class`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClassSkillDaily` ADD CONSTRAINT `ClassSkillDaily_skillId_fkey` FOREIGN KEY (`skillId`) REFERENCES `Skill`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DiagnosticResult` ADD CONSTRAINT `DiagnosticResult_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ImportedQuestionLog` ADD CONSTRAINT `ImportedQuestionLog_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `ImportJob`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CurriculumMapNode` ADD CONSTRAINT `CurriculumMapNode_gradeId_fkey` FOREIGN KEY (`gradeId`) REFERENCES `Grade`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CurriculumMapNode` ADD CONSTRAINT `CurriculumMapNode_bookId_fkey` FOREIGN KEY (`bookId`) REFERENCES `Book`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CurriculumMapNode` ADD CONSTRAINT `CurriculumMapNode_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `CurriculumMapNode`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuestionMapLink` ADD CONSTRAINT `QuestionMapLink_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `Question`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuestionMapLink` ADD CONSTRAINT `QuestionMapLink_nodeId_fkey` FOREIGN KEY (`nodeId`) REFERENCES `CurriculumMapNode`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuestionUse` ADD CONSTRAINT `QuestionUse_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `Question`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

