/**
 * DEMO school — development and testing only. Everything is labelled:
 * School.isDemo = true, codes/usernames start with "demo"/"DEMO", demo-only
 * questions have origin = DEMO and stems starting with "[DEMO]".
 * The caller must refuse to run this in production.
 */
import { LEVEL_TO_B } from "../../config/engine";
import type { Repo } from "./repo";

export const DEMO_SCHOOL_CODE = "DEMO-SCHOOL";

/** Original demo items for Grade 4 · Context Clues, two per level (stems prefixed [DEMO]). */
export const DEMO_ITEMS: { level: number; stem: string; options: [string, string, string, string]; why: string; tip: string }[] = [
  { level: 1, stem: "The puppy was tiny, so small it fit in my hand. What does tiny mean?", options: ["very small", "very loud", "very fast", "very old"], why: "“So small it fit in my hand” explains tiny.", tip: "Look for words after a comma that explain the word." },
  { level: 1, stem: "Sam was glad, or happy, to see his friend. What does glad mean?", options: ["happy", "tired", "angry", "hungry"], why: "“Or happy” gives a synonym clue.", tip: "The word “or” often signals a synonym." },
  { level: 2, stem: "Unlike her noisy brother, Lina was quiet in class. What does quiet mean?", options: ["making little sound", "very busy", "always late", "full of jokes"], why: "“Unlike … noisy” is an antonym clue.", tip: "“Unlike” and “but” often signal an opposite." },
  { level: 2, stem: "We packed fruit, such as apples and bananas, for the trip. What is fruit here?", options: ["foods like apples and bananas", "a kind of bag", "a long trip", "a type of car"], why: "“Such as” introduces examples.", tip: "Example clues follow “such as” and “for example.”" },
  { level: 3, stem: "The desert was arid; no rain had fallen for months. What does arid mean?", options: ["very dry", "very cold", "crowded", "beautiful"], why: "No rain for months means very dry.", tip: "A semicolon can join a word to its explanation." },
  { level: 3, stem: "Maya was reluctant to jump into the cold pool and stood at the edge for ten minutes. What does reluctant mean?", options: ["not wanting to do something", "excited and ready", "very skilled", "unable to swim"], why: "Waiting ten minutes shows she did not want to jump.", tip: "Actions can explain a feeling word." },
  { level: 4, stem: "After the storm, the town worked to restore the damaged bridge so cars could cross again. What does restore mean?", options: ["bring back to good condition", "build somewhere new", "close forever", "paint a new color"], why: "Cars could cross again, so the bridge was fixed.", tip: "The result can reveal the meaning." },
  { level: 4, stem: "The scientist was meticulous, checking every measurement three times. What does meticulous mean?", options: ["very careful about details", "in a hurry", "forgetful", "unfriendly"], why: "Checking three times describes great care.", tip: "Habits are strong clues for character words." },
  { level: 5, stem: "Water is scarce in the desert, so plants store it in their thick stems. What does scarce mean?", options: ["hard to find; not enough", "very clean", "always flowing", "too heavy"], why: "Plants store water because there is little of it.", tip: "So and because link cause and effect." },
  { level: 5, stem: "“The trail was treacherous. Loose rocks slid under our boots, and the edge dropped straight down.” What does treacherous mean?", options: ["dangerous", "long", "crowded", "muddy"], why: "Loose rocks and a steep drop describe danger.", tip: "Clues can be in the next sentence." },
  { level: 6, stem: "“Some animals hibernate. Bears, for instance, sleep through the winter.” Which clue best explains hibernate?", options: ["sleep through the winter", "some animals", "for instance", "bears"], why: "That example defines hibernate.", tip: "Choose the clue that explains the word." },
  { level: 6, stem: "“Unlike his gregarious sister, who chatted with everyone, Omar stayed by the window.” What does gregarious mean?", options: ["enjoying being with others", "shy and quiet", "very tall", "bored"], why: "She chatted with everyone, so she is sociable.", tip: "Decide which person the word describes." },
  { level: 7, stem: "“The decision was unanimous: all twelve members raised their hands.” What does unanimous mean, and which clue proves it?", options: ["everyone agreed — “all twelve members raised their hands”", "most agreed — “the decision”", "no one agreed — “raised their hands”", "they argued — “twelve members”"], why: "Every member voted yes.", tip: "Both the meaning and the evidence must be right." },
  { level: 7, stem: "“Rather than squander his allowance on candy, Leo saved every coin.” What does squander mean?", options: ["waste carelessly", "save slowly", "count carefully", "share fairly"], why: "“Rather than” contrasts squander with saving.", tip: "“Rather than” sets up a contrast clue." },
];

export interface DemoOptions {
  passwordHash: string; // computed by the caller from DEMO_PASSWORD
  classesPerGrade: number;
  studentsPerClass: number;
}

export interface DemoReport {
  classes: number;
  teachers: number;
  students: number;
  parents: number;
  demoQuestions: number;
}

