/**
 * Child process of tests/load-rush.test.ts: the class rush with the production V8 flags of a 512 MB plan (real
 * --expose-gc), printed as {"result": …}. Arguments: students, questions each, connection pool, round trip ms.
 */
import { getHeapStatistics } from "node:v8";
import { rushSchool, runRush } from "./rush";
import { cacheSizes } from "../../src/server/cache/idle";
import { afterQueueStats } from "../../src/server/lib/after-response";
import { admissionStats, ANSWER_CONCURRENCY } from "../../src/server/lib/admission";

void (async () => {
  const [students, questions, pool, latency] = process.argv.slice(2).map(Number);
  const school = await rushSchool({ classesPerGrade: Math.ceil((students || 300) / 75), studentsPerClass: 25 });
  const rush = await runRush(school, { students: students || 300, questions: questions || 20, pool: pool || 8, latencyMs: latency || 2 });
  const heapLimitMb = Math.round(getHeapStatistics().heap_size_limit / 1048576);
  console.log(JSON.stringify({ result: { ...rush, heapLimitMb, caches: cacheSizes(), after: afterQueueStats(), admission: admissionStats("answers"), answerConcurrency: ANSWER_CONCURRENCY } }));
})();
