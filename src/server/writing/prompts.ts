/**
 * 💡 Writing prompt ideas (Grades 4–6): a library of genre-specific prompts a teacher can start a new 📝 genre
 * writing task from (see src/server/teacher/writing.ts createTask and src/app/teacher/writing/page.tsx). Picking
 * an idea only fills the task's title, genre and prompt text — the same fields a teacher fills by hand — so every
 * idea flows through the normal rubric (GENRE_RUBRICS), self-check (CHECKLISTS), plan organizer (ORGANIZERS) and
 * revision-move pipeline in ./genres.ts untouched. This file is pure content: no new type, no schema change.
 *
 * All wording is original to this platform. Picked for Grade 4–6 Arabic-speaking EFL learners in Egypt: concrete
 * and close to daily life in Grade 4, a little more nuanced by Grade 6. Each idea gives a clear task + audience /
 * purpose, matching the tone of the platform's own examples ("Write about a hero.", "Tell a story about a trip.").
 */
import { type Genre } from "./genres";

export interface PromptIdea { id: string; genre: Exclude<Genre, "FREE">; grade: 4 | 5 | 6; title: string; prompt: string }

const P = (genre: Exclude<Genre, "FREE">, grade: 4 | 5 | 6, n: number, title: string, prompt: string): PromptIdea => ({ id: `${genre.toLowerCase()}-g${grade}-${String(n).padStart(2, "0")}`, genre, grade, title, prompt });

// ------------------------------------------------------------------ NARRATIVE (a story)

const NARRATIVE: PromptIdea[] = [
  P("NARRATIVE", 4, 1, "A time I helped without being asked", "Tell a story about a time you noticed someone needed help and you helped them without being asked. Show how you felt before and after."),
  P("NARRATIVE", 4, 2, "Trying something new", "Tell a story about the first time you tried something new (a sport, a food, a game). Was it easier or harder than you expected?"),
  P("NARRATIVE", 4, 3, "A surprise that changed my day", "Tell a story about a day that started ordinary but had a surprise in it. What happened, and how did the surprise change your day?"),
  P("NARRATIVE", 4, 4, "Lost and found my way", "Tell a story about a time you got lost (in a mall, a new place, or even in a book's instructions) and found your way again."),
  P("NARRATIVE", 4, 5, "The best part of a school trip", "Tell a story about the best moment of a school trip or class outing you remember. Make the reader feel like they were there with you."),
  P("NARRATIVE", 4, 6, "An animal surprised me", "Tell a story about a time an animal — a pet or one you saw outside — did something that surprised you."),
  P("NARRATIVE", 4, 7, "Fixing my mistake", "Tell a story about a time you made a mistake and then did something to fix it. How did you feel at each part of the story?"),
  P("NARRATIVE", 4, 8, "A family celebration", "Tell a story about a time your family celebrated something together (a birthday, a holiday, good news). Describe the people, the place and what happened."),
  P("NARRATIVE", 5, 1, "A hard choice", "Tell a story about a time you had to choose between two things and it was not easy. What did you choose, and why?"),
  P("NARRATIVE", 5, 2, "Facing a fear", "Tell a story about a time you were afraid of something and found the courage to face it anyway. Show your feelings before, during and after."),
  P("NARRATIVE", 5, 3, "A friendship that was tested", "Tell a story about a time a friendship had a problem and how you and your friend worked it out (or did not)."),
  P("NARRATIVE", 5, 4, "Teaching someone a skill", "Tell a story about a time you taught a younger student, sibling or friend something you know how to do well."),
  P("NARRATIVE", 5, 5, "When the weather changed everything", "Tell a story about a day when the weather (rain, heat, wind, a sandstorm) changed your plans completely."),
  P("NARRATIVE", 5, 6, "Waiting for something", "Tell a story about a time you had to wait a long time for something you really wanted. How did the waiting feel, and was it worth it?"),
  P("NARRATIVE", 5, 7, "Helping two people make peace", "Tell a story about a time you helped solve a disagreement between two friends or family members."),
  P("NARRATIVE", 5, 8, "Discovering my neighborhood", "Tell a story about a day you discovered something new about your neighborhood or city that you had never noticed before."),
  P("NARRATIVE", 6, 1, "Changing my mind", "Tell a story about a time you changed your opinion about something or someone after you learned more. What changed your mind?"),
  P("NARRATIVE", 6, 2, "Standing up for someone", "Tell a story about a time you stood up for someone else, even though it was not easy to do."),
  P("NARRATIVE", 6, 3, "A consequence I didn't expect", "Tell a story about a choice you made that had a consequence you did not expect. What did you learn from it?"),
  P("NARRATIVE", 6, 4, "A moment I felt more grown up", "Tell a story about a moment that made you feel more responsible or more grown up than before."),
  P("NARRATIVE", 6, 5, "Technology, for better or worse", "Tell a story about a time technology (a phone, an app, the internet) helped you — or caused a problem you had to solve."),
  P("NARRATIVE", 6, 6, "Working as a team", "Tell a story about a time you worked with a team toward a shared goal. What was your part, and how did it end?"),
  P("NARRATIVE", 6, 7, "When listening mattered more than talking", "Tell a story about a moment when listening carefully mattered more than anything you could have said."),
  P("NARRATIVE", 6, 8, "A turning point", "Tell a story about a moment that changed a friendship or a family relationship, for better or for worse."),
];