export async function seedDemoSchool(repo: Repo, opts: DemoOptions): Promise<DemoReport> {
  const rep: DemoReport = { classes: 0, teachers: 0, students: 0, parents: 0, demoQuestions: 0 };
  return repo.transaction(async (tx) => {
    const school = await tx.upsert("School", { code: DEMO_SCHOOL_CODE }, { name: "Demo International School", isDemo: true }, { isDemo: true });
    const year = await tx.upsert("AcademicYear", { schoolId: school.id, name: "DEMO 2026-2027" }, {
      startDate: new Date("2026-09-01"), endDate: new Date("2027-06-30"), isCurrent: true,
    });
    for (const [i, t] of ["Term 1", "Term 2"].entries())
      await tx.upsert("Term", { academicYearId: year.id, name: t }, {
        startDate: new Date(i === 0 ? "2026-09-01" : "2027-01-10"), endDate: new Date(i === 0 ? "2026-12-31" : "2027-06-30"),
      });
    const mkUser = (username: string, displayName: string, role: string) =>
      tx.upsert("User", { username }, { displayName, role, schoolId: school.id, passwordHash: opts.passwordHash });

    await mkUser("demo.admin", "Demo Admin", "SCHOOL_ADMIN");
    let studentNo = 1000;
    for (const level of [4, 5, 6]) {
      const grade = await tx.findUnique("Grade", { schoolId: school.id, level });
      if (!grade) throw new Error(`Seed the curriculum for ${DEMO_SCHOOL_CODE} first (grade ${level} missing).`);
      for (let c = 0; c < opts.classesPerGrade; c++) {
        const name = `DEMO ${level}${"ABCDEFGHIJ"[c]}`;
        const klass = await tx.upsert("Class", { academicYearId: year.id, name }, { schoolId: school.id, gradeId: grade.id });
        rep.classes++;
        const tUser = await mkUser(`demo.teacher.${level}${"abcdefghij"[c]}`, `Demo Teacher ${level}${"ABCDEFGHIJ"[c]}`, "TEACHER");
        const teacher = await tx.upsert("Teacher", { userId: tUser.id }, { schoolId: school.id });
        await tx.upsert("ClassTeacher", { classId: klass.id, teacherId: teacher.id }, {});
        rep.teachers++;
        for (let s = 0; s < opts.studentsPerClass; s++) {
          studentNo++;
          const u = await mkUser(`demo.s${studentNo}`, `Demo Student ${studentNo}`, "STUDENT");
          const st = await tx.upsert("Student", { userId: u.id }, { schoolId: school.id, gradeId: grade.id, studentNumber: `DEMO-${studentNo}` });
          await tx.upsert("ClassMembership", { classId: klass.id, studentId: st.id }, {});
          rep.students++;
          if (s % 5 === 0) {
            const pUser = await mkUser(`demo.p${studentNo}`, `Demo Parent ${studentNo}`, "PARENT");
            const parent = await tx.upsert("Parent", { userId: pUser.id }, {});
            await tx.upsert("ParentStudent", { parentId: parent.id, studentId: st.id }, { relationship: "guardian" });
            rep.parents++;
          }
        }
      }
    }

    // Demo-only Context Clues items in the demo school's Grade 4 skill
    const g4 = await tx.findUnique("Grade", { schoolId: school.id, level: 4 });
    const cur = (await tx.findMany("Curriculum", { gradeId: g4!.id }))[0];
    const skill = await tx.findUnique("Skill", { curriculumId: cur.id, code: "G4.context-clues" });
    const mc = await tx.upsert("QuestionType", { code: "MULTIPLE_CHOICE" }, { name: "Multiple choice" });
    for (const [i, it] of DEMO_ITEMS.entries()) {
      const ref = `DEMO-G4-CC-${String(i + 1).padStart(2, "0")}`;
      if (await tx.findUnique("Question", { skillId: skill!.id, externalRef: ref })) continue;
      const q = await tx.create("Question", {
        externalRef: ref, skillId: skill!.id, typeId: mc.id, stem: `[DEMO] ${it.stem}`, content: {},
        difficultyLevel: it.level, irtB: LEVEL_TO_B[it.level], irtA: 1, estimatedSeconds: 30 + it.level * 8,
        status: "PUBLISHED", origin: "DEMO", publishedAt: new Date(),
      });
      const order = [0, 1, 2, 3].map((k) => (k + i) % 4); // rotate so the key isn't always A
      for (const [pos, src] of order.entries())
        await tx.create("QuestionOption", { questionId: q.id, label: "ABCD"[pos], text: it.options[src], isCorrect: src === 0, order: pos, rationale: src === 0 ? null : "This does not fit the clue in the sentence." });
      await tx.create("QuestionExplanation", { questionId: q.id, kind: "WHY_CORRECT", body: [{ type: "text", text: it.why }], order: 0 });
      await tx.create("QuestionExplanation", { questionId: q.id, kind: "TIP", body: [{ type: "text", text: it.tip }], order: 1 });
      rep.demoQuestions++;
    }
    return rep;
  });
}
