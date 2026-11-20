import { Link } from "react-router-dom";

/**
 * 品牌标识：图标方块 + 中文名「修必达」（衬线 + 字距）
 * - 侧栏 / 抽屉：图标 + 中文名
 * - 顶栏：markOnly，只留图标 —— 品牌名只在侧栏出现一次，避免重复
 */
export default function BrandMark({
  markOnly = false,
  className = "",
}: {
  markOnly?: boolean;
  className?: string;
}) {
  return (
    <Link
      to="/"
      aria-label="修必达 · 返回首页"
      className={`brand-mark ${className}`}
    >
      <span className="brand-mark-tile" aria-hidden>
        <img src="/brand-icon.png" alt="" width={32} height={32} />
      </span>
      {!markOnly && <span className="brand-mark-name">修必达</span>}
    </Link>
  );
}
