// 任务详情：任务/节点/进度/生命周期的读取与维护。
//
// 包含详情页的全部状态与操作，以及完成、归档、挂起、激活等动作；
// 完成与删除类操作仍通过父级注入的确认弹窗与提示来收口。

import { onUnmounted, reactive, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import {
  compareEventTime,
  dateTimeToIso,
  defaultStartTime,
  localDateInputValue,
  nowLocalParts,
  splitIsoForInput,
} from "../lib/datetime.js";
import { taskStatus } from "../lib/labels.js";

const DRAG_THRESHOLD_PX = 5;

/**
 * @param {object} deps
 * @param {import("vue").Ref<string>}  deps.currentUser
 * @param {import("vue").Ref<string>}  deps.view
 * @param {import("vue").Ref<boolean>} deps.menuOpen
 * @param {Function} deps.notify              错误提示
 * @param {import("vue").Ref<object>} deps.confirmation  确认弹窗状态
 * @param {import("vue").Ref<string>} deps.expandedHistoryTaskId
 * @param {Function} deps.refreshActiveTasks
 * @param {Function} deps.openUserManager     未选择用户时跳转用户管理
 * @param {Function} deps.openConfirmation    打开应用内确认弹窗
 */
export function useTaskDetail({
  currentUser,
  view,
  menuOpen,
  notify,
  confirmation,
  expandedHistoryTaskId,
  refreshActiveTasks,
  openUserManager,
  openConfirmation,
}) {
  const selectedTask = ref(null);
  const taskEvents = ref([]);
  const milestones = ref([]);
  const milestoneDraft = reactive({ title: "", plannedAt: "", plannedAtTime: "" });
  const editingMilestoneId = ref(null);
  const expandedMilestoneId = ref("");
  const milestoneEditDraft = reactive({ title: "", plannedAt: "", plannedAtTime: "" });
  const editDraft = reactive({ title: "", isUrgent: false, isFuture: false, startAt: "", startAtTime: "" });
  const milestoneFormOpen = ref(false);
  const progressDraft = ref("");
  const progressDate = ref("");
  const progressTime = ref("");
  const detailEditOpen = ref(false);
  const progressFormOpen = ref(false);
  const detailReturnView = ref("home");

  // —— 节点行：点击展开操作，按住拖动排序（与任务排序一致）——
  const milestoneListEl = ref(null);
  const milestoneDragging = ref(false);
  const milestoneDragIndex = ref(-1);
  const milestoneDragMoved = ref(false);
  const milestoneDragStartY = ref(0);
  let suppressMilestoneClick = false;

  async function openTask(task) {
    if (!currentUser.value) {
      openUserManager();
      return;
    }
    menuOpen.value = false;
    expandedHistoryTaskId.value = "";
    detailReturnView.value = view.value === "history" ? "history" : view.value === "recurring-setting" ? "recurring-setting" : "home";
    selectedTask.value = task;
    editDraft.title = task.title;
    editDraft.isUrgent = Boolean(task.is_urgent);
    editDraft.isFuture = Boolean(task.start_at);
    const startParts = splitIsoForInput(task.start_at);
    editDraft.startAt = startParts.date;
    editDraft.startAtTime = startParts.time;
    detailEditOpen.value = false;
    progressFormOpen.value = false;
    expandedMilestoneId.value = "";
    editingMilestoneId.value = null;
    milestoneFormOpen.value = false;
    progressDraft.value = "";
    // 记录时间默认不指定：日期为今天，具体时间留空（未指定时仅按日期记录）。
    progressDate.value = localDateInputValue();
    progressTime.value = "";
    taskEvents.value = await invoke("get_task_events", {
      owner: currentUser.value,
      taskId: task.id,
    });
    taskEvents.value = [...taskEvents.value].sort(compareEventTime);
    milestones.value = task.is_recurring
      ? []
      : await invoke("list_milestones", {
          owner: currentUser.value,
          taskId: task.id,
        });
    view.value = "detail";
  }

  // 切换或删除用户时清空详情页残留状态，避免把上一个用户的数据带过来。
  function resetDetailState() {
    selectedTask.value = null;
    taskEvents.value = [];
    milestones.value = [];
  }

  function toggleDetailEdit() {
    detailEditOpen.value = !detailEditOpen.value;
    if (!detailEditOpen.value) editingMilestoneId.value = null;
  }

  function toggleEditFutureTask() {
    if (editDraft.isFuture && !editDraft.startAt) {
      editDraft.startAt = defaultStartTime();
    }
  }

  async function detailAction(action) {
    if (!selectedTask.value) return;
    const taskId = selectedTask.value.id;
    try {
      if (action === "suspend") {
        await invoke("suspend_task", { owner: currentUser.value, taskId });
      } else if (action === "activate") {
        await invoke("activate_task", { owner: currentUser.value, taskId });
      } else if (action === "start") {
        await invoke("start_task", { owner: currentUser.value, taskId });
      } else if (action === "complete") {
        await invoke("complete_task", { owner: currentUser.value, taskId, completedAt: null });
      } else if (action === "undo_complete") {
        await invoke("undo_complete_task", { owner: currentUser.value, taskId });
      } else if (action === "archive") {
        if (taskStatus(selectedTask.value) === "completed") {
          await invoke("archive_task", { owner: currentUser.value, taskId, isCompleted: true });
        } else {
          confirmArchiveTask(taskId);
          return;
        }
      }
      const updated = await invoke("get_task", {
        owner: currentUser.value,
        taskId,
      });
      await openTask(updated);
      await refreshActiveTasks();
    } catch (err) {
      if (notify) notify(err, "任务操作失败");
    }
  }

  // 周期任务标记完成无需确认完成时间，直接完成（当前时刻）；普通任务弹窗确认。
  function completeTaskEntry(task) {
    if (task.is_recurring) {
      performComplete(task.id, null);
    } else {
      openCompleteDialog(task.id);
    }
  }

  function detailCompleteEntry() {
    if (!selectedTask.value) return;
    if (selectedTask.value.is_recurring) {
      performComplete(selectedTask.value.id, null);
    } else {
      openCompleteDialog(selectedTask.value.id);
    }
  }

  // 列表画圈、详情页「已完成」与节点完成：弹窗选择完成时间
  // （时间默认为不指定，未指定时仅按日期记录）。
  function openCompleteDialog(taskId) {
    const today = nowLocalParts().date;
    const state = reactive({ completedDate: today, completedTime: "" });
    confirmation.value = {
      title: "完成任务",
      titleId: "confirm-dialog-title",
      kind: "complete",
      state,
      actionLabel: "确认完成",
      action: async () => {
        await performComplete(taskId, dateTimeToIso(state.completedDate, state.completedTime));
      },
    };
  }

  async function performComplete(taskId, completedAt) {
    try {
      await invoke("complete_task", { owner: currentUser.value, taskId, completedAt });
      await refreshActiveTasks();
      if (view.value === "detail" && selectedTask.value?.id === taskId) {
        const updated = await invoke("get_task", {
          owner: currentUser.value,
          taskId,
        });
        await openTask(updated);
      }
    } catch (err) {
      if (notify) notify(err, "任务操作失败");
    }
  }

  function openNodeCompleteDialog(milestone) {
    if (!selectedTask.value || milestone.completed_at) return;
    const today = nowLocalParts().date;
    const state = reactive({ completedDate: today, completedTime: "" });
    confirmation.value = {
      title: "完成节点",
      titleId: "confirm-dialog-title",
      kind: "complete",
      state,
      actionLabel: "确认完成",
      action: async () => {
        await performNodeComplete(milestone.id, dateTimeToIso(state.completedDate, state.completedTime));
      },
    };
  }

  async function performNodeComplete(milestoneId, completedAt) {
    try {
      await invoke("complete_milestone", {
        owner: currentUser.value,
        taskId: selectedTask.value.id,
        milestoneId,
        completedAt,
      });
      await reloadTaskDetail();
    } catch (err) {
      if (notify) notify(err, "节点操作失败");
    }
  }

  function startMilestoneDrag(event, index) {
    if (event.button !== 0) return;
    suppressMilestoneClick = false;
    milestoneDragMoved.value = false;
    milestoneDragStartY.value = event.clientY;
    milestoneDragging.value = true;
    milestoneDragIndex.value = index;
    window.addEventListener("mousemove", onMilestoneDragMove);
    window.addEventListener("mouseup", endMilestoneDrag);
  }

  function onMilestoneDragMove(event) {
    if (!milestoneDragging.value) return;
    if (!milestoneDragMoved.value && Math.abs(event.clientY - milestoneDragStartY.value) < DRAG_THRESHOLD_PX) return;
    milestoneDragMoved.value = true;
    const rows = milestoneListEl.value?.querySelectorAll(".milestone-row");
    if (!rows) return;
    let target = -1;
    for (let i = 0; i < rows.length; i++) {
      const rect = rows[i].getBoundingClientRect();
      if (event.clientY >= rect.top && event.clientY <= rect.bottom) {
        target = i;
        break;
      }
    }
    if (target !== -1 && target !== milestoneDragIndex.value) {
      const list = [...milestones.value];
      const [moved] = list.splice(milestoneDragIndex.value, 1);
      list.splice(target, 0, moved);
      milestones.value = list;
      milestoneDragIndex.value = target;
    }
  }

  function endMilestoneDrag() {
    if (!milestoneDragging.value) return;
    milestoneDragging.value = false;
    window.removeEventListener("mousemove", onMilestoneDragMove);
    window.removeEventListener("mouseup", endMilestoneDrag);
    if (milestoneDragMoved.value) {
      suppressMilestoneClick = true;
      persistMilestoneOrder();
    }
    milestoneDragIndex.value = -1;
    milestoneDragMoved.value = false;
  }

  async function persistMilestoneOrder() {
    if (!selectedTask.value) return;
    try {
      await invoke("reorder_milestones", {
        owner: currentUser.value,
        taskId: selectedTask.value.id,
        orderedIds: milestones.value.map((milestone) => milestone.id),
      });
    } catch (err) {
      if (notify) notify(err, "保存节点排序失败");
      await reloadTaskDetail();
    }
  }

  function handleMilestoneMainClick(milestone) {
    if (suppressMilestoneClick) {
      suppressMilestoneClick = false;
      return;
    }
    expandedMilestoneId.value = expandedMilestoneId.value === milestone.id ? "" : milestone.id;
  }

  async function saveTaskChanges() {
    if (!selectedTask.value) return;
    if (!editDraft.title) return;
    await invoke("update_task", {
      owner: currentUser.value,
      taskId: selectedTask.value.id,
      title: editDraft.title,
      deadlineAt: null,
      isUrgent: editDraft.isUrgent,
      startAt:
        !selectedTask.value.is_recurring && editDraft.isFuture && editDraft.startAt
          ? dateTimeToIso(editDraft.startAt, editDraft.startAtTime)
          : null,
    });
    const updated = await invoke("get_task", {
      owner: currentUser.value,
      taskId: selectedTask.value.id,
    });
    await openTask(updated);
  }

  async function reloadTaskDetail() {
    if (!selectedTask.value) return;
    const updated = await invoke("get_task", {
      owner: currentUser.value,
      taskId: selectedTask.value.id,
    });
    await openTask(updated);
  }

  function openMilestoneForm() {
    milestoneFormOpen.value = true;
  }

  function closeMilestoneForm() {
    milestoneDraft.title = "";
    milestoneDraft.plannedAt = "";
    milestoneDraft.plannedAtTime = "";
    milestoneFormOpen.value = false;
  }

  async function addMilestone() {
    if (!selectedTask.value || !milestoneDraft.title) return;
    await invoke("add_milestone", {
      owner: currentUser.value,
      taskId: selectedTask.value.id,
      title: milestoneDraft.title,
      plannedAt: dateTimeToIso(milestoneDraft.plannedAt, milestoneDraft.plannedAtTime),
    });
    milestoneDraft.title = "";
    milestoneDraft.plannedAt = "";
    milestoneDraft.plannedAtTime = "";
    milestoneFormOpen.value = false;
    await reloadTaskDetail();
  }

  function startMilestoneEdit(milestone) {
    editingMilestoneId.value = milestone.id;
    expandedMilestoneId.value = "";
    milestoneEditDraft.title = milestone.title;
    const parts = splitIsoForInput(milestone.planned_at);
    milestoneEditDraft.plannedAt = parts.date;
    milestoneEditDraft.plannedAtTime = parts.time;
  }

  function cancelMilestoneEdit() {
    editingMilestoneId.value = null;
  }

  async function saveMilestoneEdit(milestone) {
    if (!selectedTask.value || !milestoneEditDraft.title) return;
    await invoke("update_milestone", {
      owner: currentUser.value,
      taskId: selectedTask.value.id,
      milestoneId: milestone.id,
      title: milestoneEditDraft.title,
      plannedAt: dateTimeToIso(milestoneEditDraft.plannedAt, milestoneEditDraft.plannedAtTime),
    });
    editingMilestoneId.value = null;
    await reloadTaskDetail();
  }

  async function undoCompleteMilestone(milestone) {
    if (!selectedTask.value) return;
    await invoke("undo_complete_milestone", {
      owner: currentUser.value,
      taskId: selectedTask.value.id,
      milestoneId: milestone.id,
    });
    expandedMilestoneId.value = "";
    await reloadTaskDetail();
  }

  function deleteMilestone(milestone) {
    openConfirmation(
      "删除节点",
      `确定删除节点“${milestone.title}”吗？此操作不能恢复。`,
      () => removeMilestone(milestone),
    );
  }

  async function removeMilestone(milestone) {
    if (!selectedTask.value) return;
    await invoke("delete_milestone", {
      owner: currentUser.value,
      taskId: selectedTask.value.id,
      milestoneId: milestone.id,
    });
    await reloadTaskDetail();
  }

  function isMilestoneOverdue(plannedAt) {
    if (!plannedAt) return false;
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(plannedAt) ? `${plannedAt}T00:00:00` : plannedAt;
    return new Date(normalized).getTime() < Date.now();
  }

  async function saveTaskProgress() {
    if (!selectedTask.value || !progressDraft.value) return;
    await invoke("add_task_progress", {
      owner: currentUser.value,
      taskId: selectedTask.value.id,
      progress: progressDraft.value,
      recordedAt: dateTimeToIso(progressDate.value, progressTime.value),
    });
    const updated = await invoke("get_task", {
      owner: currentUser.value,
      taskId: selectedTask.value.id,
    });
    await openTask(updated);
  }

  async function deleteTaskProgress(event) {
    if (!selectedTask.value) return;
    const taskId = selectedTask.value.id;
    openConfirmation("删除进度", "确定删除这条进度记录吗？此操作不能恢复。", () =>
      removeTaskProgress(taskId, event.id),
    );
  }

  async function removeTaskProgress(taskId, eventId) {
    await invoke("delete_task_progress", {
      owner: currentUser.value,
      taskId,
      eventId,
    });
    const updated = await invoke("get_task", {
      owner: currentUser.value,
      taskId,
    });
    await openTask(updated);
  }

  function confirmArchiveTask(taskId) {
    const state = { isCompleted: false };
    confirmation.value = {
      title: "归档任务",
      message: "是否已完成此任务？勾选后将同时记录完成和归档；不勾选则只记录归档。",
      actionLabel: "提交",
      titleId: "confirm-dialog-title",
      kind: "archive",
      isCompleted: false,
      state,
      action: async () => {
        await invoke("archive_task", { owner: currentUser.value, taskId, isCompleted: state.isCompleted });
        await refreshActiveTasks();
        if (view.value === "detail" && selectedTask.value?.id === taskId) {
          const updated = await invoke("get_task", { owner: currentUser.value, taskId });
          await openTask(updated);
        }
      },
    };
  }

  onUnmounted(() => {
    window.removeEventListener("mousemove", onMilestoneDragMove);
    window.removeEventListener("mouseup", endMilestoneDrag);
  });

  return {
    selectedTask,
    taskEvents,
    milestones,
    milestoneDraft,
    editingMilestoneId,
    expandedMilestoneId,
    milestoneEditDraft,
    editDraft,
    milestoneFormOpen,
    progressDraft,
    progressDate,
    progressTime,
    detailEditOpen,
    progressFormOpen,
    detailReturnView,
    milestoneListEl,
    milestoneDragging,
    milestoneDragIndex,
    milestoneDragMoved,
    openTask,
    resetDetailState,
    detailAction,
    toggleDetailEdit,
    toggleEditFutureTask,
    completeTaskEntry,
    detailCompleteEntry,
    openNodeCompleteDialog,
    startMilestoneDrag,
    onMilestoneDragMove,
    endMilestoneDrag,
    handleMilestoneMainClick,
    saveTaskChanges,
    reloadTaskDetail,
    openMilestoneForm,
    closeMilestoneForm,
    addMilestone,
    startMilestoneEdit,
    cancelMilestoneEdit,
    saveMilestoneEdit,
    undoCompleteMilestone,
    deleteMilestone,
    isMilestoneOverdue,
    saveTaskProgress,
    deleteTaskProgress,
  };
}
