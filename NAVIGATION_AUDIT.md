# NAVIGATION AUDIT (Update 16)

## Teacher — before
Home · Curriculum Map · Question Bank · ReadMaster · Grammar · Assignments · MAP · Plans · Intervention · Levels · Games (11, mixed order, technical names; no “My classes”, no “Students”, no “Reports”).

## Teacher — after (main menu, in this order)
1. 🏠 **Home** — summary cards, alerts list (each links to the student), quick actions (Assign, Levels, Respond, Enter MAP data, Students).
2. 👥 **My Classes** — new list page; each class → Students · Dashboard · Levels.
3. 🧭 **Curriculum** — simplified (see CURRICULUM_PAGE.md); header buttons to Grammar, Respond, ReadMaster, Games, Skill plans, Question Bank.
4. 📝 **Assignments**
5. 📈 **Students** — the dashboard (class + student views, Excel / PDF).
6. 🗺️ **MAP Data** — scores, ✏️ manual entry, file upload, recommendations, plans.
7. 📄 **Reports** — parent reports (share when ready) and exports.
Then: 🔤 Grammar · ✍️ Respond · 🎮 Games · 🎯 Levels (frequent daily tools, one click away).
Merged / reached from elsewhere (no data or feature removed): Plans → MAP Data and Curriculum; Intervention → Home alerts and MAP Data; Question Bank → Curriculum header.

## Admin — after
Home · Curriculum Map · Question Bank · 🧩 Skills (master list) · 🏷️ Tags & review · ReadMaster · Grammar · 🏫 Grade summary · 📈 Students · 🧑‍🏫 Teacher follow-up · MAP · Analytics · Users · Settings.

## Student — after
Home · 🧩 My skills · 🏅 Badges · ReadMaster · ✍️ Respond · My MAP · My plans · Join a game.
Home shows what to do next first: a new-badge banner, open games, Respond tasks, then the area cards (My work, My skills, ReadMaster, plans, game, MAP).

## Names changed to plain language
“Adaptive (🛟 → Below → On → Above → 🚀)” → “🤖 Automatic”; “Each at their level” → “✋ Manual”; “MAP RIT” → “MAP scores”; “% correct on every place” → “How the class did on each section”; Grammar / skill-assign texts without “adaptive”.

## Design system (kept consistent)
The existing tokens (brand navy / purple / teal / gold), `PageHeader` (back link = breadcrumb, icon, title, subtitle, actions), `Section`, rounded-3xl cards, the same chip / button styles and `Tile` summary cards on all new pages. Tables scroll sideways inside their card on small screens; buttons wrap; print hides menus.

## Tablet / phone
All new pages use responsive grids (1 column on phones, 2–3 on tablets) and `overflow-x-auto` tables; buttons are at least 40 px tall; the main menu scrolls sideways. QR codes open in the phone browser and go through sign-in to the game.
