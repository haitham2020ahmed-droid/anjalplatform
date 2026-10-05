import { expect, test } from "@playwright/test";
import { login, PASSWORD, USERS } from "./helpers";

test.describe("sign-in and session security", () => {
  test("pages require a session", async ({ page }) => {
    for (const path of ["/student", "/teacher", "/admin", "/parent", "/admin/users"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    }
  });

  test("wrong password is refused without saying which part was wrong", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill(USERS.teacher);
    await page.getByLabel("Password").fill(`${PASSWORD}-wrong`);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("alert")).not.toContainText(/username (is|was) (correct|right)/i);
    await expect(page).toHaveURL(/\/login/);
  });

  test("session cookie is HttpOnly and SameSite; security headers are set", async ({ page, baseURL }) => {
    const res = await page.goto("/login");
    const h = res!.headers();
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["referrer-policy"]).toBeTruthy();
    await login(page, USERS.teacher);
    const cookie = (await page.context().cookies(baseURL)).find((c) => c.name.includes("ela_session"))!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).not.toBe("None");
  });

  test("each role lands on its own home and cannot open other roles' areas", async ({ page }) => {
    await login(page, USERS.student);
    await expect(page).toHaveURL(/\/student/);
    for (const path of ["/admin", "/admin/users", "/teacher", "/admin/settings"]) {
      const res = await page.goto(path);
      expect(page.url().includes(path) ? res!.status() : 403).toBeGreaterThanOrEqual(400);
    }
  });

  test("logout cannot be triggered by a GET link from another site", async ({ page, request }) => {
    await login(page, USERS.teacher);
    const res = await request.get("/logout", { maxRedirects: 0 }).catch(() => null);
    expect(res === null || res.status() === 405 || res.status() >= 400).toBeTruthy();
    await page.goto("/teacher");
    await expect(page).toHaveURL(/\/teacher/);
  });

  test("interactive components work under the production Content-Security-Policy (nonce)", async ({ page }) => {
    const violations: string[] = [];
    page.on("console", (m) => { if (/Content Security Policy|Refused to (execute|load)/i.test(m.text())) violations.push(m.text()); });
    await login(page, USERS.admin);
    const res = await page.goto("/admin/users");
    expect(res!.headers()["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'|unsafe-inline/);
    await page.getByLabel("Role").first().selectOption("TEACHER");
    await expect(page.getByLabel("Title (optional)")).toBeVisible(); // only appears if React hydrated
    expect(violations).toEqual([]);
  });
});
