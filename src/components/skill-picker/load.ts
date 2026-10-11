"use client";
import { useEffect, useState } from "react";
import { listSkillQuestionsForTeacherAction } from "@/server/questions/skill-picker-actions";
import { toPickerQuestions, type PickerQuestion } from "./helpers";

/** How many questions of a skill the picker reads at once (filters and search then work in the browser). */
export const LOAD_LIMIT = 200;
const CACHE_SIZE = 12;
const cache = new Map<string, Promise<PickerQuestion[]>>();

/** The questions of one skill, read once per page (the picker and the student preview share the read). */
export function loadSkillQuestions(skillId: string): Promise<PickerQuestion[]> {
  const hit = cache.get(skillId);
  if (hit) return hit;
  const p = listSkillQuestionsForTeacherAction(skillId, { limit: LOAD_LIMIT }).then(toPickerQuestions);
  p.catch(() => cache.delete(skillId));
  cache.set(skillId, p);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string);
  return p;
}

/** Reads the skill's questions only when `on` (lazy: nothing is read until the list is opened). */
export function useSkillQuestions(skillId: string, on: boolean): { list: PickerQuestion[] | null; failed: boolean } {
  const [state, setState] = useState<{ id: string; list: PickerQuestion[] | null; failed: boolean }>({ id: skillId, list: null, failed: false });
  useEffect(() => {
    if (!on || !skillId) return;
    let live = true;
    loadSkillQuestions(skillId).then((list) => { if (live) setState({ id: skillId, list, failed: false }); }, () => { if (live) setState({ id: skillId, list: null, failed: true }); });
    return () => { live = false; };
  }, [skillId, on]);
  return state.id === skillId ? { list: state.list, failed: state.failed } : { list: null, failed: false };
}
