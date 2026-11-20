import { Link } from "react-router-dom";

/**
 * 品牌标识：图标方块 + 中文名（衬线字重）+ 英文副标
 * 侧栏、顶栏、移动端抽屉共用，保证三端品牌呈现一致。
 * - layout="stacked"：中文在上、英文在下的竖排字标（侧栏 / 抽屉）
 * - layout="inline"：中文 + 英文同行（顶栏横向字标，避免与侧栏重复感）
 * - subtitle 传 false 时只保留图标 + 中文名
 */
export default function BrandMark({
  subtitle = "FixIt AI",
  layout = "stacked",
  className = "",
}: {
  subtitle?: string | false;
  layout?: "stacked" | "inline";
  className?: string;
}) {
  return (
    <Link
      to="/"
      aria-label="修必达 FixIt AI · 返回首页"
      className={[
        "brand-mark",
        layout === "inline" ? "brand-mark--inline" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="brand-mark-tile" aria-hidden>
        <img src="/brand-icon.png" alt="" width={32} height={32} />
      </span>
      <span className="brand-mark-text">
        <span className="brand-mark-name">修必达</span>
        {subtitle !== false && (
          <span className="brand-mark-en" aria-hidden>
            {subtitle}
          </span>
        )}
      </span>
    </Link>
  );
}
