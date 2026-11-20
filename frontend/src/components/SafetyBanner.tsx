import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";

/** 页脚法务链接（参考主流产品官网页脚的信息层级，内容基于修必达自身业务） */
const FOOTER_LINKS: { to: string; label: string; end?: boolean }[] = [
  { to: "/about", label: "关于修必达" },
  { to: "/settings", label: "安全守护" },
  { to: "/terms", label: "服务协议" },
  // 用户协议中的"三、用户行为规范"章节，直达使用规范内容
  { to: "/terms#legal-3", label: "使用规范" },
  { to: "/privacy", label: "隐私保护指引" },
  { to: "/copyright", label: "版权说明" },
];

/** 站点页脚：安全标语 + 法务链接 + 备案信息 + 版权声明。
    布局参考主流官网页脚（居中三行、小字号、分隔符），内容为修必达自有信息 */
export default function SafetyBanner() {
  return (
    <footer className="app-safety-banner border-t border-stone-200 bg-white">
      {/* 安全标语（品牌横幅） */}
      <div className="flex items-center justify-center gap-2 border-b border-stone-100 bg-brand-50 px-6 py-2.5 text-sm text-brand-800">
        <ShieldCheck className="h-4 w-4" aria-hidden />
        <span>安全守护·让家更安心</span>
      </div>

      {/* 法务链接行 */}
      <nav
        aria-label="页脚导航"
        className="flex flex-wrap items-center justify-center gap-x-1 gap-y-1 px-6 pt-4 text-xs text-stone-500"
      >
        {FOOTER_LINKS.map((item, i) => (
          <span key={item.label} className="flex items-center">
            {i > 0 && <span aria-hidden className="mx-2.5 h-3 w-px bg-stone-300" />}
            <Link
              to={item.to}
              className="transition-colors hover:text-brand-700 hover:underline"
            >
              {item.label}
            </Link>
          </span>
        ))}
      </nav>

      {/* 备案信息行：暂未取得备案号，取得后在此补充（链接 https://beian.miit.gov.cn/） */}

      {/* 版权行 */}
      <p className="px-6 pb-2 pt-1.5 text-center text-xs text-stone-400">
        Copyright © 2026 修必达 FixIt AI. All Rights Reserved.
      </p>
    </footer>
  );
}
