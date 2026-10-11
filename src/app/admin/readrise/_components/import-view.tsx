/** 🚀 ReadRise import page body (admin and teacher). */
import { Section } from "@/components/page-header";
import { ImportForm } from "./import-form";
import { RR_NOTE } from "./ui";

export function ImportView({ base, canPublish }: { base: string; canPublish: boolean }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
      <Section title="How it works" icon="🧭" tone="amber">
        <ol className="list-decimal space-y-2 ps-5 text-sm text-slate-700">
          <li><b>Download the template.</b> One article per file: the same article written 12 times (levels 300 … 1400), 5 key words, 8 questions and a writing prompt for each band.</li>
          <li><b>Upload it here.</b> Nothing is saved yet: you see each version's estimated level against its target (✓ or ⚠ with a hint), and every problem with its sheet and row.</li>
          <li><b>Import</b> as a draft, then <b>review</b> the 12 versions side by side.</li>
          <li><b>Publish.</b> {canPublish ? "You can publish it yourself." : "A school admin publishes it (publishing needs the publish permission)."}</li>
        </ol>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href="/api/readrise/template" className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">⬇ Excel template</a>
          <a href="/api/readrise/template?format=json" className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">⬇ JSON template</a>
        </div>
        <p className="mt-4 text-xs text-slate-500">{RR_NOTE} Codes that start with “RR-” are kept for the platform library: use your own code (for example 4A-OASIS).</p>
      </Section>
      <Section title="Upload and preview" icon="📥">
        <ImportForm base={base} canPublish={canPublish} />
      </Section>
    </div>
  );
}
