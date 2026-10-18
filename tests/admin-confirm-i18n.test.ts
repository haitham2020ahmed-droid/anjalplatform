import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { en, ar, missingTranslations, t } from "../src/i18n/admin-confirm";

describe("admin confirmation wording (src/i18n/admin-confirm.ts)", () => {
  test("every English key has a non-empty Arabic translation", () => {
    assert.deepEqual(missingTranslations(), []);
    assert.deepEqual(Object.keys(ar).sort(), Object.keys(en).sort());
  });

  test("the bulk-delete confirmations say what is deleted and that it cannot be undone", () => {
    const en5 = t("en", "bulkDelete.flags.confirm", { count: 5 });
    assert.match(en5, /5/);
    assert.match(en5, /cannot be undone/i);
    assert.match(t("en", "bulkDelete.roster.warning"), /cannot be undone/i);
    assert.match(t("en", "bulkDelete.roster.warning"), /ALL students/);
    const ar5 = t("ar", "bulkDelete.flags.confirm", { count: 5 });
    assert.match(ar5, /5/);
    assert.ok(ar5.length > 10);
  });

  test("{placeholder} substitution leaves unknown placeholders untouched", () => {
    assert.equal(t("en", "bulkDelete.flags.confirm", {}), en["bulkDelete.flags.confirm"]);
  });
});
