import { expect, test } from "@playwright/test";
import { login, USERS } from "./helpers";

test.describe("teacher dashboard and reports", () => {
  test("class dashboard → student profile → Arabic PDF report", async ({ page }) => {
    await login(page, USERS.teacher);
    await page.locator('a[href^="/teacher/classes/"]').first().click();
    await expect(page.getByRole("heading").first()).toBeVisible();
    await page.locator('a[href^="/teacher/students/"]').first().click();
    const link = page.locator('a[href*="/api/reports?kind=student"][href*="format=pdf"][href*="lang=ar"]');
    const res = await page.request.get((await link.getAttribute("href"))!);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("application/pdf");
    expect(res.headers()["content-disposition"]).toMatch(/attachment; filename="student-report_.*_ar\.pdf"/);
    expect((await res.body()).subarray(0, 5).toString()).toBe("%PDF-");
  });

  test("class report in Excel and CSV", async ({ page }) => {
    await login(page, USERS.teacher);
    await page.locator('a[href^="/teacher/classes/"]').first().click();
    const classId = page.url().match(/classes\/([^/?]+)/)![1];
    for (const [format, type] of [["xlsx", "spreadsheetml"], ["csv", "text/csv"]] as const) {
      const res = await page.request.get(`/api/reports?kind=class&classId=${classId}&format=${format}&lang=ar&period=TERM`);
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toContain(type);
    }
  });

  test("a teacher cannot open another teacher's class", async ({ page, browser }) => {
    const other = await browser.newPage();
    await login(other, USERS.otherTeacher);
    await other.locator('a[href^="/teacher/classes/"]').first().click();
    const foreignClass = other.url().match(/classes\/([^/?]+)/)![1];
    await other.close();
    await login(page, USERS.teacher);
    const res = await page.request.get(`/api/reports?kind=class&classId=${foreignClass}&format=csv`);
    expect(res.status()).toBe(404);
    const view = await page.goto(`/teacher/classes/${foreignClass}`);
    expect(view!.status()).toBeGreaterThanOrEqual(400);
  });
});
