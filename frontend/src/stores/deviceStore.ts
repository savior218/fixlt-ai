import { create } from "zustand";

import { deviceService } from "../services/deviceService";
import { getCurrentOwner, LOCAL_OWNER } from "../services/identity";
import type { Device, DeviceForm } from "../types/device";

const GUEST_READ_ONLY = "游客演示设备为只读样例，登录后即可管理自己的设备";

/** 设备列表（服务端为数据源，不做本地 persist） */
interface DeviceState {
  devices: Device[];
  loading: boolean;
  error: string | null;
  /** 游客只读样例模式 */
  demoMode: boolean;
  /** P1 预选 / P7 当前设备 */
  selectedId: number | null;
  applyOwner: (ownerKey: string) => void;
  load: () => Promise<void>;
  add: (form: DeviceForm) => Promise<void>;
  update: (id: number, form: DeviceForm) => Promise<void>;
  remove: (id: number) => Promise<void>;
  select: (id: number | null) => void;
}

export const useDeviceStore = create<DeviceState>()((set, get) => ({
  devices: [],
  loading: false,
  error: null,
  demoMode: getCurrentOwner() === LOCAL_OWNER,
  selectedId: null,

  // 账号切换 / 退出 / 登录失效：清空上一账号的设备快照，避免短暂串数据
  applyOwner: () =>
    set({
      devices: [],
      loading: false,
      error: null,
      demoMode: getCurrentOwner() === LOCAL_OWNER,
      selectedId: null,
    }),

  load: async () => {
    const guest = getCurrentOwner() === LOCAL_OWNER;
    set({ loading: true, error: null, demoMode: guest });
    try {
      const devices = guest
        ? await deviceService.listDemo()
        : await deviceService.list();
      set({ devices, loading: false });
    } catch (e) {
      set({ devices: [], error: (e as Error).message, loading: false });
    }
  },

  add: async (form) => {
    if (getCurrentOwner() === LOCAL_OWNER) throw new Error(GUEST_READ_ONLY);
    const d = await deviceService.create(form);
    set({ devices: [...get().devices, d] });
  },

  update: async (id, form) => {
    if (getCurrentOwner() === LOCAL_OWNER) throw new Error(GUEST_READ_ONLY);
    const d = await deviceService.update(id, form);
    set({ devices: get().devices.map((x) => (x.id === id ? d : x)) });
  },

  remove: async (id) => {
    if (getCurrentOwner() === LOCAL_OWNER) throw new Error(GUEST_READ_ONLY);
    await deviceService.remove(id);
    set({
      devices: get().devices.filter((x) => x.id !== id),
      selectedId: get().selectedId === id ? null : get().selectedId,
    });
  },

  select: (selectedId) => set({ selectedId }),
}));

/** 按 ID 取设备（非响应式快照读取） */
export function getDeviceById(id: number | null): Device | undefined {
  if (id == null) return undefined;
  return useDeviceStore.getState().devices.find((d) => d.id === id);
}
