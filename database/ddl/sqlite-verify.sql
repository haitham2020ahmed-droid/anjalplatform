-- GENERATED from prisma/schema.prisma (SQLite, offline verification). Reference only — the authoritative MySQL
-- migration is produced by `prisma migrate dev`. Do not edit by hand.

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT,
  "username" TEXT NOT NULL,
  "passwordHash" TEXT,
  "displayName" TEXT NOT NULL,
  "role" TEXT NOT NULL CHECK ("role" IN ('SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'STUDENT', 'PARENT')),
  "schoolId" TEXT,
  "isActive" INTEGER NOT NULL DEFAULT 1,
  "sessionVersion" INTEGER NOT NULL DEFAULT 0,
  "mustChangePassword" INTEGER NOT NULL DEFAULT 0,
  "passwordChangedAt" TEXT,
  "lastLoginAt" TEXT,
  "failedLogins" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updatedAt" TEXT NOT NULL,
  "deletedAt" TEXT,
  PRIMARY KEY ("id"),
  CONSTRAINT "User_email_key" UNIQUE ("email"),
  CONSTRAINT "User_username_key" UNIQUE ("username"),
  CONSTRAINT "User_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "User_schoolId_role_idx" ON "User"("schoolId", "role");

CREATE TABLE "Session" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "expiresAt" TEXT NOT NULL,
  "lastSeenAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "ip" TEXT,
  "userAgent" TEXT,
  PRIMARY KEY ("id"),
  CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Session_userId_idx" ON "Session"("userId");

CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

CREATE TABLE "RolePermission" (
  "id" TEXT NOT NULL,
  "role" TEXT NOT NULL CHECK ("role" IN ('SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'STUDENT', 'PARENT')),
  "permission" TEXT NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "RolePermission_role_permission_key" UNIQUE ("role", "permission")
);

CREATE TABLE "School" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "logoUrl" TEXT,
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Riyadh',
  "isDemo" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updatedAt" TEXT NOT NULL,
  "deletedAt" TEXT,
  PRIMARY KEY ("id"),
  CONSTRAINT "School_code_key" UNIQUE ("code")
);

CREATE TABLE "SchoolSetting" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "updatedBy" TEXT,
  "updatedAt" TEXT NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "SchoolSetting_schoolId_key_key" UNIQUE ("schoolId", "key"),
  CONSTRAINT "SchoolSetting_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "AcademicYear" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "startDate" TEXT NOT NULL,
  "endDate" TEXT NOT NULL,
  "isCurrent" INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY ("id"),
  CONSTRAINT "AcademicYear_schoolId_name_key" UNIQUE ("schoolId", "name"),
  CONSTRAINT "AcademicYear_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Term" (
  "id" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "startDate" TEXT NOT NULL,
  "endDate" TEXT NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "Term_academicYearId_name_key" UNIQUE ("academicYearId", "name"),
  CONSTRAINT "Term_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Grade" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "level" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "Grade_schoolId_level_key" UNIQUE ("schoolId", "level"),
  CONSTRAINT "Grade_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Class" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "gradeId" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "deletedAt" TEXT,
  PRIMARY KEY ("id"),
  CONSTRAINT "Class_academicYearId_name_key" UNIQUE ("academicYearId", "name"),
  CONSTRAINT "Class_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Class_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "Grade"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Class_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "Class_gradeId_idx" ON "Class"("gradeId");

CREATE INDEX "Class_schoolId_fk_idx" ON "Class"("schoolId");

CREATE TABLE "Teacher" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "title" TEXT,
  PRIMARY KEY ("id"),
  CONSTRAINT "Teacher_userId_key" UNIQUE ("userId"),
  CONSTRAINT "Teacher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Teacher_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "Teacher_schoolId_fk_idx" ON "Teacher"("schoolId");

CREATE TABLE "ClassTeacher" (
  "classId" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "isLead" INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY ("classId", "teacherId"),
  CONSTRAINT "ClassTeacher_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ClassTeacher_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ClassTeacher_teacherId_idx" ON "ClassTeacher"("teacherId");

CREATE TABLE "Student" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "gradeId" TEXT NOT NULL,
  "studentNumber" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "deletedAt" TEXT,
  PRIMARY KEY ("id"),
  CONSTRAINT "Student_userId_key" UNIQUE ("userId"),
  CONSTRAINT "Student_schoolId_studentNumber_key" UNIQUE ("schoolId", "studentNumber"),
  CONSTRAINT "Student_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Student_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Student_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "Grade"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "Student_gradeId_idx" ON "Student"("gradeId");

CREATE TABLE "ClassMembership" (
  "classId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "joinedAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "leftAt" TEXT,
  PRIMARY KEY ("classId", "studentId"),
  CONSTRAINT "ClassMembership_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ClassMembership_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ClassMembership_studentId_idx" ON "ClassMembership"("studentId");

CREATE TABLE "Parent" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "Parent_userId_key" UNIQUE ("userId"),
  CONSTRAINT "Parent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ParentStudent" (
  "parentId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "relationship" TEXT,
  PRIMARY KEY ("parentId", "studentId"),
  CONSTRAINT "ParentStudent_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ParentStudent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ParentStudent_studentId_idx" ON "ParentStudent"("studentId");

CREATE TABLE "Book" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "publisher" TEXT,
  "edition" TEXT,
  PRIMARY KEY ("id"),
  CONSTRAINT "Book_code_key" UNIQUE ("code")
);

CREATE TABLE "Curriculum" (
  "id" TEXT NOT NULL,
  "gradeId" TEXT NOT NULL,
  "bookId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" INTEGER NOT NULL DEFAULT 1,
  "deletedAt" TEXT,
  PRIMARY KEY ("id"),
  CONSTRAINT "Curriculum_gradeId_bookId_key" UNIQUE ("gradeId", "bookId"),
  CONSTRAINT "Curriculum_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "Grade"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Curriculum_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "Curriculum_bookId_fk_idx" ON "Curriculum"("bookId");

CREATE TABLE "Unit" (
  "id" TEXT NOT NULL,
  "curriculumId" TEXT NOT NULL,
  "number" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "deletedAt" TEXT,
  PRIMARY KEY ("id"),
  CONSTRAINT "Unit_curriculumId_number_key" UNIQUE ("curriculumId", "number"),
  CONSTRAINT "Unit_curriculumId_fkey" FOREIGN KEY ("curriculumId") REFERENCES "Curriculum"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Lesson" (
  "id" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "number" INTEGER NOT NULL,
  "code" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "genre" TEXT,
  "weeks" TEXT,
  "texts" TEXT,
  "metadata" TEXT,
  "deletedAt" TEXT,
  PRIMARY KEY ("id"),
  CONSTRAINT "Lesson_unitId_number_key" UNIQUE ("unitId", "number"),
  CONSTRAINT "Lesson_unitId_code_key" UNIQUE ("unitId", "code"),
  CONSTRAINT "Lesson_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "SkillFamily" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "domain" TEXT NOT NULL CHECK ("domain" IN ('READING', 'VOCABULARY', 'GRAMMAR', 'LANGUAGE', 'WRITING', 'WORD_STUDY')),
  "category" TEXT NOT NULL CHECK ("category" IN ('LITERATURE', 'INFORMATIONAL', 'COMPREHENSION', 'VOCABULARY', 'WORD_STUDY', 'GRAMMAR', 'MECHANICS', 'PHONICS_WORD_STUDY', 'WRITING')),
  "mapGoalAreaId" TEXT,
  PRIMARY KEY ("id"),
  CONSTRAINT "SkillFamily_code_key" UNIQUE ("code"),
  CONSTRAINT "SkillFamily_mapGoalAreaId_fkey" FOREIGN KEY ("mapGoalAreaId") REFERENCES "MapGoalArea"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "SkillFamily_mapGoalAreaId_fk_idx" ON "SkillFamily"("mapGoalAreaId");

CREATE TABLE "Skill" (
  "id" TEXT NOT NULL,
  "curriculumId" TEXT NOT NULL,
  "familyId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "domain" TEXT NOT NULL CHECK ("domain" IN ('READING', 'VOCABULARY', 'GRAMMAR', 'LANGUAGE', 'WRITING', 'WORD_STUDY')),
  "category" TEXT NOT NULL CHECK ("category" IN ('LITERATURE', 'INFORMATIONAL', 'COMPREHENSION', 'VOCABULARY', 'WORD_STUDY', 'GRAMMAR', 'MECHANICS', 'PHONICS_WORD_STUDY', 'WRITING')),
  "sequence" INTEGER NOT NULL DEFAULT 0,
  "isActive" INTEGER NOT NULL DEFAULT 1,
  "deletedAt" TEXT,
  PRIMARY KEY ("id"),
  CONSTRAINT "Skill_curriculumId_code_key" UNIQUE ("curriculumId", "code"),
  CONSTRAINT "Skill_curriculumId_fkey" FOREIGN KEY ("curriculumId") REFERENCES "Curriculum"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Skill_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "SkillFamily"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "Skill_familyId_idx" ON "Skill"("familyId");

CREATE INDEX "Skill_domain_idx" ON "Skill"("domain");

CREATE TABLE "Subskill" (
  "id" TEXT NOT NULL,
  "skillId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "content" TEXT,
  "deletedAt" TEXT,
  PRIMARY KEY ("id"),
  CONSTRAINT "Subskill_skillId_code_key" UNIQUE ("skillId", "code"),
  CONSTRAINT "Subskill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "LessonSkill" (
  "lessonId" TEXT NOT NULL,
  "skillId" TEXT NOT NULL,
  "subskillId" TEXT,
  "role" TEXT NOT NULL CHECK ("role" IN ('COMPREHENSION_SKILL', 'STRATEGY_AND_FEATURE', 'VOCABULARY_STRATEGY', 'AUTHORS_CRAFT', 'GRAMMAR', 'SPELLING', 'WRITING')),
  "label" TEXT NOT NULL,
  PRIMARY KEY ("lessonId", "skillId", "label"),
  CONSTRAINT "LessonSkill_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LessonSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "LessonSkill_skillId_idx" ON "LessonSkill"("skillId");

CREATE TABLE "UnitSkill" (
  "unitId" TEXT NOT NULL,
  "skillId" TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY ("unitId", "skillId"),
  CONSTRAINT "UnitSkill_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "UnitSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "UnitSkill_skillId_idx" ON "UnitSkill"("skillId");

CREATE TABLE "Standard" (
  "id" TEXT NOT NULL,
  "framework" TEXT NOT NULL CHECK ("framework" IN ('CCSS_ELA', 'MAP_CONTINUUM', 'CURRICULUM_MAP', 'SCHOOL_OBJECTIVE')),
  "code" TEXT NOT NULL,
  "description" TEXT,
  "gradeLevel" INTEGER,
  "strand" TEXT,
  PRIMARY KEY ("id"),
  CONSTRAINT "Standard_framework_code_key" UNIQUE ("framework", "code")
);

CREATE TABLE "SkillStandard" (
  "skillId" TEXT NOT NULL,
  "standardId" TEXT NOT NULL,
  "isPrimary" INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY ("skillId", "standardId"),
  CONSTRAINT "SkillStandard_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SkillStandard_standardId_fkey" FOREIGN KEY ("standardId") REFERENCES "Standard"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "SkillStandard_standardId_idx" ON "SkillStandard"("standardId");

CREATE TABLE "MapGoalArea" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "MapGoalArea_code_key" UNIQUE ("code")
);

CREATE TABLE "SkillPrerequisite" (
  "skillId" TEXT NOT NULL,
  "prerequisiteSkillId" TEXT NOT NULL,
  "weight" REAL NOT NULL DEFAULT 0.5,
  "minimumMastery" INTEGER NOT NULL DEFAULT 60,
  PRIMARY KEY ("skillId", "prerequisiteSkillId"),
  CONSTRAINT "SkillPrerequisite_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SkillPrerequisite_prerequisiteSkillId_fkey" FOREIGN KEY ("prerequisiteSkillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "SkillPrerequisite_prerequisiteSkillId_idx" ON "SkillPrerequisite"("prerequisiteSkillId");

CREATE TABLE "ReadingPassage" (
  "id" TEXT NOT NULL,
  "externalRef" TEXT,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "genre" TEXT,
  "gradeBand" TEXT,
  "wordCount" INTEGER NOT NULL,
  "sentenceCount" INTEGER NOT NULL,
  "avgSentenceLength" REAL NOT NULL,
  "avgWordLength" REAL NOT NULL,
  "gradeLevel" INTEGER,
  "platformReadingLevel" INTEGER,
  "estimatedDifficulty" REAL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT' CHECK ("status" IN ('DRAFT', 'UNDER_REVIEW', 'PUBLISHED', 'ARCHIVED')),
  "origin" TEXT NOT NULL DEFAULT 'TEACHER_AUTHORED' CHECK ("origin" IN ('TEACHER_AUTHORED', 'SCHOOL_BOOKLET', 'IMPORTED', 'AI_GENERATED', 'DEMO')),
  "createdById" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updatedAt" TEXT NOT NULL,
  "deletedAt" TEXT,
  PRIMARY KEY ("id"),
  CONSTRAINT "ReadingPassage_externalRef_key" UNIQUE ("externalRef")
);

CREATE INDEX "ReadingPassage_platformReadingLevel_idx" ON "ReadingPassage"("platformReadingLevel");

CREATE TABLE "OfficialReadingMeasure" (
  "id" TEXT NOT NULL,
  "passageId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "sourceRef" TEXT,
  "importedAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("id"),
  CONSTRAINT "OfficialReadingMeasure_passageId_fkey" FOREIGN KEY ("passageId") REFERENCES "ReadingPassage"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "OfficialReadingMeasure_passageId_fk_idx" ON "OfficialReadingMeasure"("passageId");

CREATE TABLE "QuestionType" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isAutoScored" INTEGER NOT NULL DEFAULT 1,
  "schema" TEXT,
  PRIMARY KEY ("id"),
  CONSTRAINT "QuestionType_code_key" UNIQUE ("code")
);

CREATE TABLE "Question" (
  "id" TEXT NOT NULL,
  "externalRef" TEXT,
  "skillId" TEXT NOT NULL,
  "subskillId" TEXT,
  "lessonId" TEXT,
  "passageId" TEXT,
  "standardId" TEXT,
  "typeId" TEXT NOT NULL,
  "stem" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "hint" TEXT,
  "difficultyLevel" INTEGER NOT NULL,
  "irtA" REAL NOT NULL DEFAULT 1.0,
  "irtB" REAL NOT NULL,
  "irtC" REAL NOT NULL DEFAULT 0.0,
  "calibrated" INTEGER NOT NULL DEFAULT 0,
  "estimatedSeconds" INTEGER NOT NULL DEFAULT 45,
  "tags" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT' CHECK ("status" IN ('DRAFT', 'UNDER_REVIEW', 'PUBLISHED', 'ARCHIVED')),
  "origin" TEXT NOT NULL DEFAULT 'TEACHER_AUTHORED' CHECK ("origin" IN ('TEACHER_AUTHORED', 'SCHOOL_BOOKLET', 'IMPORTED', 'AI_GENERATED', 'DEMO')),
  "aiStatus" TEXT CHECK ("aiStatus" IN ('AI_GENERATED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED')),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT,
  "reviewedById" TEXT,
  "publishedAt" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updatedAt" TEXT NOT NULL,
  "deletedAt" TEXT,
  PRIMARY KEY ("id"),
  CONSTRAINT "Question_skillId_externalRef_key" UNIQUE ("skillId", "externalRef"),
  CONSTRAINT "Question_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Question_subskillId_fkey" FOREIGN KEY ("subskillId") REFERENCES "Subskill"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Question_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Question_passageId_fkey" FOREIGN KEY ("passageId") REFERENCES "ReadingPassage"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Question_standardId_fkey" FOREIGN KEY ("standardId") REFERENCES "Standard"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Question_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "QuestionType"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "Question_skillId_status_irtB_idx" ON "Question"("skillId", "status", "irtB");

CREATE INDEX "Question_status_origin_idx" ON "Question"("status", "origin");

CREATE INDEX "Question_standardId_idx" ON "Question"("standardId");

CREATE INDEX "Question_subskillId_fk_idx" ON "Question"("subskillId");

CREATE INDEX "Question_lessonId_fk_idx" ON "Question"("lessonId");

CREATE INDEX "Question_passageId_fk_idx" ON "Question"("passageId");

CREATE INDEX "Question_typeId_fk_idx" ON "Question"("typeId");

CREATE TABLE "QuestionOption" (
  "id" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "isCorrect" INTEGER NOT NULL DEFAULT 0,
  "rationale" TEXT,
  "order" INTEGER NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "QuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "QuestionOption_questionId_idx" ON "QuestionOption"("questionId");

CREATE TABLE "QuestionAnswer" (
  "id" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "isPrimary" INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY ("id"),
  CONSTRAINT "QuestionAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "QuestionAnswer_questionId_fk_idx" ON "QuestionAnswer"("questionId");

CREATE TABLE "QuestionExplanation" (
  "id" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY ("id"),
  CONSTRAINT "QuestionExplanation_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "QuestionExplanation_questionId_fk_idx" ON "QuestionExplanation"("questionId");

CREATE TABLE "QuestionStats" (
  "questionId" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "correct" INTEGER NOT NULL DEFAULT 0,
  "pValue" REAL,
  "pointBiserial" REAL,
  "avgResponseMs" INTEGER,
  "distractorCounts" TEXT,
  "flags" TEXT,
  "updatedAt" TEXT NOT NULL,
  PRIMARY KEY ("questionId"),
  CONSTRAINT "QuestionStats_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "PracticeSession" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "skillId" TEXT,
  "assessmentId" TEXT,
  "assignmentId" TEXT,
  "mode" TEXT NOT NULL CHECK ("mode" IN ('ADAPTIVE_PRACTICE', 'DIAGNOSTIC', 'PLACEMENT', 'UNIT_QUIZ', 'BENCHMARK', 'TEACHER_QUIZ', 'FINAL')),
  "startedAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "endedAt" TEXT,
  "questionCount" INTEGER NOT NULL DEFAULT 0,
  "correctCount" INTEGER NOT NULL DEFAULT 0,
  "activeMs" INTEGER NOT NULL DEFAULT 0,
  "currentQuestionId" TEXT,
  "currentServedAt" TEXT,
  "currentOrder" TEXT,
  "lastTargetB" REAL,
  "endReason" TEXT,
  PRIMARY KEY ("id"),
  CONSTRAINT "PracticeSession_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PracticeSession_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "PracticeSession_studentId_startedAt_idx" ON "PracticeSession"("studentId", "startedAt");

CREATE INDEX "PracticeSession_assessmentId_fk_idx" ON "PracticeSession"("assessmentId");

CREATE TABLE "QuestionAttempt" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "sessionId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "skillId" TEXT NOT NULL,
  "response" TEXT NOT NULL,
  "isCorrect" INTEGER NOT NULL,
  "partialCredit" REAL,
  "responseMs" INTEGER NOT NULL,
  "usedHint" INTEGER NOT NULL DEFAULT 0,
  "rapidGuess" INTEGER NOT NULL DEFAULT 0,
  "difficultyB" REAL NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "QuestionAttempt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PracticeSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QuestionAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QuestionAttempt_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QuestionAttempt_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "QuestionAttempt_studentId_skillId_createdAt_idx" ON "QuestionAttempt"("studentId", "skillId", "createdAt");

CREATE INDEX "QuestionAttempt_questionId_createdAt_idx" ON "QuestionAttempt"("questionId", "createdAt");

CREATE INDEX "QuestionAttempt_skillId_createdAt_idx" ON "QuestionAttempt"("skillId", "createdAt");

CREATE INDEX "QuestionAttempt_sessionId_fk_idx" ON "QuestionAttempt"("sessionId");

CREATE TABLE "AdaptiveDecisionLog" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "studentId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "attemptId" INTEGER,
  "questionId" TEXT,
  "skillId" TEXT NOT NULL,
  "previousTheta" REAL NOT NULL,
  "newTheta" REAL NOT NULL,
  "thetaSE" REAL NOT NULL,
  "questionDifficulty" REAL,
  "responseCorrect" INTEGER,
  "responseMs" INTEGER,
  "masteryBefore" REAL,
  "masteryAfter" REAL,
  "nextQuestionId" TEXT,
  "nextTargetB" REAL,
  "reason" TEXT NOT NULL,
  "reasonCode" TEXT NOT NULL,
  "engineVersion" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "AdaptiveDecisionLog_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "AdaptiveDecisionLog_studentId_createdAt_idx" ON "AdaptiveDecisionLog"("studentId", "createdAt");

CREATE INDEX "AdaptiveDecisionLog_sessionId_idx" ON "AdaptiveDecisionLog"("sessionId");

CREATE TABLE "StudentAbility" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "skillId" TEXT,
  "domain" TEXT CHECK ("domain" IN ('READING', 'VOCABULARY', 'GRAMMAR', 'LANGUAGE', 'WRITING', 'WORD_STUDY')),
  "theta" REAL NOT NULL DEFAULT 0,
  "thetaSE" REAL NOT NULL DEFAULT 1,
  "responses" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TEXT NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "StudentAbility_studentId_scope_key" UNIQUE ("studentId", "scope"),
  CONSTRAINT "StudentAbility_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StudentAbility_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "StudentAbility_skillId_idx" ON "StudentAbility"("skillId");

CREATE TABLE "AbilitySnapshot" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "studentId" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "theta" REAL NOT NULL,
  "mastery" REAL,
  "takenOn" TEXT NOT NULL,
  CONSTRAINT "AbilitySnapshot_studentId_scope_takenOn_key" UNIQUE ("studentId", "scope", "takenOn"),
  CONSTRAINT "AbilitySnapshot_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "AbilitySnapshot_takenOn_idx" ON "AbilitySnapshot"("takenOn");

CREATE TABLE "StudentSkillMastery" (
  "studentId" TEXT NOT NULL,
  "skillId" TEXT NOT NULL,
  "score" REAL NOT NULL DEFAULT 0,
  "band" TEXT NOT NULL DEFAULT 'BEGINNING' CHECK ("band" IN ('BEGINNING', 'DEVELOPING', 'APPROACHING', 'PROFICIENT', 'MASTERED')),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "correct" INTEGER NOT NULL DEFAULT 0,
  "maxLevelCorrect" INTEGER NOT NULL DEFAULT 0,
  "isMastered" INTEGER NOT NULL DEFAULT 0,
  "masteredAt" TEXT,
  "lastPracticedAt" TEXT,
  "components" TEXT,
  "updatedAt" TEXT NOT NULL,
  PRIMARY KEY ("studentId", "skillId"),
  CONSTRAINT "StudentSkillMastery_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StudentSkillMastery_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "StudentSkillMastery_skillId_band_idx" ON "StudentSkillMastery"("skillId", "band");

CREATE TABLE "ReadingLevelBand" (
  "id" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "minPrl" INTEGER NOT NULL,
  "maxPrl" INTEGER NOT NULL,
  "gradeBand" TEXT,
  PRIMARY KEY ("id")
);

CREATE TABLE "StudentReadingRange" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "lowPrl" INTEGER NOT NULL,
  "highPrl" INTEGER NOT NULL,
  "evidence" INTEGER NOT NULL,
  "computedAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("id"),
  CONSTRAINT "StudentReadingRange_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "StudentReadingRange_studentId_computedAt_idx" ON "StudentReadingRange"("studentId", "computedAt");

CREATE TABLE "Assignment" (
  "id" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "target" TEXT NOT NULL CHECK ("target" IN ('SKILL', 'UNIT', 'ASSESSMENT')),
  "unitId" TEXT,
  "skillIds" TEXT,
  "assessmentId" TEXT,
  "targetMastery" INTEGER,
  "dueAt" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "deletedAt" TEXT,
  PRIMARY KEY ("id"),
  CONSTRAINT "Assignment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Assignment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Assignment_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Assignment_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "Assignment_classId_dueAt_idx" ON "Assignment"("classId", "dueAt");

CREATE INDEX "Assignment_createdById_fk_idx" ON "Assignment"("createdById");

CREATE INDEX "Assignment_unitId_fk_idx" ON "Assignment"("unitId");

CREATE INDEX "Assignment_assessmentId_fk_idx" ON "Assignment"("assessmentId");

CREATE TABLE "AssignmentStudent" (
  "assignmentId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'NOT_STARTED' CHECK ("status" IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE')),
  "progress" REAL NOT NULL DEFAULT 0,
  "completedAt" TEXT,
  PRIMARY KEY ("assignmentId", "studentId"),
  CONSTRAINT "AssignmentStudent_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AssignmentStudent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "AssignmentStudent_studentId_status_idx" ON "AssignmentStudent"("studentId", "status");

CREATE TABLE "Assessment" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "type" TEXT NOT NULL CHECK ("type" IN ('DIAGNOSTIC', 'PLACEMENT', 'UNIT_QUIZ', 'BENCHMARK', 'TEACHER_QUIZ', 'FINAL')),
  "unitId" TEXT,
  "isAdaptive" INTEGER NOT NULL DEFAULT 0,
  "maxQuestions" INTEGER,
  "timeLimitMin" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'DRAFT' CHECK ("status" IN ('DRAFT', 'UNDER_REVIEW', 'PUBLISHED', 'ARCHIVED')),
  "createdById" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "deletedAt" TEXT,
  PRIMARY KEY ("id"),
  CONSTRAINT "Assessment_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "Assessment_unitId_fk_idx" ON "Assessment"("unitId");

CREATE TABLE "AssessmentQuestion" (
  "assessmentId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "points" REAL NOT NULL DEFAULT 1,
  PRIMARY KEY ("assessmentId", "questionId"),
  CONSTRAINT "AssessmentQuestion_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AssessmentQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "AssessmentQuestion_questionId_fk_idx" ON "AssessmentQuestion"("questionId");

CREATE TABLE "ExternalAssessmentSource" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "notes" TEXT,
  PRIMARY KEY ("id"),
  CONSTRAINT "ExternalAssessmentSource_code_key" UNIQUE ("code")
);

CREATE TABLE "ExternalSkillRef" (
  "id" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "externalCode" TEXT NOT NULL,
  "externalName" TEXT NOT NULL,
  "gradeLevel" INTEGER,
  "skillId" TEXT,
  PRIMARY KEY ("id"),
  CONSTRAINT "ExternalSkillRef_sourceId_externalCode_gradeLevel_key" UNIQUE ("sourceId", "externalCode", "gradeLevel"),
  CONSTRAINT "ExternalSkillRef_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ExternalAssessmentSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ExternalSkillRef_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ExternalSkillRef_skillId_fk_idx" ON "ExternalSkillRef"("skillId");

CREATE TABLE "ExternalAssessmentResult" (
  "id" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "importJobId" TEXT,
  "externalSkill" TEXT,
  "score" REAL,
  "questions" INTEGER,
  "timeSpentSec" INTEGER,
  "takenOn" TEXT,
  "raw" TEXT NOT NULL,
  "importedAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("id"),
  CONSTRAINT "ExternalAssessmentResult_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ExternalAssessmentSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ExternalAssessmentResult_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ExternalAssessmentResult_studentId_sourceId_idx" ON "ExternalAssessmentResult"("studentId", "sourceId");

CREATE INDEX "ExternalAssessmentResult_sourceId_fk_idx" ON "ExternalAssessmentResult"("sourceId");

CREATE TABLE "MapResult" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "importJobId" TEXT,
  "testDate" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "goalName" TEXT,
  "goalAreaId" TEXT,
  "rit" INTEGER NOT NULL,
  "ritSE" REAL,
  "achievementPercentile" INTEGER,
  "growthPercentile" INTEGER,
  "projectedGrowth" INTEGER,
  "termName" TEXT,
  "importedAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("id"),
  CONSTRAINT "MapResult_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MapResult_goalAreaId_fkey" FOREIGN KEY ("goalAreaId") REFERENCES "MapGoalArea"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "MapResult_studentId_testDate_idx" ON "MapResult"("studentId", "testDate");

CREATE INDEX "MapResult_studentId_subject_testDate_idx" ON "MapResult"("studentId", "subject", "testDate");

CREATE INDEX "MapResult_goalAreaId_fk_idx" ON "MapResult"("goalAreaId");

CREATE TABLE "BenchmarkReference" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "metric" TEXT NOT NULL,
  "gradeLevel" INTEGER NOT NULL,
  "season" TEXT,
  "value" REAL NOT NULL,
  "source" TEXT NOT NULL,
  "importedAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("id"),
  CONSTRAINT "BenchmarkReference_scope_metric_gradeLevel_season_key" UNIQUE ("scope", "metric", "gradeLevel", "season")
);

CREATE TABLE "ImportJob" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('STUDENTS', 'TEACHERS', 'QUESTIONS', 'SKILLS', 'STANDARDS', 'CURRICULUM_MAP', 'MAP_RESULTS', 'EXTERNAL_RESULTS')),
  "status" TEXT NOT NULL DEFAULT 'UPLOADED' CHECK ("status" IN ('UPLOADED', 'VALIDATING', 'AWAITING_CONFIRMATION', 'IMPORTING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  "fileName" TEXT NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "totalRows" INTEGER NOT NULL DEFAULT 0,
  "validRows" INTEGER NOT NULL DEFAULT 0,
  "errorRows" INTEGER NOT NULL DEFAULT 0,
  "duplicateRows" INTEGER NOT NULL DEFAULT 0,
  "preview" TEXT,
  "errors" TEXT,
  "fileSha256" TEXT,
  "payload" TEXT,
  "options" TEXT,
  "summary" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "completedAt" TEXT,
  PRIMARY KEY ("id"),
  CONSTRAINT "ImportJob_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ImportJob_kind_status_idx" ON "ImportJob"("kind", "status");

CREATE INDEX "ImportJob_uploadedById_fk_idx" ON "ImportJob"("uploadedById");

CREATE TABLE "Recommendation" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "skillId" TEXT NOT NULL,
  "targetLevel" INTEGER NOT NULL,
  "score" REAL NOT NULL,
  "reasons" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "dismissedAt" TEXT,
  PRIMARY KEY ("id"),
  CONSTRAINT "Recommendation_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "Recommendation_studentId_createdAt_idx" ON "Recommendation"("studentId", "createdAt");

CREATE TABLE "InterventionAlert" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "skillId" TEXT,
  "ruleCode" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "evidence" TEXT NOT NULL,
  "resolvedAt" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("id"),
  CONSTRAINT "InterventionAlert_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "InterventionAlert_studentId_resolvedAt_idx" ON "InterventionAlert"("studentId", "resolvedAt");

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL CHECK ("type" IN ('NEW_ASSIGNMENT', 'ASSIGNMENT_DUE', 'SKILL_MASTERED', 'TEACHER_FEEDBACK', 'NEW_BADGE', 'ASSESSMENT_AVAILABLE', 'PARENT_PROGRESS', 'INTERVENTION_ALERT')),
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "link" TEXT,
  "readAt" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("id"),
  CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

CREATE TABLE "Badge" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "criteria" TEXT NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "Badge_code_key" UNIQUE ("code")
);

CREATE TABLE "StudentBadge" (
  "studentId" TEXT NOT NULL,
  "badgeId" TEXT NOT NULL,
  "awardedAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY ("studentId", "badgeId"),
  CONSTRAINT "StudentBadge_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StudentBadge_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "Badge"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "StudentBadge_badgeId_fk_idx" ON "StudentBadge"("badgeId");

CREATE TABLE "XpEvent" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "studentId" TEXT NOT NULL,
  "points" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "XpEvent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "XpEvent_studentId_createdAt_idx" ON "XpEvent"("studentId", "createdAt");

CREATE TABLE "AuditLog" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "before" TEXT,
  "after" TEXT,
  "ip" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

CREATE TABLE "StudentDailyActivity" (
  "studentId" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "questions" INTEGER NOT NULL DEFAULT 0,
  "correct" INTEGER NOT NULL DEFAULT 0,
  "activeMs" INTEGER NOT NULL DEFAULT 0,
  "skillsPracticed" INTEGER NOT NULL DEFAULT 0,
  "maxLevel" INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY ("studentId", "day"),
  CONSTRAINT "StudentDailyActivity_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "StudentDailyActivity_day_idx" ON "StudentDailyActivity"("day");

CREATE TABLE "ClassSkillDaily" (
  "classId" TEXT NOT NULL,
  "skillId" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "studentsPracticed" INTEGER NOT NULL DEFAULT 0,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "correct" INTEGER NOT NULL DEFAULT 0,
  "avgMastery" REAL,
  "masteredStudents" INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY ("classId", "skillId", "day"),
  CONSTRAINT "ClassSkillDaily_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ClassSkillDaily_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ClassSkillDaily_skillId_day_idx" ON "ClassSkillDaily"("skillId", "day");

CREATE TABLE "RateLimitBucket" (
  "key" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "windowStart" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL,
  PRIMARY KEY ("key")
);

CREATE INDEX "RateLimitBucket_windowStart_idx" ON "RateLimitBucket"("windowStart");

CREATE TABLE "DiagnosticResult" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "takenAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "questions" INTEGER NOT NULL,
  "overallTheta" REAL NOT NULL,
  "overallSE" REAL NOT NULL,
  "proficiency" TEXT NOT NULL,
  "domains" TEXT NOT NULL,
  "strongDomains" TEXT NOT NULL,
  "weakDomains" TEXT NOT NULL,
  "recommendedSkillIds" TEXT NOT NULL,
  "interventionSkillIds" TEXT NOT NULL,
  "engineVersion" TEXT NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "DiagnosticResult_sessionId_key" UNIQUE ("sessionId"),
  CONSTRAINT "DiagnosticResult_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "DiagnosticResult_studentId_takenAt_idx" ON "DiagnosticResult"("studentId", "takenAt");
