import { NextResponse } from "next/server";
import { apiActor } from "@/server/auth/next";

/** The Reports hub's "Each student" picker (a GET form) → the student's ONE profile page (which checks access). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!(await apiActor())) return NextResponse.redirect(new URL("/login", url.origin));
  const id = (url.searchParams.get("id") ?? "").replace(/[^A-Za-z0-9_-]/g, "");
  return NextResponse.redirect(new URL(id ? `/teacher/students/${id}` : "/teacher/reports", url.origin));
}
