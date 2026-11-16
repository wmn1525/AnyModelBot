import { describe, expect, it } from "vitest";
import { accountProfile } from "../src/account/profile.js";
describe("账户基本资料显示", () => {
  it("名称按昵称、自设用户名（mf_ 开头的系统用户名不算）、完整邮箱回退；都没有时为空", () => {
    const base = { nickname: " Ada ", username: "ada-l", email: "ada@example.com", phone: "13812341234" };
    expect(accountProfile(base)).toMatchObject({ name: "Ada", nameFrom: "nickname", email: "ada@example.com" });
    expect(accountProfile({ ...base, nickname: "" })).toMatchObject({ name: "ada-l", nameFrom: "username" });
    expect(accountProfile({ ...base, nickname: "", username: "mf_a1b2" })).toMatchObject({ name: "ada@example.com", nameFrom: "email" });
    // 电话不再拿来当名称：没有昵称、用户名、邮箱时界面显示「Modelflare 账号」
    expect(accountProfile({ ...base, nickname: "", username: "mf_a1b2", email: "" }).name).toBe("");
    expect(accountProfile({ username: "mf_a1b2" })).toEqual({ name: "", email: "", avatar: "" });
    expect(accountProfile({ name: "mf_a1b2", username: "mf_a1b2", email: "ada@example.com" }).name).toBe("ada@example.com");
    expect(accountProfile({ display_name: "Melody", email: "melody.chen.product.team@example.com" })).toMatchObject({ name: "Melody", email: "melody.chen.product.team@example.com" });
  });
  it("接受标准用户信息字段；头像仅使用 https，电话不进入缓存，不像邮箱的 email 不用", () => {
    expect(accountProfile({ name: "Alice", preferred_username: "alice", picture: "https://example.com/me.png" })).toEqual({ name: "Alice", nameFrom: "username", avatar: "https://example.com/me.png", email: "" });
    expect(accountProfile({ phone_number: "+86 13812341234", avatar_url: "javascript:alert(1)" })).toEqual({ name: "", email: "", avatar: "" });
    expect(accountProfile({ email: "not-an-email" })).toEqual({ name: "", email: "", avatar: "" });
  });
});
