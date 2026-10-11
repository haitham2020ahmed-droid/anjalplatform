/**
 * 🎲 The game framework's shared types (Games Part 1). No React and no server code here, so the registry, the
 * server's question provider and every game's browser code can all import it.
 *
 * HOW TO ADD A GAME (Part 2 — one folder per game, no shared file to edit):
 *   src/games/<id>/meta.ts  → `export const meta: GameMeta = {...}`  (set `ready: true` when the game works)
 *   src/games/<id>/game.tsx → `export default function MyGame(props: GameProps)` (solo, lazy-loaded)
 *                             and optionally `export function LivePad(props: LivePadProps)` (the student's device in a
 *                             Live Challenge; without it the shared answer tiles are used).
 * The registry (registry.ts) and the lazy loaders (loaders.ts) already list all 10 ids.
 */

/** The 10 games' ids (fixed list so ten folders can be built in parallel). */
export const GAME_IDS = ["quiz-race", "match-it", "word-builder", "word-guess", "word-pop", "lane-runner", "mystery-chest", "castle-guard", "rocket-race", "team-tug"] as const;
export type GameId = (typeof GAME_IDS)[number];
export const isGameId = (v: unknown): v is GameId => typeof v === "string" && (GAME_IDS as readonly string[]).includes(v);

/** Question-bank type codes a game can use (QuestionType.code). */
export type BankType = "MULTIPLE_CHOICE" | "TRUE_FALSE" | "MATCHING" | "WORD_ORDER" | "SENTENCE_ORDER" | "FILL_BLANK" | "MULTI_SELECT" | "DROPDOWN";

/** The student's practice level (never shown by name to the student). */
export type PlayLevel = "BELOW" | "ON" | "ABOVE";

export interface GameMeta {
  id: GameId;
  /** English interface name (translated through t()) */
  name: string;
  /** a small emoji/glyph shown in a coloured square */
  icon: string;
  /** Tailwind classes of the icon square (background + text) */
  color: string;
  /** one short line (English interface string, translated through t()) */
  line: string;
  /** the bank question types this game can use */
  types: BankType[];
  /** optional finer check on a filled question (e.g. Word Guess: a one-word answer) */
  fits?: (q: PlayQuestion) => boolean;
  /** a skill needs at least this many fitting questions, otherwise the game shows "Soon" */
  minQuestions: number;
  /** questions served in one solo round (rounds last 2–3 minutes) */
  roundSize: number;
  /** solo round length in seconds (120–180) */
  roundSeconds: number;
  /** false until the game is built: it shows "Soon" everywhere */
  ready: boolean;
  /** can be chosen as a Live Challenge mode */
  live: boolean;
}

/**
 * One question as a game receives it — filled automatically from the bank (never copied or stored). Solo games
 * check answers in the browser, so the key is included; Live Challenge devices never get it (LiveQuestionView).
 */
export interface PlayQuestion {
  id: string;
  skillId: string;
  type: BankType;
  stem: string;
  /** difficulty 1–7 (Below 1–3, On 4, Above 5–7) */
  level: number;
  passage: { title: string; text: string } | null;
  /** MULTIPLE_CHOICE / MULTI_SELECT / DROPDOWN, and TRUE_FALSE as two options "true" / "false" */
  options?: { label: string; text: string; correct: boolean }[];
  /** TRUE_FALSE */
  answer?: boolean;
  /** WORD_ORDER / SENTENCE_ORDER: the correct order */
  sequence?: string[];
  /** MATCHING */
  pairs?: { left: string; right: string }[];
  /** FILL_BLANK: accepted answers */
  answers?: string[];
  hint: string | null;
  /** why the answer is right (shown after a wrong answer) */
  explain: string | null;
}

// ------------------------------------------------------------------ power-ups

export const POWER_UPS = ["double", "time", "fifty", "shield", "hint"] as const;
export type PowerUpId = (typeof POWER_UPS)[number];

// ------------------------------------------------------------------ sounds

export type SoundName = "correct" | "wrong" | "tick" | "power" | "win" | "start";

// ------------------------------------------------------------------ the round API given to every solo game

export interface AnswerOutcome {
  correct: boolean;
  /** game points earned or lost by this answer (power-ups applied) */
  points: number;
  /** Shield stopped a point loss */
  shielded: boolean;
  doubled: boolean;
}

export interface PowerEffect {
  /** 50/50: option labels to hide */
  hide?: string[];
  /** Hint: a short clue */
  hint?: string;
  /** Extra Time: seconds added to the round clock */
  extraSeconds?: number;
}

