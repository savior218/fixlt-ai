﻿import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

import { buttonClass } from "../components/Button";
import EmptyState from "../components/EmptyState";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import StatusBadge, { type Status } from "../components/StatusBadge";
import { useDeviceStore } from "../stores/deviceStore";
import { recordsOfDevice, useRepairStore } from "../stores/repairStore";
import { REPAIR_STATUS_LABELS, VERIFICATION_LABELS, type RepairStatus, type VerificationStatus } from "../types/repair";
import { formatDateTime } from "../utils/format";

/** 验证状态 → StatusBadge 状态映射（两处语义保持一致） */
function verificationBadge(v: VerificationStatus): Status {
  switch (v) {
    case "recovered":
      return "recovered";
    case "partial":
      return "partial";
    case "notRecovered":
      return "failed";
    default:
      return "pending";
  }
}

function repairStatusBadge(s: RepairStatus): Status {
  switch (s) {
    case "recovered":
      return "recovered";
    case "partial":
      return "partial";
    case "failed":
      return "failed";
    default:
      return "pending";
  }
}

/** P8 设备维修历史（时间轴，对照「智修AI智能家居维修仪表盘.png」维修历史屏） */
export default function RepairHistory() {
  const { id } = useParams();
  const devices = useDeviceStore((s) => s.devices);
  const records = useRepairStore((s) => s.records);

  const deviceId = Number(id);
  const device = devices.find((d) => d.id === deviceId);
  const mine = useMemo(() => recordsOfDevice(records, deviceId), [records, deviceId]);

  return (
    <div className="space-y-5">
      <Link to={`/devices/${deviceId}`} className={buttonClass("ghost", "sm")}>
        <ArrowLeft className="h-4 w-4" /> 返回设备详情
      </Link>

      <PageHeader
        title={`${device?.name ?? "设备"} · 维修历史`}
        subtitle={`共 ${mine.length} 条记录，按时间倒序排列`}
      />

      {mine.length === 0 ? (
        <EmptyState
          icon="🕘"
          title="暂无维修记录"
          description="保存诊断结果或完成一次维修后，历史会按时间轴展示在这里。"
          action={
            <Link to="/records" className={buttonClass("primary", "md")}>
              前往维修档案
            </Link>
          }
        />
      ) : (
        <SectionCard>
          <ol className="relative ml-3 space-y-6 border-l-2 border-brand-100 pl-6">
            {mine.map((r) => (
              <li key={r.id} className="relative">
                {/* 时间轴节点 */}
                <span
                  aria-hidden
                  className={`absolute -left-[1.95rem] top-1 h-3 w-3 rounded-full border-2 border-surface ${
                    r.verificationStatus === "recovered"
                      ? "bg-risk-low"
                      : r.verificationStatus === "notRecovered"
                        ? "bg-risk-high"
                        : "bg-stone-400"
                  }`}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-stone-900">
                    {formatDateTime(r.createdAt)}
                  </p>
                  <StatusBadge status={repairStatusBadge(r.status)} />
                  <StatusBadge status={verificationBadge(r.verificationStatus)} />
                </div>
                <div className="mt-2 space-y-1 rounded-xl bg-stone-50 p-3 text-sm">
                  <p className="text-stone-700">
                    <span className="font-medium text-stone-500">故障：</span>
                    {r.faultDescription}
                  </p>
                  <p className="whitespace-pre-wrap text-stone-700">
                    <span className="font-medium text-stone-500">处理：</span>
                    {r.repairMethod}
                  </p>
                  <p className="text-xs text-stone-400">
                    状态 {REPAIR_STATUS_LABELS[r.status]} · 验证 {VERIFICATION_LABELS[r.verificationStatus]}
                    {r.cost != null && ` · 费用 ¥${r.cost}`}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </SectionCard>
      )}
    </div>
  );
}
