import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

import BrandMark from "./BrandMark";

export interface LegalSection {
  /** 章节标题，如 "一、我们如何收集和使用你的信息" */
  heading: string;
  /** 章节内容，一组段落；段内可嵌入链接等节点 */
  paragraphs: ReactNode[];
}

/** 法律文档切换入口（四份文档共用同一套整页版式） */
const LEGAL_DOCS = [
  { to: "/terms", label: "软件许可及服务协议" },
  { to: "/privacy", label: "隐私政策" },
  { to: "/guidelines", label: "使用规范" },
  { to: "/copyright", label: "版权声明" },
];

/**
 * 法律文档整页版式（《服务协议》《隐私政策》《使用规范》《版权说明》）。
 * - 不套用应用外壳（侧栏 / 顶栏），独立成页，便于阅读、打印与对外引用
 * - 官方文档式排版：文档头（标题 / 日期）、文档切换、左侧目录、正文分章
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

  // 独立整页：浏览器标签标题与文档标题保持一致
  useEffect(() => {
    document.title = title.includes("修必达")
      ? title
      : `${title} · 修必达 FixIt AI`;
    return () => {
      document.title = "修必达 · FixIt AI";
    };
  }, [title]);

  return (
    <div className="legal-page min-h-screen bg-background">
      {/* 文档顶栏：品牌 + 返回应用（不出现应用侧栏 / 顶栏） */}
      <header className="legal-topbar sticky top-0 z-20 border-b border-stone-200 bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <BrandMark />
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            返回应用
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-9 sm:px-6 sm:pt-12">
        {/* 文档头：分类 + 标题 + 说明 + 生效/更新日期 */}
        <div className="border-b border-stone-200 pb-7">
          <p className="text-[11px] font-semibold tracking-[0.28em] text-brand-600">
            LEGAL · 法律文档
          </p>
          <h1 className="mt-3 text-[26px] font-bold leading-snug text-stone-900 sm:text-[32px]">
            {title}
          </h1>
          <p className="mt-2.5 max-w-3xl text-sm leading-relaxed text-stone-500">
            {subtitle}
          </p>
          <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-1.5 text-xs text-stone-500">
            <div>
              <dt className="inline">生效日期：</dt>
              <dd className="inline font-medium text-stone-700">
                <time>{effectiveDate}</time>
              </dd>
            </div>
            <div>
              <dt className="inline">更新日期：</dt>
              <dd className="inline font-medium text-stone-700">
                <time>{updatedDate ?? effectiveDate}</time>
              </dd>
            </div>
          </dl>
        </div>

        {/* 文档切换：四份法律文档互相直达 */}
        <nav aria-label="法律文档导航" className="legal-docnav mt-5 flex flex-wrap gap-2">
          {LEGAL_DOCS.map((doc) => {
            const active = location.pathname === doc.to;
            return (
              <Link
                key={doc.to}
                to={doc.to}
                aria-current={active ? "page" : undefined}
                className={[
                  "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "border-brand-300 bg-brand-50 text-brand-800"
                    : "border-stone-200 bg-surface text-stone-600 hover:border-stone-300 hover:text-stone-900",
                ].join(" ")}
              >
                {doc.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-8 grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
          {/* 目录：桌面端左侧常驻 */}
          <aside className="legal-toc hidden lg:block">
            <div className="sticky top-24">
              <p className="text-[11px] font-semibold tracking-[0.2em] text-stone-400">
                目录 / CONTENTS
              </p>
              <ol className="mt-3 space-y-2 border-l border-stone-200 pl-4">
                {sections.map((s, i) => (
                  <li key={s.heading}>
                    <a
                      href={`#legal-${i}`}
                      className="block text-[13px] leading-snug text-stone-500 transition-colors hover:text-brand-700"
                    >
                      {s.heading}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </aside>

          {/* 正文 */}
          <article className="legal-article rounded-2xl border border-stone-200 bg-surface px-5 py-7 shadow-card sm:px-9 sm:py-9">
            {/* 窄屏目录：折叠，避免长文只能一路滚动 */}
            <details className="legal-toc-mobile mb-7 rounded-xl bg-stone-50 px-4 py-3 lg:hidden">
              <summary className="cursor-pointer text-xs font-semibold text-stone-600">
                目录（共 {sections.length} 章）
              </summary>
              <ol className="mt-2 space-y-1.5 text-[13px] text-stone-600">
                {sections.map((s, i) => (
                  <li key={s.heading}>
                    <a href={`#legal-${i}`} className="hover:text-brand-700">
                      {s.heading}
                    </a>
                  </li>
                ))}
              </ol>
            </details>

            <div className="space-y-9">
              {sections.map((s, i) => (
                <section key={s.heading} id={`legal-${i}`} className="scroll-mt-24">
                  <h2 className="text-[15px] font-semibold leading-snug text-stone-900 sm:text-base">
                    {s.heading}
                  </h2>
                  <div className="mt-3 space-y-3">
                    {s.paragraphs.map((p, j) => (
                      <p
                        key={j}
                        className="text-[15px] leading-[1.95] text-stone-700"
                      >
                        {p}
                      </p>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            {/* 正文结尾：生效说明 */}
            <div className="mt-10 border-t border-stone-100 pt-5 text-xs leading-relaxed text-stone-500">
              <p>
                本文件自 {effectiveDate} 起生效。如对本文件内容有疑问，可通过客服邮箱
                savior200618@qq.com 与我们联系。
              </p>
            </div>
          </article>
        </div>
      </main>

      {/* 文档页脚 */}
      <footer className="legal-footer border-t border-stone-200 bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <nav
            aria-label="相关法律文档"
            className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-stone-500"
          >
            <span className="text-stone-400">相关文档</span>
            {LEGAL_DOCS.map((doc) => (
              <Link
                key={doc.to}
                to={doc.to}
                className="transition-colors hover:text-brand-700 hover:underline"
              >
                {doc.label}
              </Link>
            ))}
          </nav>
          <p className="mt-4 text-xs text-stone-400">
            Copyright © 2026 修必达 FixIt AI · ZengYingyi · ChenLin. All Rights
            Reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
