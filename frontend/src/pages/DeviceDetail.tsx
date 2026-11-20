import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Stethoscope, History, Info, ChevronDown } from "lucide-react";

import Button, { buttonClass } from "../components/Button";
import EmptyState from "../components/EmptyState";
import ErrorBanner from "../components/ErrorBanner";
import PageHeader from "../components/PageHeader";
import RiskBadge from "../components/RiskBadge";
import SectionCard from "../components/SectionCard";
import { SegmentedControl } from "../components/SettingsControl";
import StatusBadge from "../components/StatusBadge";
import { CATEGORY_LABELS } from "../services/api";
import { deviceUsageYears, withMeta } from "../services/deviceService";
import { useDeviceStore } from "../stores/deviceStore";
import { diagnosesForOwner, useDiagnosisStore } from "../stores/diagnosisStore";
import { recordsForOwner, recordsOfDevice, useRepairStore } from "../stores/repairStore";
import { usePrefs } from "../stores/prefs";
import { formatDate, relativeTime } from "../utils/format";
import { DEVICE_IMAGES } from "../utils/deviceImages";
import { REPAIR_STATUS_LABELS, VERIFICATION_LABELS } from "../types/repair";

/** 按设备类型的常见问题 */
const FAQ_BY_CATEGORY: Record<string, { q: string; a: string }[]> = {
  ac: [
    { q: "多久清洗一次过滤网？", a: "建议每 1-2 个月清洗一次，可明显提升制冷效果。" },
    { q: "制热时有轻微异味正常吗？", a: "首次制热可能有轻微灰尘味，若持续或伴随焦糊味请立即停机。" },
  ],
  fridge: [
    { q: "冰箱两侧发热正常吗？", a: "正常，两侧是散热面；但持续烫手需检查散热空间。" },
    { q: "冷藏室结冰怎么办？", a: "先检查门封是否严密；结冰严重建议断电化霜后再观察。" },
  ],
  washer: [
    { q: "脱水时震动大怎么办？", a: "多为衣物偏心，暂停后抖散衣物重新摆放即可。" },
    { q: "排水慢是什么原因？", a: "常见为排水口滤网堵塞，可断电后清理滤网。" },
  ],
};

type Tab = "overview" | "faults" | "repairs";

