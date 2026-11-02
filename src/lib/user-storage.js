// 本地用户列表的读写。
//
// 业务数据（任务、节点、生命周期）全部在 SQLite；localStorage 只保存
// "当前使用哪个本地昵称"以及这里的用户列表，二者都不是云端身份。

const USERS_KEY = "users";

export function normalizeUserName(value) {
  return String(value || "").trim();
}

export function loadUsers() {
  try {
    const savedUsers = JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
    return Array.isArray(savedUsers)
      ? savedUsers.map(normalizeUserName).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

export function saveUsers(list) {
  localStorage.setItem(USERS_KEY, JSON.stringify(list));
}
