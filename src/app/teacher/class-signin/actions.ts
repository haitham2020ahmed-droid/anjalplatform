"use server";
import { headers } from "next/headers";
import { clientIp } from "@/server/auth/http";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { closeClassSignIn, letInClassStudent, openClassSignIn, signOutClassStudent, type OpenedSignIn } from "@/server/auth/class-signin";

const STAFF = ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] as const;

/** What the teacher's screen needs to draw the QR (the token never leaves this teacher's page). */
export type OpenQr = { id: string; token: string; code: string; expiresAt: string; classId: string; className: string };
export type QrResult = { ok: true; qr: OpenQr } | { ok: false; error: string };

const view = (o: OpenedSignIn): OpenQr => ({ id: o.id, token: o.token, code: o.code, expiresAt: o.expiresAt.toISOString(), classId: o.classId, className: o.className });
const ip = async () => clientIp(await headers());
const fail = (e: unknown): { ok: false; error: string } => {
  if (e instanceof ForbiddenError || (e as { status?: number })?.status === 403) return { ok: false, error: "Only the class's own teacher can do this." };
  throw e;
};

/** 📱 Open a NEW QR for one of my classes (any older one of this class stops working). */
export async function openQrAction(classId: string): Promise<QrResult> {
  const actor = await requireActor({ roles: [...STAFF] });
  try { return { ok: true, qr: view(await openClassSignIn(repo, actor, String(classId ?? ""), { ip: await ip() })) }; }
  catch (e) { return fail(e); }
}

/** ✖ Close the QR now. */
export async function closeQrAction(signInId: string): Promise<{ ok: boolean; error?: string }> {
  const actor = await requireActor({ roles: [...STAFF] });
  try { await closeClassSignIn(repo, actor, String(signInId ?? ""), { ip: await ip() }); return { ok: true }; }
  catch (e) { return fail(e); }
}

/** ⏏ Sign a student out (all their sessions end). */
export async function signOutStudentAction(classId: string, studentId: string): Promise<{ ok: boolean; error?: string }> {
  const actor = await requireActor({ roles: [...STAFF] });
  try { await signOutClassStudent(repo, actor, String(classId ?? ""), String(studentId ?? ""), { ip: await ip() }); return { ok: true }; }
  catch (e) { return fail(e); }
}

/** ➕ Let a late student in (opens a new QR when none is open). */
export async function letInStudentAction(classId: string, studentId: string): Promise<{ ok: true; qr: OpenQr | null } | { ok: false; error: string }> {
  const actor = await requireActor({ roles: [...STAFF] });
  try { const r = await letInClassStudent(repo, actor, String(classId ?? ""), String(studentId ?? ""), { ip: await ip() }); return { ok: true, qr: r.opened ? view(r.opened) : null }; }
  catch (e) { return fail(e); }
}
