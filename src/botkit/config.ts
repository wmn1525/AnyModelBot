/**
 * 官方目录随 App 内置，默认不请求线上目录，也不读取旧的线上目录缓存。
 * AMB_CATALOG=off 时关闭目录。开发时可显式配置远程目录地址和公钥。
 */
import path from "node:path";
import { findAppRoot } from "../magpie/supervisor.js";
import type { CatalogOptions } from "./catalog.js";

// 仅用于显式连接旧的签名目录；内置目录由应用安装包提供。
export const CATALOG_PUBLIC_KEY = "MCowBQYDK2VwAyEAIWnm1eaGbKq044+gMkJ44g1vCeBAE6ZknayyT0ozEZ8=";

export function catalogConfig(env: NodeJS.ProcessEnv = process.env, root = findAppRoot()): Pick<CatalogOptions, "bundledDir" | "url" | "publicKey"> {
  if (env.AMB_CATALOG === "off") return {};
  if (env.AMB_CATALOG_URL) return { url: env.AMB_CATALOG_URL, publicKey: env.AMB_CATALOG_PUBKEY || CATALOG_PUBLIC_KEY };
  return { bundledDir: path.join(root, "dist", "catalog") };
}
