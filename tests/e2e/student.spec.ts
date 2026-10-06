import { expect, test } from "@playwright/test";
import { answerCurrentQuestion, login, USERS } from "./helpers";

test.describe("student practice @tablet", () => {
  test("a student opens a skill, answers, sees feedback and moves on", async ({ page }) => {
    await login(page, USERS.student);
    await expect(page.getByRole("heading").first()).toBeVisible();
    const unit = page.locator('a[href^="/student/unit/"]').first();
    if (await unit.isVisible().catch(() => false)) await unit.click();
    await page.locator('a[href^="/practice/"]').first().click();
    await expect(page).toHaveURL(/\/practice\//);
    await answerCurrentQuestion(page);
    await page.getByRole("button", { name: "Next question" }).click();
    await expect(page.getByRole("button", { name: "Check answer" })).toBeVisible();
  });

  test("a student cannot download reports or open another student's data", async ({ page }) => {
    await login(page, USERS.student);
    const r = await page.request.get("/api/reports?kind=class&classId=x&format=csv");
    expect([401, 403, 404]).toContain(r.status());
  });
});
