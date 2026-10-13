import { cookies } from "next/headers";
import { cache } from "react";
import { THEME_COOKIE, toTheme, type Theme } from "@/lib/theme";

/** This request's look (day | night | system) from the device's lr-theme cookie; day when unknown or outside a request. */
export const getTheme = cache(async (): Promise<Theme> => {
  try { return toTheme((await cookies()).get(THEME_COOKIE)?.value); } catch { return "day"; }
});
