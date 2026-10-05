"use client";
import { useState } from "react";
import { createUserAction } from "../actions";
import { ActionForm } from "@/components/admin/action-form";
import { field, label } from "@/components/admin/styles";

/** Create one user. Role-specific fields appear for the chosen role. */
export function CreateUserForm({ grades, classes }: { grades: number[]; classes: { id: string; name: string; grade: number }[] }) {
  const [role, setRole] = useState("STUDENT");
  const [grade, setGrade] = useState(grades[0] ?? 4);
  return (
    <ActionForm action={createUserAction} submit="Create account" className="grid gap-3 sm:grid-cols-2">
      <label className={label}>Role
        <select name="role" value={role} onChange={(e) => setRole(e.target.value)} className={field}>
          <option value="STUDENT">Student</option><option value="TEACHER">Teacher</option><option value="PARENT">Parent</option><option value="SCHOOL_ADMIN">School admin</option>
        </select>
      </label>
      <label className={label}>Username<input name="username" required minLength={3} maxLength={40} pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{2,39}" className={field} autoComplete="off" /></label>
      <label className={label}>Full name<input name="displayName" required maxLength={100} dir="auto" className={field} /></label>
      <label className={label}>Email (optional)<input name="email" type="email" maxLength={254} className={field} /></label>
      {role === "STUDENT" && (
        <>
          <label className={label}>Student number<input name="studentNumber" required maxLength={32} className={field} /></label>
          <label className={label}>Grade
            <select name="gradeLevel" value={grade} onChange={(e) => setGrade(Number(e.target.value))} className={field}>{grades.map((g) => <option key={g} value={g}>Grade {g}</option>)}</select>
          </label>
          <label className={label}>Class
            <select name="classId" className={field}><option value="">No class yet</option>{classes.filter((c) => c.grade === grade).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          </label>
        </>
      )}
      {role === "TEACHER" && <label className={label}>Title (optional)<input name="title" maxLength={20} placeholder="Miss" className={field} /></label>}
      <div className="sm:col-span-2" />
    </ActionForm>
  );
}
