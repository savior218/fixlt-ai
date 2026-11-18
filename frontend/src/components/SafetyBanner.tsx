import { ShieldCheck } from "lucide-react";

/** 底部固定安全横幅 */
export default function SafetyBanner() {
  return (
    <footer className="app-safety-banner flex items-center justify-center gap-2 border-t border-brand-200 bg-brand-50 px-6 py-2.5 text-sm text-brand-800">
      <ShieldCheck className="h-4 w-4" aria-hidden />
      <span>安全守护·让家更安心</span>
    </footer>
  );
}
