import { expect, type Page } from "@playwright/test";

export const PASSWORD = process.env.DEMO_PASSWORD ?? "";
if (!PASSWORD) throw new Error("Set DEMO_PASSWORD to the password used for `npm run db:seed:demo`.");

export const USERS = { student: "demo.s1001", teacher: "demo.teacher.4a", otherTeacher: "demo.teacher.4b", admin: "demo.admin", parent: "demo.p1001" } as const;

export async function login(page: Page, username: string, password = PASSWORD): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
  if (page.url().includes("/change-password")) throw new Error(`${username} must change the demo password first; reseed or use a fresh demo database.`);
}

export async function logout(page: Page): Promise<void> {
  await page.context().clearCookies();
}

/** Answers whatever question type is on screen (not necessarily correctly) and checks it. */
export async function answerCurrentQuestion(page: Page): Promise<void> {
  const radio = page.getByRole("radio").first();
  const select = page.getByLabel("Choose the word that fits");
  const text = page.getByLabel("Type the missing word");
  const checkbox = page.getByRole("checkbox").first();
  if (await radio.isVisible().catch(() => false)) await radio.click();
  else if (await select.isVisible().catch(() => false)) await select.selectOption({ index: 1 });
  else if (await text.isVisible().catch(() => false)) await text.fill("answer");
  else if (await checkbox.isVisible().catch(() => false)) await checkbox.check();
  await page.getByRole("button", { name: "Check answer" }).click();
  await expect(page.getByRole("status").first()).toBeVisible();
}
