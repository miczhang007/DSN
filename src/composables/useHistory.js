// 历史任务：归档列表、撤销完成/归档、删除。
//
// 「仅撤销完成 / 撤销完成并撤销归档」通过确认弹窗的多选项提供。

import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { localDateInputValue } from "../lib/datetime.js";

/**
 * @param {object} deps
 * @param {import("vue").Ref<string>}  deps.currentCategory
 * @param {import("vue").Ref<string>}  deps.view
 * @param {import("vue").Ref<boolean>} deps.menuOpen
 * @param {Function} deps.notify                错误提示
 * @param {import("vue").Ref<object>}  deps.confirmation
 * @param {import("vue").Ref<string>}  deps.expandedHistoryTaskId
 * @param {Function} deps.openConfirmation
 * @param {Function} deps.refreshActiveTasks
 * @param {Function} deps.openCategoryManager
 */
export function useHistory({
  currentCategory,
  view,
  menuOpen,
  notify,
  confirmation,
  expandedHistoryTaskId,
  openConfirmation,
  refreshActiveTasks,
  openCategoryManager,
}) {
  const archivedTasks = ref([]);

  async function loadArchivedTasks() {
    archivedTasks.value = await invoke("list_archived_tasks", { owner: currentCategory.value });
  }

  async function openHistory() {
    if (!currentCategory.value) {
      openCategoryManager();
      return;
    }
    menuOpen.value = false;
    expandedHistoryTaskId.value = "";
    view.value = "history";
    await loadArchivedTasks();
  }

  function toggleHistoryActions(taskId) {
    expandedHistoryTaskId.value = expandedHistoryTaskId.value === taskId ? "" : taskId;
  }

  function resetHistoryState() {
    archivedTasks.value = [];
  }

  async function historyAction(task, action) {
    if (action === "undo_completion") {
      openUndoCompletionConfirmation(task);
      return;
    }
    await runHistoryAction(task, action);
  }

  async function runHistoryAction(task, action) {
    try {
      await invoke("restore_archived_task", { owner: currentCategory.value, taskId: task.id, action });
      await loadArchivedTasks();
      await refreshActiveTasks();
      expandedHistoryTaskId.value = "";
    } catch (err) {
      if (notify) notify(err, "历史任务操作失败");
    }
  }

  function openUndoCompletionConfirmation(task) {
    expandedHistoryTaskId.value = "";
    confirmation.value = {
      title: "撤销完成",
      message: "是否同时撤销归档状态，将该任务重新加入当前任务列表？",
      titleId: "confirm-dialog-title",
      kind: "delete",
      choices: [
        { label: "仅撤销完成", action: () => runHistoryAction(task, "undo_completion_only") },
        { label: "撤销完成并撤销归档", danger: true, action: () => runHistoryAction(task, "undo_completion") },
      ],
    };
  }

  function canUndoTask(task) {
    return !task.is_recurring || String(task.occurrence_date || "").startsWith(localDateInputValue());
  }

  function deleteArchivedTask(task) {
    openConfirmation("删除任务", `确定删除“${task.title}”吗？删除后将从历史和任务列表中隐藏。`, async () => {
      await invoke("delete_task", { owner: currentCategory.value, taskId: task.id });
      view.value = "history";
      await loadArchivedTasks();
    });
  }

  return {
    archivedTasks,
    openHistory,
    toggleHistoryActions,
    resetHistoryState,
    historyAction,
    canUndoTask,
    deleteArchivedTask,
    loadArchivedTasks,
  };
}
