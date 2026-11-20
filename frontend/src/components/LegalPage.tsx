import { useEffect, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

export interface LegalSection {
  /** 章节标题，如 "一、我们如何收集和使用你的信息" */
  heading: string;
  /** 章节内容，一组段落；段内可嵌入链接等节点 */
  paragraphs: ReactNode[];
}

/**
 * 法律文档页共用渲染器（《隐私政策》《用户协议》《版权说明》）。
 * 统一处理：标题、生效/更新日期、章节排版、目录快速跳转。
 */
export default function LegalPage({
  title,
  subtitle,
  effectiveDate,
  updatedDate,
  sections,
}: {
  title: string;
  subtitle: string;
  /** 生效日期，如 "2026年11月19日" */
  effectiveDate: string;
  /** 最近更新日期；未传则与生效日期一致 */
  updatedDate?: string;
  sections: LegalSection[];
}) {
  const location = useLocation();

  // 支持从页脚等入口带锚点直达章节（如 /terms#legal-3 → 用户行为规范）
  useEffect(() => {
    if (!location.hash) return;
    const el = document.getElementById(location.hash.slice(1));
    el?.scrollIntoView();
  }, [location.hash]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      {/* 文档头部 */}
      <div className="card-base p-6 sm:p-8">
        <h1 className="text-xl font-bold text-stone-900 sm:text-2xl">{title}</h1>
        <p className="mt-2 text-sm text-stone-500">{subtitle}</p>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t border-stone-100 pt-4 text-xs text-stone-500">
          <span>
            生效日期：<time className="font-medium text-stone-700">{effectiveDate}</time>
          </span>
          <span>
            更新日期：<time className="font-medium text-stone-700">{updatedDate ?? effectiveDate}</time>
          </span>
        </div>
      </div>

      {/* 快速目录（章节超过 3 章时展示） */}
      {sections.length > 3 && (
        <nav aria-label="目录" className="card-base px-6 py-4">
          <p className="mb-2 text-xs font-semibold text-stone-500">目录</p>
          <ol className="grid gap-x-6 gap-y-1 text-sm text-stone-600 sm:grid-cols-2">
            {sections.map((s, i) => (
              <li key={s.heading}>
                <a href={`#legal-${i}`} className="transition-colors hover:text-brand-700">
                  {s.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}

      {/* 正文 */}
      <article className="card-base space-y-6 p-6 sm:p-8">
        {sections.map((s, i) => (
          <section key={s.heading} id={`legal-${i}`} className="scroll-mt-20">
            <h2 className="text-base font-semibold text-stone-900">{s.heading}</h2>
            <div className="mt-2 space-y-2.5">
              {s.paragraphs.map((p, j) => (
                <p key={j} className="text-sm leading-relaxed text-stone-700">
                  {p}
                </p>
              ))}
            </div>
          </section>
        ))}
      </article>
    </div>
  );
}
