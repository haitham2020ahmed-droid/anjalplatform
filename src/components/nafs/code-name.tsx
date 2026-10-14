import { codeName, codeShort, MOE_BY_CODE, PROCESS_NAME, SKILL_BY_CODE, type NafsProcess } from "@/server/nafs/framework";

type T = (s: string) => string;

/**
 * 🇸🇦 A NAFS code WITH its name in a narrow table header (heat maps, class comparisons): the short code on top and the
 * name under it (three lines at most, the whole name on hover). Used where a column cannot hold "S13 — …" on one line.
 * No hooks: server and client components both use it.
 */
export function CodeHead({ code, t }: { code: string; t: T }) {
  const skill = SKILL_BY_CODE.get(code);
  if (skill && !/^NAFS\.P[1-4]$/.test(code)) return <span className="block min-w-[5.5rem] max-w-[7rem] whitespace-normal text-start text-[11px] leading-tight" title={t(skill.name)}>{t(skill.name)}</span>;
  const name = MOE_BY_CODE.get(code)?.text ?? PROCESS_NAME[(/^(?:NAFS\.)?(P[1-4])$/.exec(code)?.[1] ?? "") as NafsProcess] ?? "";
  return (
    <span className="block min-w-[5.5rem] max-w-[7rem] text-start" title={codeName(code, t)}>
      <span className="block font-mono font-semibold" dir="ltr">{codeShort(code)}</span>
      {name && <span className="line-clamp-3 block whitespace-normal text-[10px] font-normal leading-tight text-muted">{t(name)}</span>}
    </span>
  );
}
