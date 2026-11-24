import { defineConfig } from "vitest/config";
export default defineConfig({
  // AMB_CATALOG：测试里启动的 App 不去连线上的目录。
  // AMB_LANG：服务端"跟随系统"时的语言（src/i18n）。测试固定用简体中文，不受开发机 LANG 影响；英文由 i18n 测试单独覆盖
  // setupFiles：管理接口在回环上也要令牌，测试里发给它的 fetch 自动带上（test/setup.ts）
  test: { include: ["test/**/*.test.ts"], setupFiles: ["test/setup.ts"], testTimeout: 30_000, hookTimeout: 60_000, pool: "forks", fileParallelism: false, env: { AMB_LANG: "zh-CN", AMB_CATALOG: "off" } },
});