// ------------------------------------------------------------------ INFORMATIONAL (teach about a topic)

const INFORMATIONAL: PromptIdea[] = [
  P("INFORMATIONAL", 4, 1, "How bees help plants grow", "Teach the reader how bees help plants grow. Use facts and examples so a classmate who knows nothing about it can understand."),
  P("INFORMATIONAL", 4, 2, "How the pyramids were built", "Teach the reader how the ancient Egyptians built the pyramids. Explain the main steps and tools they used."),
  P("INFORMATIONAL", 4, 3, "Why we have day and night", "Teach the reader why we have day and night. Explain it so a younger student could understand it too."),
  P("INFORMATIONAL", 4, 4, "How a seed becomes a plant", "Teach the reader how a plant grows from a seed, step by step, from planting to a full-grown plant."),
  P("INFORMATIONAL", 4, 5, "Why the Nile matters to Egypt", "Teach the reader why the Nile River is important for Egypt and the people who live near it."),
  P("INFORMATIONAL", 4, 6, "How recycling helps our planet", "Teach the reader how recycling helps protect our planet. Give facts and examples of things people can recycle."),
  P("INFORMATIONAL", 4, 7, "Why sleep matters for your body", "Teach the reader why getting enough sleep is important for a growing body and mind."),
  P("INFORMATIONAL", 4, 8, "How animals stay warm in winter", "Teach the reader how different animals keep themselves warm when the weather turns cold."),
  P("INFORMATIONAL", 5, 1, "How the water cycle works", "Teach the reader how the water cycle works, from evaporation to rain and back again."),
  P("INFORMATIONAL", 5, 2, "Farming by the Nile", "Teach the reader how ancient Egyptians used the Nile River to farm and feed their people."),
  P("INFORMATIONAL", 5, 3, "Why some animals migrate", "Teach the reader why some animals travel long distances (migrate) at certain times of the year."),
  P("INFORMATIONAL", 5, 4, "How the human heart works", "Teach the reader how the human heart works and why it is important for the whole body."),
  P("INFORMATIONAL", 5, 5, "What causes earthquakes", "Teach the reader what causes earthquakes and why some places on Earth get more of them than others."),
  P("INFORMATIONAL", 5, 6, "How bridges stay strong", "Teach the reader how engineers design bridges so they stay strong and do not collapse."),
  P("INFORMATIONAL", 5, 7, "Why healthy eating matters", "Teach the reader why healthy eating matters for a growing student, with facts about different food groups."),
  P("INFORMATIONAL", 5, 8, "How bees talk to each other", "Teach the reader how bees communicate with other bees in their hive."),
  P("INFORMATIONAL", 6, 1, "How solar and wind energy work", "Teach the reader how solar panels or wind turbines turn nature into usable electricity."),
  P("INFORMATIONAL", 6, 2, "How hieroglyphics worked", "Teach the reader how ancient Egyptian hieroglyphic writing worked, and how experts later learned to read it."),
  P("INFORMATIONAL", 6, 3, "How vaccines protect the body", "Teach the reader how vaccines help the body protect itself from disease."),
  P("INFORMATIONAL", 6, 4, "What causes climate change", "Teach the reader what causes climate change and what effects it has on the planet."),
  P("INFORMATIONAL", 6, 5, "How the internet connects the world", "Teach the reader how the internet works and how it connects people and information around the world."),
  P("INFORMATIONAL", 6, 6, "How volcanoes form and erupt", "Teach the reader how volcanoes form underground and what causes them to erupt."),
  P("INFORMATIONAL", 6, 7, "How your body digests food", "Teach the reader how the digestive system breaks down the food we eat into energy the body can use."),
  P("INFORMATIONAL", 6, 8, "Ancient trade routes", "Teach the reader how ancient trade routes connected different civilizations and what they exchanged."),
];

