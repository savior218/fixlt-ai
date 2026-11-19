/** 加载状态：AI 调用等异步过程（PRD 13 章要求显示加载状态） */
export default function Loading({ label = "加载中…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-8 text-sm text-stone-500">
      <span
        aria-hidden
        className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-brand-600"
      />
      {label}
    </div>
  );
}
