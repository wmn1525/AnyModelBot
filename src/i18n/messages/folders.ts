// folders：zh 与 en 的键必须一一对应（en 的类型由 zh 推出）。
// 工作文件夹（src/folders/）：接口按原因码回的短提示、交给模型的目录说明。
import type { Catalog } from "../types.js";

export const zh = {
  err_notAllowed: "不能选择这个位置，请选择具体的项目文件夹",
  err_unavailable: "无法访问这个文件夹，请重新选择",
  err_system: "系统不允许访问这个文件夹，请检查访问权限后再试",
  err_desktopOnly: "请在运行机器人的桌面端选择文件夹",
  err_changed: "发送条件已变化，请检查后再试",
  promptFolderGone: "[这条消息绑定的工作文件夹「{name}」现在不可用（{reason}）：不要读写其他位置的同名文件或改用别的目录，本轮不能修改文件。告诉用户这个文件夹已不可用，请重新选择后再试]",
  reasonUnavailable: "不在了、被替换或不是目录",
  reasonSystem: "系统不允许访问",
  reasonNotAllowed: "这个位置不能作为工作文件夹",
} satisfies Catalog;

export const en: Catalog<typeof zh> = {
  err_notAllowed: "This location can't be used. Choose a specific project folder.",
  err_unavailable: "Can't access this folder. Choose it again.",
  err_system: "The system has blocked access to this folder. Check its access permissions and try again.",
  err_desktopOnly: "Choose a folder in the desktop app on the bot's machine.",
  err_changed: "Sending conditions have changed. Check them and try again.",
  promptFolderGone: "[The work folder \"{name}\" bound to this message is no longer available ({reason}): do not read or write same-named files elsewhere or switch to another folder, and do not change files in this turn. Tell the user the folder is no longer available and to choose it again.]",
  reasonUnavailable: "it is gone, was replaced or is not a folder",
  reasonSystem: "the system blocks access to it",
  reasonNotAllowed: "this location can't be a work folder",
};