// ------------------------------------------------------------------ OPINION (give reasons)

const OPINION: PromptIdea[] = [
  P("OPINION", 4, 1, "Homework every day?", "Should students have homework every day? Give your opinion and at least two reasons."),
  P("OPINION", 4, 2, "A longer recess", "Should schools give students a longer recess? Give your opinion and support it with reasons."),
  P("OPINION", 4, 3, "Choosing our own seats", "Should students be allowed to choose their own seats in class? Give your opinion and reasons."),
  P("OPINION", 4, 4, "Every student should learn to swim", "Should every student learn to swim at school? Give your opinion and support it with reasons."),
  P("OPINION", 4, 5, "A class pet", "Should every classroom have a class pet? Give your opinion and at least two reasons."),
  P("OPINION", 4, 6, "School uniforms", "Should students wear school uniforms? Give your opinion and support it with reasons."),
  P("OPINION", 4, 7, "Screens during breaks", "Should students be allowed to use screens (tablets, phones) during school breaks? Give your opinion and reasons."),
  P("OPINION", 4, 8, "A reading corner in every class", "Should every classroom have a reading corner with books and cushions? Give your opinion and reasons."),
  P("OPINION", 5, 1, "Choosing one extra subject", "Should students get to choose one extra subject to study? Give your opinion and support it with reasons."),
  P("OPINION", 5, 2, "Homework or projects?", "Should homework be replaced by after-school projects instead? Give your opinion and reasons."),
  P("OPINION", 5, 3, "A say in classroom rules", "Should students have a say in making their classroom's rules? Give your opinion and support it with reasons."),
  P("OPINION", 5, 4, "Book first or movie first?", "Is it better to read the book before watching the movie, or the other way around? Give your opinion and reasons."),
  P("OPINION", 5, 5, "Healthier school lunches", "Should school lunches include more fruits and vegetables? Give your opinion and support it with reasons."),
  P("OPINION", 5, 6, "A second chance on tests", "Should students be allowed to retake a test they did not pass? Give your opinion and reasons."),
  P("OPINION", 5, 7, "A school garden", "Should every school have a garden that students help take care of? Give your opinion and reasons."),
  P("OPINION", 5, 8, "More time for sports", "Should students get more time for PE and sports during the school day? Give your opinion and support it with reasons."),
  P("OPINION", 6, 1, "Phones for schoolwork", "Should students be allowed to use phones for schoolwork during class? Give your opinion and support it with reasons, and answer one reason someone might disagree."),
  P("OPINION", 6, 2, "Skills or memorizing facts?", "Should schools focus more on skills like coding and problem-solving than on memorizing facts? Give your opinion and reasons."),
  P("OPINION", 6, 3, "Group projects vs. individual tests", "Should a group project count the same as an individual test? Give your opinion and support it with reasons."),
  P("OPINION", 6, 4, "Social media: good or harm?", "Is social media doing more good than harm for students your age? Give your opinion and support it with reasons."),
  P("OPINION", 6, 5, "Students grading their own work", "Should students sometimes get to grade their own work before the teacher does? Give your opinion and reasons."),
  P("OPINION", 6, 6, "Starting school later", "Should schools start later in the morning? Give your opinion and support it with reasons."),
  P("OPINION", 6, 7, "Learning a second language", "Should every student be required to learn a second language? Give your opinion and support it with reasons."),
  P("OPINION", 6, 8, "Community service hours", "Should students be required to complete community service hours before graduating? Give your opinion and reasons."),
];

