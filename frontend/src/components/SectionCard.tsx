import type { ReactNode } from "react";

interface SectionCardProps {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}

export default function SectionCard({ title, action, children }: SectionCardProps) {
  return (
    <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
