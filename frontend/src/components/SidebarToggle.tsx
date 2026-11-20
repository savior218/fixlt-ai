interface SidebarToggleProps {
  /** 左侧导航栏当前是否展开 */
  open: boolean;
  /** 点击切换展开 / 收起 */
  onToggle: () => void;
  /** 追加的布局 / 显隐类（桌面显示与否由调用方控制） */
  className?: string;
}

/**
 * 左侧导航栏展开 / 收起按钮（模仿 Trae 的侧栏图标：圆角方框 + 左侧实心竖条）。
 * - 桌面展开时位于侧栏标题行右侧；
 * - 收起后侧栏滑出，按钮改由顶部导航栏最左侧显示。
 */
export default function SidebarToggle({ open, onToggle, className = "" }: SidebarToggleProps) {
  const label = open ? "收起左侧导航栏" : "展开左侧导航栏";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-expanded={open}
      aria-controls="app-sidebar"
      title={label}
      className={[
        "h-8 w-8 shrink-0 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800",
        className,
      ].join(" ")}
    >
      <svg viewBox="0 0 16 16" aria-hidden className="h-4 w-4">
        <rect
          x="1.75"
          y="1.75"
          width="12.5"
          height="12.5"
          rx="2.2"
          className="fill-none stroke-stone-500"
          strokeWidth="1.5"
        />
        <rect x="2.9" y="2.9" width="3.2" height="10.2" rx="1.2" className="fill-stone-400" />
      </svg>
    </button>
  );
}
