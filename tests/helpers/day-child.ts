/** Child process of tests/idle-memory.test.ts (real --expose-gc): the school day, printed as {"result": …}. */
import { schoolDayMemory } from "./idle-scenario";

void schoolDayMemory({ bank: Number(process.argv[2]) || 8000, skills: Number(process.argv[3]) || 120 }).then((r) => console.log(JSON.stringify({ result: r })));
