/**
 * 🏁 Live Challenge load test (Games Part 1), in memory: one room, N simulated students (default 30) with live
 * streams, Q questions (default 20). Every student answers every question; the host board is pushed (coalesced)
 * and every student gets the phase views — exactly what the SSE route sends. Reports CPU time, memory and bytes.
 *
 *   npx tsx scripts/load/live-challenge-load.ts [students=30] [questions=20] [rooms=1]
 *
 * The 512 MB / 0.5 CPU Render plan: the numbers below are this process's own CPU time (one core), so on half a
 * core the wall time roughly doubles — the per-answer cost is what matters.
 */
import { createRoom, joinRoom, hostAct, answer, subscribe, flush, resetRooms, type RoomSlot, type RoomItem } from "../../src/server/game/rooms";
import type { PracticeItem } from "../../src/server/practice/items";

const N = Number(process.argv[2] ?? 30), Q = Number(process.argv[3] ?? 20), ROOMS = Number(process.argv[4] ?? 1);

function item(i: number): RoomItem {
  const it = {
    questionId: `q${i}`, ref: `q${i}`, grade: 4, family: "", skillKey: `skill${i % 3}`, standard: "", level: 4, type: "MULTIPLE_CHOICE", stem: `Question ${i}: which word is a verb in “The dog runs fast”?`,
    passage: null, subskill: null, explanation: { whyCorrect: "Runs is an action.", tip: "" }, estimatedSeconds: 30, irt: { a: 1, b: 0, c: 0.25 },
    options: ["dog", "runs", "fast", "the"].map((text, k) => ({ label: "ABCD"[k], text, correct: k === 1, rationale: null, misconception: null })),
    passageText: null, passageTitle: null, hint: null, image: null,
  } as unknown as PracticeItem;
  return { item: it, view: { type: "MULTIPLE_CHOICE", stem: it.stem, passage: null, options: it.options!.map((o) => ({ label: o.label, text: o.text })) }, right: "B" };
}

const mb = (n: number) => Math.round((n / 1048576) * 10) / 10;
async function main() {
  global.gc?.();
  const mem0 = process.memoryUsage();
  const cpu0 = process.cpuUsage();
  const t0 = performance.now();
  let bytes = 0, messages = 0, answers = 0;
  for (let r = 0; r < ROOMS; r++) {
    const slots: RoomSlot[] = Array.from({ length: Q }, (_, i) => { const x = item(i); return { skillId: `skill${i % 3}`, skillName: `Skill ${i % 3}`, byLevel: { BELOW: x, ON: x, ABOVE: x } }; });
    const room = createRoom({ id: `load${r}`, code: String(100000 + r), schoolId: "s", classId: "c", className: "4A", hostUserId: "t", title: "Load", mode: "quiz-race", seconds: 20, levelMode: "SAME", slots, expected: N });
    const sink = (j: string) => { bytes += j.length; messages++; };
    subscribe(room, { kind: "host", send: sink });
    for (let s = 0; s < N; s++) { joinRoom(room, { studentId: `st${s}`, displayName: `Student${s} Test`, level: "ON" }); subscribe(room, { kind: "player", studentId: `st${s}`, send: sink }); }
    bytes += flush(room);
    let now = Date.now();
    hostAct(room, "start", now); bytes += flush(room, now);
    for (let q = 0; q < Q; q++) {
      for (let s = 0; s < N; s++) {
        now += 200 + (s % 7) * 50;
        answer(room, `st${s}`, q, (s + q) % 3 === 0 ? "A" : "B", now); answers++;
        if (s % 4 === 3) bytes += flush(room, now);   // the 120 ms coalescing: a few answers per push
      }
      bytes += flush(room, now);
      hostAct(room, "next", now + 1000); bytes += flush(room, now + 1000);
      now += 2000;
    }
  }
  const ms = performance.now() - t0;
  const cpu = process.cpuUsage(cpu0);
  const mem1 = process.memoryUsage();
  const out = {
    rooms: ROOMS, students: N, questions: Q, answers, pushes: messages, kbPushed: Math.round(bytes / 1024),
    avgPushBytes: Math.round(bytes / Math.max(1, messages)),
    wallMs: Math.round(ms), cpuMs: Math.round((cpu.user + cpu.system) / 1000), cpuMsPerAnswer: Math.round(((cpu.user + cpu.system) / 1000 / answers) * 100) / 100,
    heapMB: mb(mem1.heapUsed), heapGrowthMB: mb(mem1.heapUsed - mem0.heapUsed), rssMB: mb(mem1.rss),
  };
  console.log(JSON.stringify(out, null, 2));
  resetRooms();
}
void main();
