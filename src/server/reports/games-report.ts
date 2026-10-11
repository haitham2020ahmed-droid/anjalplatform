/**
 * 🎮 Live-game results (Update 39C, readiness I-23): the answers students give in live games (LiveGameAnswer), which
 * only the host's leaderboard showed before.
 *
 * Definitions
 *   games          finished or running live games of the class in the window (LiveGame.classId)
 *   participation  students of the class who joined ÷ students in the class (per game and overall)
 *   accuracy       correct ÷ careful answers — a rapid guess (faster than the engine's rapid line for the item, with
 *                  the game's seconds per question as the item's expected time, as in Update 39B) is left out
 *   rapid-guess %  rapid answers ÷ all answers
 *   skill          the question's skill (Question.skillId; a question still on the hidden skill shows as “Not classified yet”)
 *   most missed    questions with the lowest careful accuracy (2+ answers), with the most chosen wrong option
 */
import type { Repo, Row } from "../seeding/repo";
import type { Actor } from "../auth/rbac";
import { DEFAULT_ADAPTIVE } from "../../config/engine";
import { isRapidGuess } from "../../adaptive/evidence";
import { isHiddenSkill } from "../skills/master";
import { studentNames } from "../insights/student-data";
import { DAY, findIn, pct, reportClass, s, time } from "./report-access";

export interface GameAnswerRow { gameId: string; studentId: string; questionId: string; skillId: string | null; correct: boolean; rapid: boolean; choice: string; ms: number }
export interface GamesReport {
  classId: string; className: string; days: number;
  summary: { games: number; students: number; joined: number; participation: number | null; answers: number; accuracy: number | null; rapidPct: number | null };
  games: { id: string; title: string; date: string; status: string; questions: number; players: number; participation: number | null; answers: number; accuracy: number | null; rapidPct: number | null }[];
  skills: { skillId: string; name: string; answers: number; accuracy: number | null; rapidPct: number | null }[];
  students: { studentId: string; name: string; games: number; answers: number; accuracy: number | null; rapidPct: number | null; points: number }[];
  missed: { questionId: string; stem: string; skill: string; answers: number; accuracy: number | null; commonWrong: string | null }[];
}

const qList = (g: Row): string[] => { const v = g.questionIds; const arr = typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return []; } })() : v; return Array.isArray(arr) ? arr.map(String) : []; };

