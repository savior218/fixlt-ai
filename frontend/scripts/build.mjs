/**
 * 构建脚本：先类型检查（tsc），再打包（vite build）。
 *
 * 背景：项目路径包含 “&” 字符，npm 默认的 cmd.exe script-shell 会把
 * PATH 中的 “&” 解析为命令分隔符，导致 node_modules/.bin 的 tsc/vite
 * 命令解析失败；同时 PowerShell 5 不支持 “&&” 串联。
 * 因此本脚本直接以 node 子进程方式按顺序执行两步，不依赖 shell 特性。
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const node = process.execPath;

function resolveBin(pkg, binFile) {
  const local = join(root, "node_modules", pkg, binFile);
  if (existsSync(local)) return local;
  throw new Error(`未找到 ${pkg}，请先运行 npm install`);
}

function run(nodeArgs, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(node, nodeArgs, { cwd: root, stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} 失败，退出码 ${code}`));
    });
  });
}

try {
  await run([resolveBin("typescript", "bin/tsc"), "-p", "tsconfig.json"], "类型检查 tsc");
  await run(
    [resolveBin("vite", "bin/vite.js"), "build", ...process.argv.slice(2)],
    "打包 vite build"
  );
  console.log("构建完成");
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
