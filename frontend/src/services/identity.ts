/** 当前数据归属标识：由服务端会话决定，不写入 localStorage 作为登录依据。 */

export const LOCAL_OWNER = "local";

export function ownerKeyForUser(userId: number): string {
  return `user:${userId}`;
}

let currentOwner = LOCAL_OWNER;

export function getCurrentOwner(): string {
  return currentOwner;
}

export function setCurrentOwner(owner: string): void {
  currentOwner = owner;
}

/** 旧数据 / 游客数据统一归入独立的本机历史，不自动归属任何账号 */
export function itemOwner(ownerKey?: string): string {
  return ownerKey || LOCAL_OWNER;
}