/** A class's live games over the last `days` days. */
export async function classGamesReport(repo: Repo, actor: Actor, classId: string, opts: { days?: number; now?: Date } = {}): Promise<GamesReport> {
  const now = opts.now ?? new Date(), days = opts.days ?? 30;
  const { klass, ids } = await reportClass(repo, actor, classId);
  const from = now.getTime() - days * DAY;
  const games = (await repo.findMany("LiveGame", { classId })).filter((g) => time(g.createdAt) >= from && s(g.status) !== "LOBBY").sort((a, b) => time(b.createdAt) - time(a.createdAt));
  const gameIds = games.map((g) => s(g.id));
  const players = gameIds.length ? await findIn(repo, "LiveGamePlayer", "gameId", gameIds) : [];
  const answers = gameIds.length ? await findIn(repo, "LiveGameAnswer", "gameId", gameIds) : [];
  const qids = [...new Set(games.flatMap(qList))];
  const questions = qids.length ? await findIn(repo, "Question", "id", qids, {}, ["id", "stem", "skillId", "estimatedSeconds"]) : [];
  const skillRows = questions.length ? await findIn(repo, "Skill", "id", [...new Set(questions.map((q) => s(q.skillId)))], {}, ["id", "name", "code"]) : [];
  const opts2 = qids.length ? await findIn(repo, "QuestionOption", "questionId", qids, {}, ["questionId", "label", "text"]) : [];
  const skillName = (id: string | null) => { const k = skillRows.find((x) => x.id === id); return k ? (isHiddenSkill(k.code) ? "Not classified yet" : s(k.name)) : "—"; };
  const memberSet = new Set(ids);
  // one row per answer, with the student and the question behind it
  const rows: GameAnswerRow[] = [];
  for (const a of answers) {
    const p = players.find((x) => x.id === a.playerId); if (!p) continue;
    const g = games.find((x) => x.id === a.gameId)!;
    const qid = qList(g)[Number(a.questionIndex)] ?? "";
    const q = questions.find((x) => x.id === qid);
    const expected = Math.min(Number(q?.estimatedSeconds) || 45, Number(g.secondsPerQuestion) || 20);
    rows.push({ gameId: s(g.id), studentId: s(p.studentId), questionId: qid, skillId: q ? s(q.skillId) : null, correct: Boolean(a.correct), rapid: isRapidGuess({ responseMs: Number(a.ms), estimatedSeconds: expected }, DEFAULT_ADAPTIVE), choice: s(a.choice), ms: Number(a.ms) });
  }
  const stat = (list: GameAnswerRow[]) => { const careful = list.filter((r) => !r.rapid); return { answers: list.length, accuracy: pct(careful.filter((r) => r.correct).length, careful.length), rapidPct: pct(list.filter((r) => r.rapid).length, list.length) }; };
  const names = await studentNames(repo, [...new Set([...ids, ...players.map((p) => s(p.studentId))])]);
  const joined = new Set(players.map((p) => s(p.studentId)).filter((id) => memberSet.has(id)));
  const gameRows = games.map((g) => {
    const ps = players.filter((p) => p.gameId === g.id);
    return { id: s(g.id), title: s(g.title), date: new Date(time(g.createdAt)).toISOString().slice(0, 10), status: s(g.status), questions: qList(g).length, players: ps.length, participation: pct(ps.filter((p) => memberSet.has(s(p.studentId))).length, ids.length), ...stat(rows.filter((r) => r.gameId === g.id)) };
  });
  const bySkill = new Map<string, GameAnswerRow[]>();
  for (const r of rows) { const k = r.skillId ?? ""; bySkill.set(k, [...(bySkill.get(k) ?? []), r]); }
  const skills = [...bySkill].map(([k, list]) => ({ skillId: k, name: skillName(k || null), ...stat(list) })).sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101) || a.name.localeCompare(b.name));
  const studentIds = [...new Set([...ids, ...players.map((p) => s(p.studentId))])];
  const students = studentIds.map((id) => {
    const ps = players.filter((p) => s(p.studentId) === id);
    return { studentId: id, name: names.get(id)?.name ?? "Student", games: ps.length, points: ps.reduce((t, p) => t + Number(p.score ?? 0), 0), ...stat(rows.filter((r) => r.studentId === id)) };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const byQ = new Map<string, GameAnswerRow[]>();
  for (const r of rows) if (r.questionId) byQ.set(r.questionId, [...(byQ.get(r.questionId) ?? []), r]);
  const missed = [...byQ].map(([qid, list]) => {
    const q = questions.find((x) => x.id === qid);
    const wrong = list.filter((r) => !r.correct && !r.rapid);
    const counts = new Map<string, number>(); for (const w of wrong) counts.set(w.choice, (counts.get(w.choice) ?? 0) + 1);
    const top = [...counts].sort((a, b) => b[1] - a[1])[0];
    const opt = top ? opts2.find((o) => o.questionId === qid && s(o.label) === top[0]) : undefined;
    return { questionId: qid, stem: s(q?.stem).slice(0, 160), skill: skillName(q ? s(q.skillId) : null), ...stat(list), commonWrong: top ? `${top[0]}${opt ? `: ${s(opt.text).slice(0, 80)}` : ""} (${top[1]})` : null };
  }).filter((m) => m.answers >= 2 && m.accuracy !== null).sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0) || b.answers - a.answers).slice(0, 10);
  const all = stat(rows);
  return {
    classId, className: s(klass.name), days,
    summary: { games: games.length, students: ids.length, joined: joined.size, participation: pct(joined.size, ids.length), answers: all.answers, accuracy: all.accuracy, rapidPct: all.rapidPct },
    games: gameRows, skills, students, missed,
  };
}