// ------------------------------------------------------------------ HOW_TO (explain the steps)

const HOW_TO: PromptIdea[] = [
  P("HOW_TO", 4, 1, "How to plant and care for a seed", "Explain how to plant a seed and take care of it so it grows well. List what is needed and the steps in order."),
  P("HOW_TO", 4, 2, "How to make a healthy sandwich", "Explain how to make a healthy sandwich, step by step, so someone who has never made one could follow along."),
  P("HOW_TO", 4, 3, "How to take care of a pet", "Explain how to take care of a pet (yours or one you know) so it stays healthy and happy."),
  P("HOW_TO", 4, 4, "How to organize a school bag", "Explain how to organize a school bag so everything has its place and is easy to find."),
  P("HOW_TO", 4, 5, "How to make a paper airplane", "Explain how to fold a paper airplane, step by step, so a classmate could make one too."),
  P("HOW_TO", 4, 6, "How to study for a spelling test", "Explain how you study for a spelling test, step by step, so a friend could try your method."),
  P("HOW_TO", 4, 7, "How to set up a clean study corner", "Explain how to set up a clean, quiet place at home for studying and doing homework."),
  P("HOW_TO", 4, 8, "How to brush your teeth properly", "Explain the right steps to brush your teeth so they stay healthy."),
  P("HOW_TO", 5, 1, "How to make a simple dish", "Explain how to make your favorite simple dish with an adult's help, step by step."),
  P("HOW_TO", 5, 2, "How to study with flashcards", "Explain how to make and use flashcards to study for a test."),
  P("HOW_TO", 5, 3, "How to keep your room organized", "Explain how to keep your room organized so it stays neat week after week."),
  P("HOW_TO", 5, 4, "How to plan a small birthday party", "Explain how to plan a small birthday party, from choosing a date to the day itself."),
  P("HOW_TO", 5, 5, "How to make a simple craft gift", "Explain how to make a simple handmade gift for a friend or family member, step by step."),
  P("HOW_TO", 5, 6, "How to teach a pet a new trick", "Explain how to train a pet to learn a new, simple trick."),
  P("HOW_TO", 5, 7, "How to plan a weekend outing", "Explain how to plan a fun weekend outing for your family, step by step."),
  P("HOW_TO", 5, 8, "How to set a weekly homework schedule", "Explain how to set up a weekly schedule so homework gets done on time."),
  P("HOW_TO", 6, 1, "How to write a strong paragraph", "Explain how to write a strong paragraph, step by step, so another student could use your method."),
  P("HOW_TO", 6, 2, "How to prepare for a class presentation", "Explain how to prepare for a class presentation, from choosing the topic to the day you present."),
  P("HOW_TO", 6, 3, "How to cook a simple meal", "Explain how to plan and cook a simple meal for your family, step by step."),
  P("HOW_TO", 6, 4, "How to manage exam week", "Explain how to manage your time during exam week so you are ready for every subject."),
  P("HOW_TO", 6, 5, "How to start a small hobby project", "Explain how to start a small hobby project (growing herbs, building something, starting a collection), step by step."),
  P("HOW_TO", 6, 6, "How to organize a study group", "Explain how to organize a study group with classmates so everyone benefits."),
  P("HOW_TO", 6, 7, "How to budget your allowance", "Explain how to make a simple budget for your allowance or pocket money."),
  P("HOW_TO", 6, 8, "How to research safely online", "Explain how to safely and carefully use the internet to research a school topic."),
];

// ------------------------------------------------------------------ RESEARCH (use sources)