/** P7 设备详情（对照「智修AI智能家居维修仪表盘.png」详情屏） */
export default function DeviceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { mode } = usePrefs();
  const elder = mode === "elder";

  const { devices, error, load } = useDeviceStore();
  const allDiagnoses = useDiagnosisStore((s) => s.history);
  const diagnosisOwner = useDiagnosisStore((s) => s.ownerKey);
  const allRecords = useRepairStore((s) => s.records);
  const recordOwner = useRepairStore((s) => s.ownerKey);
  const diagnoses = useMemo(
    () => diagnosesForOwner(allDiagnoses, diagnosisOwner),
    [allDiagnoses, diagnosisOwner]
  );
  const records = useMemo(
    () => recordsForOwner(allRecords, recordOwner),
    [allRecords, recordOwner]
  );
  const [tab, setTab] = useState<Tab>("overview");
  /** elder 分步：先看状态，点「查看设备详情」再展开全部；standard 恒为全部 */
  const [elderExpanded, setElderExpanded] = useState(false);

  const deviceId = Number(id);
  const device = devices.find((d) => d.id === deviceId);

  const meta = useMemo(
    () => (device ? withMeta(device, records) : null),
    [device, records]
  );

  const deviceDiagnoses = useMemo(
    () => diagnoses.filter((d) => d.deviceId === deviceId),
    [diagnoses, deviceId]
  );
  const deviceRecords = useMemo(
    () => recordsOfDevice(records, deviceId),
    [records, deviceId]
  );

  if (!device || !meta) {
    return (
      <div className="space-y-4">
        <Link to="/devices" className={buttonClass("ghost", "sm")}>
          <ArrowLeft className="h-4 w-4" /> 返回设备列表
        </Link>
        {error ? (
          <ErrorBanner message={error} onRetry={() => void load()} />
        ) : (
          <EmptyState
            icon="🔍"
            title="未找到该设备"
            description="设备可能已被删除，请返回列表重新选择。"
            action={<Button onClick={() => navigate("/devices")}>返回设备列表</Button>}
          />
        )}
      </div>
    );
  }

  const lastRepair = deviceRecords[0];
  const faq = FAQ_BY_CATEGORY[device.category] ?? [];
  /** elder 第一步只看状态；standard 或已展开时显示详情 */
  const showDetail = !elder || elderExpanded;

  return (
    <div className="space-y-5">
      <PageHeader
        title={device.name}
        subtitle={`${CATEGORY_LABELS[device.category]}${device.location ? ` · ${device.location}` : ""}`}
        icon={
          <img
            src={DEVICE_IMAGES[device.category].src}
            alt={DEVICE_IMAGES[device.category].alt}
            className="h-full w-full object-contain drop-shadow-[0_4px_10px_rgba(28,25,23,0.18)]"
          />
        }
        actions={
          <>
            <Link to={`/diagnose?deviceId=${device.id}`} className={buttonClass("primary", "md")}>
              <Stethoscope className="h-4 w-4" /> 开始诊断
            </Link>
            {showDetail && (
              <Link to={`/devices/${device.id}/history`} className={buttonClass("secondary", "md")}>
                <History className="h-4 w-4" /> 维修历史
              </Link>
            )}
          </>
        }
      />

      {/* elder 分步引导（先看状态再看详情） */}
      {elder && !elderExpanded && (
        <p className="rounded-xl bg-tip-bg px-4 py-2.5 text-base font-medium text-tip-text">
          👉 先看设备状态，需要时再看详情
        </p>
      )}

      {/* elder 模式：状态卡置顶独立展示（第一步核心内容） */}
      {elder && (
        <div className="card-base flex items-center justify-between p-5">
          <p className="text-lg font-semibold text-stone-900">当前状态</p>
          <StatusBadge status={meta.status} />
        </div>
      )}

      {/* elder 第一步：一句话概况 + 展开按钮；不堆叠详情 */}
      {elder && !elderExpanded ? (
        <>
          <p className="card-base p-5 text-base leading-relaxed text-stone-700">
            这台设备共维修过 <span className="font-bold text-brand-700">{meta.repairCount}</span> 次，
            做过 <span className="font-bold text-brand-700">{deviceDiagnoses.length}</span> 次诊断
            {lastRepair ? `，最近维修是${relativeTime(lastRepair.createdAt)}` : ""}。
          </p>
          <Button size="lg" className="w-full" onClick={() => setElderExpanded(true)}>
            查看设备详情 <ChevronDown className="h-5 w-5" />
          </Button>
        </>
      ) : (
        <>
      {/* 设备信息卡 */}
      <SectionCard title="设备信息" icon={<Info className="h-4 w-4" />}>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-3">
          <Field label="品牌" value={device.brand ?? "—"} />
          <Field label="型号" value={device.model ?? "—"} />
          {!elder && <Field label="运行状态" value={<StatusBadge status={meta.status} />} />}
          <Field label="购买时间" value={device.purchaseDate ? formatDate(device.purchaseDate) : "—"} />
          <Field label="使用年限" value={deviceUsageYears(device) ?? "—"} />
          <Field label="摆放位置" value={device.location ?? "—"} />
          {device.note && <Field label="备注" value={device.note} />}
        </div>
      </SectionCard>

      {/* Tabs */}
      <div className="flex items-center justify-between">
        <SegmentedControl<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "overview", label: "设备概览" },
            { value: "faults", label: `故障历史 (${deviceDiagnoses.length})` },
            { value: "repairs", label: `维修记录 (${deviceRecords.length})` },
          ]}
        />
      </div>

      {tab === "overview" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="维修次数" value={String(meta.repairCount)} />
            <Stat label="诊断次数" value={String(deviceDiagnoses.length)} />
            <Stat
              label="最近维修"
              value={lastRepair ? relativeTime(lastRepair.createdAt) : "—"}
            />
            <Stat label="待验证" value={String(deviceRecords.filter((r) => r.verificationStatus === "unverified").length)} />
          </div>

          {faq.length > 0 && (
            <SectionCard title="常见问题" padding="sm">
              <ul className="divide-y divide-stone-100">
                {faq.map((f) => (
                  <li key={f.q} className="py-3">
                    <p className="text-sm font-medium text-stone-800">{f.q}</p>
                    <p className="mt-1 text-sm text-stone-500">{f.a}</p>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
        </div>
      )}

      {tab === "faults" && (
        <SectionCard title="故障历史（按诊断记录）" padding="sm">
          {deviceDiagnoses.length === 0 ? (
            <EmptyState icon="📋" title="暂无故障记录" description="该设备尚未进行过 AI 诊断。" />
          ) : (
            <ul className="divide-y divide-stone-100">
              {deviceDiagnoses.map((d) => (
                <li key={d.id}>
                  <Link
                    to={`/diagnosis/${d.id}/result`}
                    className="flex items-center justify-between gap-3 py-3 transition-colors hover:bg-stone-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-stone-800">
                        {d.symptom}
                      </span>
                      <span className="block text-xs text-stone-400">{relativeTime(d.createdAt)}</span>
                    </span>
                    <RiskBadge level={d.riskLevel} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}

      {tab === "repairs" && (
        <SectionCard title="维修记录" padding="sm">
          {deviceRecords.length === 0 ? (
            <EmptyState icon="🔧" title="暂无维修记录" description="保存诊断结果或手动添加后会显示在这里。" />
          ) : (
            <ul className="divide-y divide-stone-100">
              {deviceRecords.map((r) => (
                <li key={r.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-stone-800">{r.faultDescription}</p>
                      <p className="mt-0.5 text-xs text-stone-400">
                        {relativeTime(r.createdAt)} · {REPAIR_STATUS_LABELS[r.status]} · 验证：
                        {VERIFICATION_LABELS[r.verificationStatus]}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-right">
            <Link to="/records" className="text-xs text-brand-700 hover:underline">
              前往维修档案管理 ›
            </Link>
          </p>
        </SectionCard>
      )}
        </>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-stone-400">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-stone-800">{value}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-base p-4">
      <p className="text-xs text-stone-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-stone-900">{value}</p>
    </div>
  );
}
