import { expect, test } from "@playwright/test";
import { login, USERS } from "./helpers";

const stamp = Date.now().toString(36);

test.describe("administration", () => {
  test("admin creates a student; the temporary password is shown once and forces a change", async ({ page, browser }) => {
    await login(page, USERS.admin);
    await page.goto("/admin/users");
    await page.getByLabel("Role").first().selectOption("STUDENT");
    await page.getByLabel("Username").fill(`e2e.${stamp}`);
    await page.getByLabel("Full name").fill("E2E Student");
    await page.getByLabel("Student number").fill(`E2E-${stamp}`);
    await page.getByRole("button", { name: "Create account" }).click();
    const temp = (await page.locator("code").first().textContent())!.trim();
    expect(temp).toMatch(/^\w+-\w+-\d{4}$/);
    const fresh = await browser.newPage();
    await fresh.goto("/login");
    await fresh.getByLabel("Username").fill(`e2e.${stamp}`);
    await fresh.getByLabel("Password").fill(temp);
    await fresh.getByRole("button", { name: "Sign in" }).click();
    await expect(fresh).toHaveURL(/change-password/);
    await fresh.close();
  });

  test("question workflow: teacher drafts, cannot self-approve; admin publishes", async ({ page, browser }) => {
    await login(page, USERS.teacher);
    await page.goto("/admin/questions/new");
    await page.getByLabel("Question").fill(`E2E ${stamp}: What lesson does the character learn?`);
    const options = page.getByPlaceholder(/Option [ABC]/);
    await options.nth(0).fill("Honesty matters");
    await options.nth(1).fill("The farm is big");
    await options.nth(2).fill("It rained");
    await page.getByPlaceholder("Why is this wrong?").nth(0).fill("A detail, not a lesson.");
    await page.getByPlaceholder("Why is this wrong?").nth(1).fill("The setting, not a lesson.");
    await page.getByLabel(/Why the answer is correct/).fill("The character learns to tell the truth.");
    await page.getByRole("button", { name: "Create draft" }).click();
    await expect(page).toHaveURL(/\/admin\/questions\/(?!new)/);
    await page.getByRole("button", { name: "Send for review" }).click();
    await expect(page.getByText("Waiting for a reviewer")).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve and publish" })).toHaveCount(0);
    const url = page.url();

    const admin = await browser.newPage();
    await login(admin, USERS.admin);
    await admin.goto(url);
    await admin.getByRole("button", { name: "Approve and publish" }).click();
    await expect(admin.getByText("Status:")).toContainText("published");
    await admin.close();
  });

  test("settings: Arabic school name is saved for reports", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto("/admin/settings");
    await page.getByLabel("School name (Arabic)").fill("مدرسة العرض التجريبية");
    await page.getByRole("button", { name: "Save branding" }).click();
    await expect(page.getByText("Branding saved.")).toBeVisible();
  });

  test("roster import refuses a file with problems and writes nothing", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto("/admin/roster");
    await page.locator('input[type="file"]').setInputFiles({ name: "bad.csv", mimeType: "text/csv", buffer: Buffer.from("role,username,display_name,student_number,grade\nSTUDENT,e2e.bad,Bad,1,99\n") });
    await page.getByRole("button", { name: "Check the file" }).click();
    await expect(page.getByText(/1 problem/)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Import/ })).toHaveCount(0);
  });
});
