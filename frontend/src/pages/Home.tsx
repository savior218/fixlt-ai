import { Link } from "react-router-dom";
import { useEffect, useState } from "react";

import SectionCard from "../components/SectionCard";
import {
  CATEGORY_LABELS,
  type Device,
  listDevices,
} from "../services/api";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return "夜深了";
  if (h < 12) return "早上好";
  if (h < 18) return "下午好";
  return "晚上好";
}

const FAQ_ITEMS = [
  { q: "空调不制冷怎么办？", to: "/diagnose?q=空调不制冷" },
  { q: "洗衣机脱水时噪音很大", to: "/diagnose?q=洗衣机噪音大" },
  { q: "冰箱结冰严重怎么处理", to: "/diagnose?q=冰箱结冰" },
];

export default function Home() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [devicesError, setDevicesError] = useState<string | null>(null);

  useEffect(() => {
    listDevices()
      .then(setDevices)
      .catch((e: Error) => setDevicesError(e.message));
  }, []);

  return (
    <div>
      <p className="mb-1 text-xs text-slate-500">
        {new Date().toLocaleDateString("zh-CN", {
          month: "long",
          day: "numeric",
          weekday: "long",
        })}
      </p>
      <h1 className="mb-5 text-xl font-bold">{greeting()}，请问家里设备有什么异常？</h1>

      <Link
        to="/diagnose"
        className="mb-5 block rounded-2xl bg-cyan-700 p-5 text-white shadow-sm transition-colors hover:bg-cyan-800"
      >
        <p className="text-lg font-semibold">🔧 开始智能诊断</p>
        <p className="mt-1 text-sm text-cyan-100">
          用文字、图片或语音描述故障，AI 帮你分析原因、判断风险、给出下一步建议
        </p>
      </Link>

      <SectionCard
        title="我的设备"
        action={
          <Link to="/devices" className="text-xs text-cyan-700 hover:underline">
            管理 →
          </Link>
        }
      >
        {devicesError ? (
          <p className="text-sm text-amber-700">
            后端服务未连接，请先启动后端（uvicorn）。{devicesError}
          </p>
        ) : devices.length === 0 ? (
          <p className="text-sm text-slate-500">
            暂无设备，去<Link to="/devices" className="text-cyan-700 hover:underline">添加设备</Link>后可获得更准确的诊断。
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {devices.map((d) => (
              <li
                key={d.id}
                className="rounded-xl border border-slate-200 px-3 py-2"
              >
                <p className="text-sm font-medium">{d.name}</p>
                <p className="text-xs text-slate-500">
                  {CATEGORY_LABELS[d.category]}
                  {d.brand ? ` · ${d.brand}` : ""}
                  {d.location ? ` · ${d.location}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="常见问题">
        <ul>
          {FAQ_ITEMS.map((item) => (
            <li key={item.q} className="border-b border-slate-100 last:border-0">
              <Link
                to={item.to}
                className="flex items-center justify-between py-2.5 text-sm text-slate-700 hover:text-cyan-700"
              >
                {item.q}
                <span aria-hidden>›</span>
              </Link>
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title="最近记录">
        <p className="text-sm text-slate-500">
          暂无诊断记录。完成首次诊断（DEV-07 接入后）会自动展示在这里。
        </p>
      </SectionCard>

      <p className="px-1 text-xs leading-5 text-slate-400">
        智修AI 提供辅助判断信息，不替代品牌官方售后与专业维修。遇到冒烟、漏电、燃气泄漏等情况，请立即远离危险并联系专业机构。
      </p>
    </div>
  );
}
