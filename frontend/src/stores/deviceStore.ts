import { create } from "zustand";

import { deviceService } from "../services/deviceService";
import type { Device, DeviceForm } from "../types/device";

/** 设备列表（服务端为数据源，不做本地 persist） */
interface DeviceState {
  devices: Device[];
  loading: boolean;
  error: string | null;
  /** P1 预选 / P7 当前设备 */
  selectedId: number | null;
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
  selectedId: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const devices = await deviceService.list();
      set({ devices, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  add: async (form) => {
    const d = await deviceService.create(form);
    set({ devices: [...get().devices, d] });
  },

  update: async (id, form) => {
    const d = await deviceService.update(id, form);
    set({ devices: get().devices.map((x) => (x.id === id ? d : x)) });
  },

  remove: async (id) => {
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