const RESEARCH: PromptIdea[] = [
  P("RESEARCH", 4, 1, "Why camels survive the desert", "Using the sources, explain why camels survive so well in the desert."),
  P("RESEARCH", 4, 2, "Egyptian inventions that affect us today", "Using the sources, explain how one ancient Egyptian invention still affects our lives today."),
  P("RESEARCH", 4, 3, "Why the Nile matters to Egypt", "Using the sources, explain why the Nile River is so important for Egypt."),
  P("RESEARCH", 4, 4, "How bees help the environment", "Using the sources, explain how bees help the environment."),
  P("RESEARCH", 4, 5, "What makes volcanoes erupt", "Using the sources, explain what makes volcanoes erupt."),
  P("RESEARCH", 4, 6, "Why some animals hibernate", "Using the sources, explain why some animals hibernate during winter."),
  P("RESEARCH", 4, 7, "How recycling protects the environment", "Using the sources, explain how recycling helps protect the environment."),
  P("RESEARCH", 4, 8, "What makes a healthy diet for kids", "Using the sources, explain what makes a healthy diet for a student your age."),
  P("RESEARCH", 5, 1, "How the pyramids were built without modern machines", "Using the sources, explain how ancient Egyptian builders built the pyramids without modern machines."),
  P("RESEARCH", 5, 2, "Why earthquakes happen more in some places", "Using the sources, explain why earthquakes happen more often in certain places on Earth."),
  P("RESEARCH", 5, 3, "How the body uses the food we eat", "Using the sources, explain how the human body uses the food we eat for energy."),
  P("RESEARCH", 5, 4, "Why rainforests matter to the whole planet", "Using the sources, explain why rainforests are important for the whole planet, not just the places where they grow."),
  P("RESEARCH", 5, 5, "How astronauts live and work in space", "Using the sources, explain how astronauts live and work in space."),
  P("RESEARCH", 5, 6, "Why ancient trade routes mattered", "Using the sources, explain why ancient trade routes mattered for the civilizations that used them."),
  P("RESEARCH", 5, 7, "How different cultures celebrate New Year", "Using the sources, explain how different cultures around the world celebrate the New Year."),
  P("RESEARCH", 5, 8, "How animals adapt to their habitats", "Using the sources, explain what we can learn from how animals adapt to the habitats they live in."),
  P("RESEARCH", 6, 1, "How communication has changed over 100 years", "Using the sources, explain how the way people communicate has changed over the last 100 years."),
  P("RESEARCH", 6, 2, "Why protecting coral reefs matters", "Using the sources, explain why protecting coral reefs matters for ocean life."),
  P("RESEARCH", 6, 3, "How ancient civilizations developed writing", "Using the sources, explain how one ancient civilization developed a system of writing."),
  P("RESEARCH", 6, 4, "What causes climate change", "Using the sources, explain what causes climate change and what people can do to reduce its effects."),
  P("RESEARCH", 6, 5, "How vaccines protect communities", "Using the sources, explain how vaccines help protect whole communities from disease, not only one person."),
  P("RESEARCH", 6, 6, "Why water scarcity is a growing issue", "Using the sources, explain why water scarcity is a growing problem in parts of the world."),
  P("RESEARCH", 6, 7, "How the Silk Road connected the ancient world", "Using the sources, explain how the Silk Road connected different parts of the ancient world."),
  P("RESEARCH", 6, 8, "Renewable energy vs. fossil fuels", "Using the sources, explain how renewable energy sources are different from fossil fuels."),
];

/** Every prompt idea: 8 per genre, per grade (4, 5, 6) — 120 in total. */
export const PROMPT_LIBRARY: readonly PromptIdea[] = [...NARRATIVE, ...INFORMATIONAL, ...OPINION, ...HOW_TO, ...RESEARCH];

/** The ideas for one grade (4, 5 or 6), grouped by genre in GENRES order. Unknown grades get an empty list. */
export function promptIdeasForGrade(grade: number): PromptIdea[] {
  return PROMPT_LIBRARY.filter((p) => p.grade === grade);
}

/** One idea by id, or null. */
export function promptIdeaById(id: string): PromptIdea | null {
  return PROMPT_LIBRARY.find((p) => p.id === id) ?? null;
}
