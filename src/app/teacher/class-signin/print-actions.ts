"use server";
import { headers } from "next/headers";
import { clientIp } from "@/server/auth/http";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { newPrintCode, newPrintLink, turnOffPrintQr, turnOnPrintQr, type PrintQrView } from "@/server/auth/class-print-qr";

const STAFF = ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] as const;

export type PrintQrResult = { ok: true; view: PrintQrView } | { ok: false; error: string };

const ip = async () => clientIp(await headers());
const fail = (e: unknown): { ok: false; error: string } => {
  if (e instanceof ForbiddenError || (e as { status?: number })?.status === 403) return { ok: false, error: "Only the class's own teacher can do this." };
  throw e;
};

/** 🖨 Turn the printable QR on (first time: a new link + code; again: the same link). */
export async function turnOnPrintQrAction(classId: string): Promise<PrintQrResult> {
  const actor = await requireActor({ roles: [...STAFF] });
  try { return { ok: true, view: await turnOnPrintQr(repo, actor, String(classId ?? ""), { ip: await ip() }) }; } catch (e) { return fail(e); }
}

/** 🔢 A new class code (the printed QR keeps working). */
export async function newPrintCodeAction(classId: string): Promise<PrintQrResult> {
  const actor = await requireActor({ roles: [...STAFF] });
  try { return { ok: true, view: await newPrintCode(repo, actor, String(classId ?? ""), { ip: await ip() }) }; } catch (e) { return fail(e); }
}

/** 🔗 A new link: every QR printed before stops working. */
export async function newPrintLinkAction(classId: string): Promise<PrintQrResult> {
  const actor = await requireActor({ roles: [...STAFF] });
  try { return { ok: true, view: await newPrintLink(repo, actor, String(classId ?? ""), { ip: await ip() }) }; } catch (e) { return fail(e); }
}

/** ⏸ Turn the printed QR off. */
export async function turnOffPrintQrAction(classId: string): Promise<PrintQrResult> {
  const actor = await requireActor({ roles: [...STAFF] });
  try { return { ok: true, view: await turnOffPrintQr(repo, actor, String(classId ?? ""), { ip: await ip() }) }; } catch (e) { return fail(e); }
}