export interface RoundApi {
  /** seconds left in the whole round (2–3 minutes) */
  secondsLeft: number;
  points: number;
  streak: number;
  correct: number;
  incorrect: number;
  /** how many of each power-up are left (one each per round) */
  powerLeft: Record<PowerUpId, number>;
  /** power-ups armed for the next answer (Double Points, Shield) */
  armed: PowerUpId[];
  /** use a power-up for the question on screen; null when none is left or it does not apply */
  activate(id: PowerUpId, q: PlayQuestion): PowerEffect | null;
  /**
   * Record one answer. `speed` 0–1 (1 = instant) adds a small speed bonus. Correct/incorrect is what the result
   * row keeps; points are game points only.
   */
  answer(q: PlayQuestion, correct: boolean, opts?: { speed?: number }): AnswerOutcome;
  /** end the round now (all questions done) */
  finish(): void;
  /**
   * Add (or take away) game points outside an answer — e.g. a Mystery Chest prize. Points only: correct / incorrect
   * never change; the round's points never go below 0. Optional so hand-made test rounds need not provide it.
   */
  bonus?(points: number): void;
  sound(name: SoundName): void;
  /** a small confetti burst */
  celebrate(): void;
  /** true once the round is over (time up or finish()) */
  over: boolean;
}

/** Props of a game's default export (solo play). */
export interface GameProps {
  questions: PlayQuestion[];
  skillName: string;
  /** the student's level for this skill (e.g. the speed of computer opponents) */
  level: PlayLevel;
  round: RoundApi;
}

// ------------------------------------------------------------------ Live Challenge (device)

/** What a student's device gets for the current question (no answer key). */
export interface LiveQuestionView {
  index: number;
  total: number;
  skillName: string;
  type: BankType;
  stem: string;
  passage: { title: string; text: string } | null;
  options?: { label: string; text: string }[];
  elements?: string[];
  left?: string[];
  right?: string[];
}

/** Props of a game's optional `LivePad` export (the student's device in a Live Challenge). */
export interface LivePadProps {
  question: LiveQuestionView;
  /** labels removed by 50/50 */
  hidden: string[];
  disabled: boolean;
  submit(response: unknown): void;
  /** Team Tug: the student's team ("A" = Red, "B" = Blue), when the mode has teams */
  team?: "A" | "B" | null;
}

// ------------------------------------------------------------------ Live Challenge: board, teams, chests, projector
// (Games integration — see LIVE_FEATURES in ./live-features.ts and the hook notes at the top of rooms.ts)

/** A student's code-drawn avatar (same shape as src/lib/avatar.ts AvatarConfig; browser-safe). */
export interface LiveAvatar { base: string; color: string; hat: string | null; glasses: string | null }

/** One row of the Live Board (top 8). `avatar` / `badge` = the student's avatar and favorite badge emblem. */
export interface LiveBoardRow {
  name: string; points: number; rank: number; move: number; medal: "gold" | "silver" | "bronze" | null;
  avatar: LiveAvatar | null; badge: string | null; team: number | null;
}

/** Every player (lobby, rockets on the projector): small rows. */
export interface LiveRacer { name: string; points: number; rank: number; avatar: LiveAvatar | null; badge: string | null; team: number | null }

/** A team (Team Tug). Team points = the AVERAGE of its members' game points, so a team one player short is not behind. */
export interface LiveTeam { id: number; name: string; color: string; members: number; total: number; points: number }

/** Something that happened on the board: a chest opened (bonus, double points, points taken from a classmate). */
export interface LiveEvent { kind: ChestPrize; name: string; other: string | null; points: number; at: number }

/** Mystery Chest: what a chest held. */
export type ChestPrize = "bonus" | "double" | "steal";
export interface ChestResult { pick: number; prize: ChestPrize; points: number; from: string | null }

/** Extra live behaviour a game mode switches on (live-features.ts). */
export interface LiveFeatures {
  /** after a right answer the student opens 1 of 3 chests (bonus / double / take points from a classmate) */
  chest?: boolean;
  /** two teams, balanced by level when the game starts; team points on the board and the devices */
  teams?: boolean;
  /** the projector gets EVERY player (rockets by points), not only the top 8 */
  field?: boolean;
}

/** What a game's optional `ProjectorView` gets (the teacher's projector, in place of the default Live Board). */
export interface ProjectorState {
  mode: GameId; status: "LOBBY" | "QUESTION" | "REVEAL" | "FINISHED"; paused: boolean; index: number; total: number;
  /** top 8 */
  board: LiveBoardRow[];
  /** every player, best first — only for modes with `field` */
  field: LiveRacer[] | null;
  /** only for modes with `teams` */
  teams: LiveTeam[] | null;
  /** -1 (team 0 wins the tug) … 0 … 1 (team 1 wins) */
  rope: number | null;
  /** newest first (at most 5) */
  events: LiveEvent[];
  /** the best score so far (to scale rockets / bars) */
  top: number;
}
/**
 * The same data in the flat shape G2C's projector views read (`ProjectorFeed` in rocket-race/live.ts): every player as
 * `racers` with the team as "A" / "B".
 */
export interface ProjectorFeedCompat {
  status: string; index: number; total: number; board: LiveBoardRow[];
  racers: { name: string; points: number; rank: number; team?: "A" | "B" }[];
}
export interface ProjectorViewProps { state: ProjectorState; feed: ProjectorFeedCompat; t: (s: string, vars?: Record<string, string | number>) => string }

/** Props of a game's optional `LiveChest` export (the chest picker on the student's device). */
export interface LiveChestProps { opened: ChestResult | null; busy: boolean; open(pick: number): void; t: ProjectorViewProps["t"] }
