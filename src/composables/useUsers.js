// 本地用户管理：用户列表、当前用户与增删改切换。
//
// 说明：这里没有账号体系，用户只是本地数据归属（owner）的昵称，
// 列表保存在 localStorage，任务数据在 SQLite。

import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { loadUsers, normalizeUserName, saveUsers } from "../lib/user-storage.js";

/**
 * @param {object} deps
 * @param {import("vue").Ref<string>} deps.currentUser      当前用户（由 App 持有）
 * @param {import("vue").Ref<string>} deps.view            当前视图，切换用户后需要改动
 * @param {Function} deps.openConfirmation                打开应用内确认弹窗
 * @param {Function} deps.resetDetailState                清空详情页残留状态
 * @param {Function} deps.refreshActiveTasks              重新加载待办列表
 */
export function useUsers({ currentUser, view, openConfirmation, resetDetailState, refreshActiveTasks }) {
  const users = ref([]);
  const userDraft = ref("");
  const userFormOpen = ref(false);
  const editingUser = ref("");
  const editUserDraft = ref("");

  /** 从 localStorage 恢复当前用户与用户列表（启动时调用）。 */
  function hydrate() {
    currentUser.value = localStorage.getItem("current-user") || "";
    users.value = loadUsers();
    if (currentUser.value && !users.value.includes(currentUser.value)) {
      users.value.unshift(currentUser.value);
      saveUsers(users.value);
    }
  }

  async function addUser() {
    const nextUser = normalizeUserName(userDraft.value);
    if (!nextUser || users.value.includes(nextUser)) return;
    users.value.push(nextUser);
    saveUsers(users.value);
    userDraft.value = "";
    userFormOpen.value = false;
    await switchUser(nextUser);
  }

  function openUserForm() {
    userFormOpen.value = true;
  }

  function closeUserForm() {
    userDraft.value = "";
    userFormOpen.value = false;
  }

  async function switchUser(user) {
    currentUser.value = user;
    localStorage.setItem("current-user", user);
    resetDetailState();
    editingUser.value = "";
    view.value = "home";
    await refreshActiveTasks();
  }

  function startEditUser(user) {
    editingUser.value = user;
    editUserDraft.value = user;
  }

  function cancelEditUser() {
    editingUser.value = "";
    editUserDraft.value = "";
  }

  async function saveUserName(oldUser) {
    const nextUser = normalizeUserName(editUserDraft.value);
    if (!nextUser) return;
    if (nextUser !== oldUser && users.value.includes(nextUser)) return;

    await invoke("rename_user_data", { oldOwner: oldUser, newOwner: nextUser });
    users.value = users.value.map((user) => (user === oldUser ? nextUser : user));
    saveUsers(users.value);
    if (currentUser.value === oldUser) {
      currentUser.value = nextUser;
      localStorage.setItem("current-user", nextUser);
    }
    cancelEditUser();
    await refreshActiveTasks();
  }

  async function deleteUser(user) {
    openConfirmation(
      "删除用户",
      `确定删除用户“${user}”吗？删除后该用户的待办、历史任务和生命周期记录都将被永久删除，不能恢复。`,
      () => removeUser(user),
    );
  }

  async function removeUser(user) {
    await invoke("delete_user_data", { owner: user });
    users.value = users.value.filter((item) => item !== user);
    saveUsers(users.value);
    if (currentUser.value === user) {
      currentUser.value = users.value[0] || "";
      if (currentUser.value) {
        localStorage.setItem("current-user", currentUser.value);
        view.value = "home";
      } else {
        localStorage.removeItem("current-user");
        view.value = "users";
      }
    }
    resetDetailState();
    await refreshActiveTasks();
  }

  return {
    users,
    userDraft,
    userFormOpen,
    editingUser,
    editUserDraft,
    hydrate,
    addUser,
    openUserForm,
    closeUserForm,
    switchUser,
    startEditUser,
    cancelEditUser,
    saveUserName,
    deleteUser,
    removeUser,
  };
}
