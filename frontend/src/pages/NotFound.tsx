import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <p className="text-4xl">🧰</p>
      <h1 className="mt-3 text-lg font-bold">页面不存在</h1>
      <p className="mt-1 text-sm text-stone-500">你要找的页面可能已被移除。</p>
      <Link
        to="/"
        className="mt-5 inline-block rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
      >
        返回首页
      </Link>
    </div>
  );
}
