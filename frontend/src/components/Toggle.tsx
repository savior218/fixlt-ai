/** 开关控件：语音/高对比度/减少动画等偏好（PRD 第 8 章） */
export default function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 py-3">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-stone-500">{description}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-stone-300 transition-colors before:block before:h-5 before:w-5 before:transtone-x-0.5 before:transtone-y-0.5 before:rounded-full before:bg-white before:transition-transform checked:bg-brand-600 checked:before:transtone-x-[1.375rem]"
      />
    </label>
  );
}
