import { LiteriseLogo } from "./brand/literise-logo";
import { LoadingStatus } from "./loading-status";
/**
 * Shown by Next.js the moment a link is clicked (loading.tsx), shaped like the page that is coming, so the screen
 * answers at once and nothing jumps when the page arrives (Update 42B). Same frame as AppShell; grey placeholder
 * blocks; respects "reduce motion"; screen readers hear "Loading…".
 */
const Bar = ({ w, h = "h-3", tone = "bg-slate-200" }: { w: string; h?: string; tone?: string }) => <div className={`${h} ${w} max-w-full rounded ${tone}`} />;

function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <LiteriseLogo size="sm" />
          <span className="h-8 w-8 rounded-full bg-slate-200" aria-hidden="true" />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8" aria-busy="true">
        <LoadingStatus label={label} />
        <div className="animate-pulse motion-reduce:animate-none" aria-hidden="true">{children}</div>
      </main>
    </div>
  );
}

const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => <div className={`rounded-3xl bg-white p-5 ring-1 ring-slate-200 ${className}`}>{children}</div>;

/** Student home: next-step banner, today's plan, the work list. */
export function StudentHomeSkeleton() {
  return (
    <Frame label="Loading your work…">
      <div className="h-24 rounded-3xl bg-indigo-100" />
      <div className="mt-5 grid gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <Card key={i}><Bar w="w-28" /><div className="mt-3"><Bar w="w-40" h="h-6" /></div><div className="mt-3"><Bar w="w-full" tone="bg-slate-100" /></div></Card>)}</div>
      <div className="mt-6 space-y-3">{[0, 1, 2, 3].map((i) => <Card key={i} className="flex items-center gap-4"><div className="h-12 w-12 shrink-0 rounded-2xl bg-slate-200" /><div className="min-w-0 flex-1 space-y-2"><Bar w="w-56" h="h-4" /><Bar w="w-3/4" tone="bg-slate-100" /></div><div className="hidden h-10 w-24 rounded-xl bg-slate-200 sm:block" /></Card>)}</div>
    </Frame>
  );
}

/** One question at a time (practice, lessons, question sets): progress bar, the question, the answer choices. */
export function QuestionSkeleton({ label = "Loading your question…" }: { label?: string }) {
  return (
    <Frame label={label}>
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between gap-3"><Bar w="w-40" h="h-5" /><Bar w="w-20" /></div>
        <div className="mt-3 h-2 rounded-full bg-slate-200" />
        <Card className="mt-6">
          <div className="space-y-3"><Bar w="w-full" h="h-5" /><Bar w="w-11/12" h="h-5" /><Bar w="w-2/3" h="h-5" /></div>
          <div className="mt-6 space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-12 rounded-2xl bg-slate-100 ring-1 ring-slate-200" />)}</div>
          <div className="mt-6 flex justify-end"><div className="h-11 w-32 rounded-xl bg-slate-200" /></div>
        </Card>
      </div>
    </Frame>
  );
}

/** Reading (ReadRise, ReadMaster): a list of article cards. */
export function ReadingListSkeleton({ label = "Loading your reading…" }: { label?: string }) {
  return (
    <Frame label={label}>
      <Bar w="w-64" h="h-8" />
      <div className="mt-2"><Bar w="w-96" tone="bg-slate-100" /></div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <Card key={i}><div className="h-28 rounded-2xl bg-slate-100" /><div className="mt-4 space-y-2"><Bar w="w-3/4" h="h-5" /><Bar w="w-1/2" tone="bg-slate-100" /></div></Card>)}</div>
    </Frame>
  );
}

/** An article being opened: title, then paragraphs. */
export function ArticleSkeleton({ label = "Loading the article…" }: { label?: string }) {
  return (
    <Frame label={label}>
      <div className="mx-auto max-w-3xl">
        <Bar w="w-24" />
        <div className="mt-3"><Bar w="w-2/3" h="h-8" /></div>
        <Card className="mt-6"><div className="space-y-4">{[0, 1, 2].map((p) => <div key={p} className="space-y-2"><Bar w="w-full" tone="bg-slate-100" /><Bar w="w-full" tone="bg-slate-100" /><Bar w="w-11/12" tone="bg-slate-100" /><Bar w="w-3/5" tone="bg-slate-100" /></div>)}</div></Card>
      </div>
    </Frame>
  );
}

/** Teacher class page: overview numbers, the heat map, the assignment list. */
export function ClassPageSkeleton() {
  return (
    <Frame label="Loading the class…">
      <Bar w="w-56" h="h-8" />
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Card key={i}><Bar w="w-24" /><div className="mt-3"><Bar w="w-16" h="h-8" /></div></Card>)}</div>
      <Card className="mt-6">
        <div className="flex gap-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-8 w-20 rounded-lg bg-slate-200" />)}</div>
        <div className="mt-4 grid grid-cols-6 gap-1 sm:grid-cols-10">{Array.from({ length: 40 }, (_, i) => <div key={i} className="h-8 rounded bg-slate-100" />)}</div>
      </Card>
      <div className="mt-6 space-y-3">{[0, 1, 2].map((i) => <Card key={i}><Bar w="w-64" h="h-4" /><div className="mt-2"><Bar w="w-1/2" tone="bg-slate-100" /></div></Card>)}</div>
    </Frame>
  );
}

/** A section page (title, then a few cards): student and staff pages without a more specific shape. */
export function SectionSkeleton({ label = "Loading…", cards = 3 }: { label?: string; cards?: number }) {
  return (
    <Frame label={label}>
      <Bar w="w-24" tone="bg-slate-100" />
      <div className="mt-3"><Bar w="w-64" h="h-8" /></div>
      <div className="mt-6 space-y-4">{Array.from({ length: cards }, (_, i) => <Card key={i}><Bar w="w-40" h="h-5" /><div className="mt-4 space-y-3"><Bar w="w-full" tone="bg-slate-100" /><Bar w="w-11/12" tone="bg-slate-100" /><Bar w="w-4/5" tone="bg-slate-100" /></div></Card>)}</div>
    </Frame>
  );
}

/** Reports and dashboards: a tab row, number tiles, then a table. */
export function ReportSkeleton({ label = "Loading the report…" }: { label?: string }) {
  return (
    <Frame label={label}>
      <Bar w="w-64" h="h-8" />
      <div className="mt-4 flex flex-wrap gap-2">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-9 w-24 rounded-xl bg-slate-100" />)}</div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Card key={i}><Bar w="w-24" /><div className="mt-3"><Bar w="w-16" h="h-8" /></div></Card>)}</div>
      <Card className="mt-6">
        <Bar w="w-48" h="h-5" />
        <div className="mt-4 space-y-2">{Array.from({ length: 8 }, (_, i) => <div key={i} className="h-9 rounded-lg bg-slate-100" />)}</div>
      </Card>
    </Frame>
  );
}
