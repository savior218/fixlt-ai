export default function Records() {
  return (
    <div>
      <h1 className="mb-2 text-lg font-bold">维修档案</h1>
      <p className="mb-5 text-sm text-slate-500">
        诊断记录与维修记录将在 DEV-07（多轮诊断）与 DEV-11（维修记录管理）接入后展示，支持按设备筛选、按时间排序与维修结果验证。
      </p>

      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
        <p className="text-sm text-slate-500">暂无记录</p>
        <p className="mt-1 text-xs text-slate-400">
          完成首次诊断并保存后，记录会自动归档到对应设备
        </p>
      </div>
    </div>
  );
}
