import { expect, test } from "@playwright/test";
import { login, USERS } from "./helpers";

test.describe("parent", () => {
  test("a parent sees their child and downloads the Arabic report", async ({ page }) => {
    await login(page, USERS.parent);
    await expect(page.getByRole("heading", { name: "My children" })).toBeVisible();
    const href = await page.locator('a[href*="kind=student"][href*="lang=ar"][href*="format=pdf"]').first().getAttribute("href");
    const res = await page.request.get(href!);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("application/pdf");
  });

  test("a parent cannot download another child's report or any class report", async ({ page }) => {
    await login(page, USERS.parent);
    const href = (await page.locator('a[href*="kind=student"]').first().getAttribute("href"))!;
    const tampered = href.replace(/studentId=[^&]+/, "studentId=someone-else");
    expect((await page.request.get(tampered)).status()).toBe(404);
    expect((await page.request.get("/api/reports?kind=school&format=csv")).status()).toBe(404);
  });
});
