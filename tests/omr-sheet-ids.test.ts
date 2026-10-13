import { test } from "node:test";
import assert from "node:assert/strict";
import { blankSheetCode, classSheetCodes, matchSheetCode, sheetStudentNo } from "../src/lib/omr/sheet-ids";

test("bubble sheet codes: long ids map to short codes and back to the right student", () => {
  const testId = "cmabc123testidxyz000001";
  const students = Array.from({ length: 40 }, (_, i) => `cmstudent${String(i).padStart(4, "0")}zzqq`);
  const codes = classSheetCodes(testId, students);
  assert.equal(codes.size, 40);
  for (const id of students) {
    const code = codes.get(id)!;
    assert.equal(code.length, 8);
    const m = matchSheetCode(code, testId, students);
    assert.equal(m.wrongTest, false);
    // a unique short number gives the student back; a collision prints a test-only code (teacher picks)
    const unique = students.filter((s) => sheetStudentNo(s) === sheetStudentNo(id)).length === 1;
    assert.equal(m.studentId, unique ? id : null);
  }
  assert.deepEqual(matchSheetCode(blankSheetCode(testId), testId, students), { wrongTest: false, studentId: null });
  assert.equal(matchSheetCode(codes.get(students[0])!, "cmanothertest999", students).wrongTest, true);
  assert.deepEqual(matchSheetCode(null, testId, students), { wrongTest: false, studentId: null });
});
