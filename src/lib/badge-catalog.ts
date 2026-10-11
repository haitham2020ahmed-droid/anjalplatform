/**
 * 🏅 The badge list (pure data, safe in the browser): every badge a student can earn, what it counts, the target,
 * the colour of its emblem and the avatar item it unlocks (Games Part 3). Earning is worked out on the server only
 * (src/server/student/badges.ts) from the student's own records — nothing here can be claimed from the browser.
 */
export type BadgeMetric =
  | "correct" | "mastered" | "tasks" | "levelUps" | "streak" | "articles" | "writing" | "growth" | "words" | "practiceTests"
  // Games Part 3
  | "rrArticles" | "grammarMastered" | "liveWins" | "liveGames" | "qotdCorrect" | "qotdAnswered" | "plans" | "coinsEarned";

export interface BadgeDef {
  code: string; icon: string; name: string; description: string; metric: BadgeMetric; target: number;
  /** emblem ring colour */
  tint?: string;
  /** avatar shop item code this badge unlocks (free, no coins) */
  unlocks?: string;
}

export const BADGES: BadgeDef[] = [
  { code: "first-steps", icon: "👣", name: "First Steps", description: "Answer 10 questions correctly.", metric: "correct", target: 10, tint: "#38bdf8" },
  { code: "sharp-shooter", icon: "🎯", name: "Sharp Shooter", description: "Answer 100 questions correctly.", metric: "correct", target: 100, tint: "#f43f5e" },
  { code: "super-brain", icon: "🧠", name: "Super Brain", description: "Answer 500 questions correctly.", metric: "correct", target: 500, tint: "#ec4899" },
  { code: "skill-master", icon: "⭐", name: "Skill Master", description: "Master your first skill.", metric: "mastered", target: 1, tint: "#f59e0b" },
  { code: "skill-star", icon: "🌟", name: "Skill Star", description: "Master 5 skills.", metric: "mastered", target: 5, tint: "#eab308" },
  { code: "skill-champion", icon: "🏆", name: "Skill Champion", description: "Master 15 skills.", metric: "mastered", target: 15, tint: "#ca8a04" },
  { code: "task-finisher", icon: "✅", name: "Task Finisher", description: "Finish your first task from your teacher.", metric: "tasks", target: 1, tint: "#10b981" },
  { code: "hard-worker", icon: "💪", name: "Hard Worker", description: "Finish 10 tasks from your teacher.", metric: "tasks", target: 10, tint: "#059669" },
  { code: "level-up", icon: "🚀", name: "Level Up!", description: "Move up a level by your answers.", metric: "levelUps", target: 1, tint: "#6366f1", unlocks: "phoenix" },
  { code: "rocket", icon: "🌠", name: "Rocket", description: "Move up a level 5 times.", metric: "levelUps", target: 5, tint: "#4f46e5" },
  { code: "on-fire", icon: "🔥", name: "On Fire", description: "Practise 3 days in a row.", metric: "streak", target: 3, tint: "#f97316" },
  { code: "unstoppable", icon: "⚡", name: "Unstoppable", description: "Practise 7 days in a row.", metric: "streak", target: 7, tint: "#ea580c" },
  { code: "bookworm", icon: "📚", name: "Bookworm", description: "Finish 5 ReadMaster articles.", metric: "articles", target: 5, tint: "#0ea5e9" },
  { code: "writer", icon: "✍️", name: "Writer", description: "Finish 3 Respond to Reading answers in your book.", metric: "writing", target: 3, tint: "#8b5cf6" },
  { code: "growing", icon: "📈", name: "Growing", description: "Grow 3 RIT points since your Fall MAP.", metric: "growth", target: 3, tint: "#22c55e" },
  { code: "band-up", icon: "🚀", name: "Band Up!", description: "Grow 10 RIT points since your Fall MAP: a whole band higher.", metric: "growth", target: 10, tint: "#16a34a" },
  { code: "word-collector", icon: "📒", name: "Word Collector", description: "Look up 20 new words in your readings.", metric: "words", target: 20, tint: "#14b8a6" },
  { code: "test-ready", icon: "🧭", name: "Test Ready", description: "Finish a MAP practice test.", metric: "practiceTests", target: 1, tint: "#0891b2" },
  // ---- Games Part 3
  { code: "reading-star", icon: "📖", name: "Reading Star", description: "Finish 10 ReadRise articles.", metric: "rrArticles", target: 10, tint: "#0284c7", unlocks: "moon-whale" },
  { code: "grammar-master", icon: "🔤", name: "Grammar Master", description: "Master 5 grammar skills.", metric: "grammarMastered", target: 5, tint: "#7c3aed", unlocks: "dragon" },
  { code: "game-champion", icon: "🥇", name: "Game Champion", description: "Win a Live Challenge.", metric: "liveWins", target: 1, tint: "#d97706", unlocks: "crown" },
  { code: "team-player", icon: "🤝", name: "Team Player", description: "Take part in 5 Live Challenges.", metric: "liveGames", target: 5, tint: "#0d9488" },
  { code: "quiz-whiz", icon: "💡", name: "Quiz Whiz", description: "Get 10 Questions of the Day right.", metric: "qotdCorrect", target: 10, tint: "#facc15", unlocks: "gold" },
  { code: "daily-thinker", icon: "☀️", name: "Daily Thinker", description: "Answer 5 Questions of the Day.", metric: "qotdAnswered", target: 5, tint: "#fb923c" },
  { code: "plan-finisher", icon: "🗂️", name: "Plan Finisher", description: "Finish every part of a plan.", metric: "plans", target: 1, tint: "#2563eb", unlocks: "star-glasses" },
  { code: "coin-collector", icon: "🪙", name: "Coin Collector", description: "Earn 300 coins.", metric: "coinsEarned", target: 300, tint: "#b45309" },
];

export const badgeByCode = (code: string | null | undefined): BadgeDef | null => (code ? BADGES.find((b) => b.code === code) ?? null : null);
/** shop item → the badge that unlocks it */
export const UNLOCKED_BY: Record<string, string> = Object.fromEntries(BADGES.filter((b) => b.unlocks).map((b) => [b.unlocks!, b.code]));
