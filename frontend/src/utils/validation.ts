/* ============================================================
   表单校验（阶段五：设备表单 / 报修表单）
   返回字段错误信息对象；空对象表示校验通过
   ============================================================ */

import type { DeviceForm } from "../types/device";

export type FormErrors<T> = Partial<Record<keyof T, string>>;

/** 设备名称：必填，2~64 字符 */
export function validateDeviceForm(form: DeviceForm): FormErrors<DeviceForm> {
  const errors: FormErrors<DeviceForm> = {};
  const name = form.name.trim();
  if (!name) errors.name = "请填写设备名称";
  else if (name.length < 2) errors.name = "设备名称至少 2 个字符";
  else if (name.length > 64) errors.name = "设备名称不能超过 64 个字符";

  if (form.brand && form.brand.length > 64) errors.brand = "品牌不能超过 64 个字符";
  if (form.model && form.model.length > 64) errors.model = "型号不能超过 64 个字符";
  if (form.location && form.location.length > 64) errors.location = "位置不能超过 64 个字符";

  if (form.purchaseDate) {
    const d = new Date(form.purchaseDate);
    if (Number.isNaN(d.getTime())) errors.purchaseDate = "日期格式不正确";
    else if (d.getTime() > Date.now()) errors.purchaseDate = "购买日期不能晚于今天";
  }
  return errors;
}

/** 智能报修表单（P5）：设备类型与故障现象必填 */
export interface RepairFormInput {
  category: string;
  symptom: string;
  description: string;
}

export function validateRepairForm(
  form: RepairFormInput
): FormErrors<RepairFormInput> {
  const errors: FormErrors<RepairFormInput> = {};
  if (!form.category) errors.category = "请选择设备类型";
  if (!form.symptom) errors.symptom = "请选择故障现象";
  if (form.description.length > 500) errors.description = "描述不能超过 500 字";
  return errors;
}

/** 诊断描述（P1）：非空时长度限制 */
export function validateDiagnosisDescription(description: string): string | null {
  if (description.length > 500) return "描述不能超过 500 字";
  return null;
}
