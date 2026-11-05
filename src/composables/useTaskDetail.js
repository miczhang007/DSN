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
  nowLocalParts,
  splitIsoForInput,
} from "../lib/datetime.js";
import { taskStatus } from "../lib/labels.js";

const DRAG_THRESHOLD_PX = 5;

/**
 * @param {object} deps
 * @param {import("vue").Ref<string>}  deps.currentCategory
 * @param {import("vue").Ref<string>}  deps.view
 * @param {import("vue").Ref<boolean>} deps.menuOpen
 * @param {Function} deps.notify              错误提示
 * @param {import("vue").Ref<object>} deps.confirmation  确认弹窗状态
 * @param {import("vue").Ref<string>} deps.expandedHistoryTaskId
 * @param {Function} deps.refreshActiveTasks
 * @param {Function} deps.openCategoryManager     未选择分类时跳转分类管理
 * @param {Function} deps.openConfirmation    打开应用内确认弹窗
 */
export function useTaskDetail({
  currentCategory,
  view,
  menuOpen,
  notify,
  confirmation,
  expandedHistoryTaskId,
  refreshActiveTasks,
  openCategoryManager,
  openConfirmation,
}) {
  const selectedTask = ref(null);
  const taskEvents = ref([]);
  const milestones = ref([]);
  const milestoneDraft = reactive({ title: "", plannedAt: "", plannedAtTime: "" });
  const editingMilestoneId = ref(null);
  const expandedMilestoneId = ref("");
  const milestoneEditDraft = reactive({ title: "", plannedAt: "", plannedAtTime: "" });
  const editDraft = reactive({
    title: "",
    category: "",
    isUrgent: false,
    isFuture: false,
    startAt: "",
    startAtTime: "",
  });
  const milestoneFormOpen = ref(false);
  const progressDraft = ref("");
  const progressDate = ref("");
  const progressTime = ref("");
  const detailEditOpen = ref(false);
  const progressFormOpen = ref(false);
  const detailReturnView = ref("home");
  // 生命周期日志默认只展开任务主流程（创建/挂起/激活/进行中/完成/进度），
  // 字段修改与节点类日志折叠，点击“完整日志”后展开全部。
  const fullLogOpen = ref(false);
  // 生命周期日志行：点击展开删除入口（同时只展开一行）。
  const expandedEventId = ref(null);

  // —— 节点行：点击展开操作，按住拖动排序（与任务排序一致）——
  const milestoneListEl = ref(null);
  const milestoneDragging = ref(false);
  const milestoneDragIndex = ref(-1);
  const milestoneDragMoved = ref(false);
  const milestoneDragStartY = ref(0);
  let suppressMilestoneClick = false;

  async function openTask(task) {
    if (!currentCategory.value) {
      openCategoryManager();
      return;
    }
    menuOpen.value = false;
    expandedHistoryTaskId.value = "";
    detailReturnView.value = view.value === "history" ? "history" : view.value === "recurring-setting" ? "recurring-setting" : "home";
    selectedTask.value = task;
    editDraft.title = task.title;
    editDraft.category = task.owner || currentCategory.value;
    editDraft.isUrgent = Boolean(task.is_urgent);
    editDraft.isFuture = Boolean(task.start_at);
    const startParts = splitIsoForInput(task.start_at);
    editDraft.startAt = startParts.date;
    editDraft.startAtTime = startParts.time;
    detailEditOpen.value = false;
    progressFormOpen.value = false;
    fullLogOpen.value = false;
    expandedEventId.value = null;
    expandedMilestoneId.value = "";
    editingMilestoneId.value = null;
    milestoneFormOpen.value = false;
    progressDraft.value = "";
    // 进度完成时间默认当前时间，可在展开的面板里改成实际完成时间。
    const nowParts = nowLocalParts();
    progressDate.value = nowParts.date;
    progressTime.value = nowParts.time;
    taskEvents.value = await invoke("get_task_events", {
      owner: currentCategory.value,
      taskId: task.id,
    });
    taskEvents.value = [...taskEvents.value].sort(compareEventTime);
    milestones.value = task.is_recurring
      ? []
      : await invoke("list_milestones", {
          owner: currentCategory.value,
          taskId: task.id,
        });
    view.value = "detail";
  }

  // 切换或删除分类时清空详情页残留状态，避免把上一个分类的数据带过来。
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
        await invoke("suspend_task", { owner: currentCategory.value, taskId });
      } else if (action === "activate") {
        await invoke("activate_task", { owner: currentCategory.value, taskId });
      } else if (action === "start") {
        await invoke("start_task", { owner: currentCategory.value, taskId });
      } else if (action === "complete") {
        await invoke("complete_task", { owner: currentCategory.value, taskId, completedAt: null });
      } else if (action === "undo_complete") {
        await invoke("undo_complete_task", { owner: currentCategory.value, taskId });
      } else if (action === "archive") {
        if (taskStatus(selectedTask.value) === "completed") {
          await invoke("archive_task", { owner: currentCategory.value, taskId, isCompleted: true });
        } else {
          confirmArchiveTask(taskId);
          return;
        }
      }
      const updated = await invoke("get_task", {
        owner: currentCategory.value,
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
      await invoke("complete_task", { owner: currentCategory.value, taskId, completedAt });
      await refreshActiveTasks();
      if (view.value === "detail" && selectedTask.value?.id === taskId) {
        const updated = await invoke("get_task", {
          owner: currentCategory.value,
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
        owner: currentCategory.value,
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
        owner: currentCategory.value,
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
    const targetCategory = editDraft.category || selectedTask.value.owner || currentCategory.value;
    const movedCategory = targetCategory !== (selectedTask.value.owner || currentCategory.value);
    await invoke("update_task", {
      owner: currentCategory.value,
      taskId: selectedTask.value.id,
      title: editDraft.title,
      deadlineAt: null,
      isUrgent: editDraft.isUrgent,
      startAt:
        !selectedTask.value.is_recurring && editDraft.isFuture && editDraft.startAt
          ? dateTimeToIso(editDraft.startAt, editDraft.startAtTime)
          : null,
      newOwner: movedCategory ? targetCategory : null,
    });
    if (movedCategory) {
      // 任务已迁移到别的分类：回到列表（当前分类里已经看不到这条任务了）。
      selectedTask.value = null;
      view.value = "home";
      await refreshActiveTasks();
      return;
    }
    const refreshed = await invoke("get_task", {
      owner: currentCategory.value,
      taskId: selectedTask.value.id,
    });
    await openTask(refreshed);
  }

  async function reloadTaskDetail() {
    if (!selectedTask.value) return;
    const updated = await invoke("get_task", {
      owner: currentCategory.value,
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

  /** 「添加节点」与「进度」两个内联面板互斥展开，避免同时占用详情页空间。 */
  function toggleMilestoneForm() {
    milestoneFormOpen.value = !milestoneFormOpen.value;
    if (milestoneFormOpen.value) progressFormOpen.value = false;
  }

  function toggleProgressForm() {
    progressFormOpen.value = !progressFormOpen.value;
    if (progressFormOpen.value) {
      milestoneFormOpen.value = false;
      // 每次展开都把“进度完成时间”重置为当前时间，需要时再改成实际完成时间。
      const nowParts = nowLocalParts();
      progressDate.value = nowParts.date;
      progressTime.value = nowParts.time;
    }
  }

  async function addMilestone() {
    if (!selectedTask.value || !milestoneDraft.title) return;
    await invoke("add_milestone", {
      owner: currentCategory.value,
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
      owner: currentCategory.value,
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
      owner: currentCategory.value,
      taskId: selectedTask.value.id,
      milestoneId: milestone.id,
    });
    await reloadTaskDetail();
    // 撤销完成后节点可能回到“进行中/未开始”，保持当前行展开便于继续操作。
    expandedMilestoneId.value = milestone.id;
  }

  /** 节点标记为进行中：仅未完成节点可开始，完成后可撤销进行中。 */
  async function startMilestone(milestone) {
    if (!selectedTask.value) return;
    try {
      await invoke("start_milestone", {
        owner: currentCategory.value,
        taskId: selectedTask.value.id,
        milestoneId: milestone.id,
      });
      await reloadTaskDetail();
      expandedMilestoneId.value = milestone.id;
    } catch (err) {
      if (notify) notify(err, "节点操作失败");
    }
  }

  async function undoStartMilestone(milestone) {
    if (!selectedTask.value) return;
    try {
      await invoke("undo_start_milestone", {
        owner: currentCategory.value,
        taskId: selectedTask.value.id,
        milestoneId: milestone.id,
      });
      await reloadTaskDetail();
      expandedMilestoneId.value = milestone.id;
    } catch (err) {
      if (notify) notify(err, "节点操作失败");
    }
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
      owner: currentCategory.value,
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
      owner: currentCategory.value,
      taskId: selectedTask.value.id,
      progress: progressDraft.value,
      recordedAt: dateTimeToIso(progressDate.value, progressTime.value),
    });
    const updated = await invoke("get_task", {
      owner: currentCategory.value,
      taskId: selectedTask.value.id,
    });
    await openTask(updated);
  }

  /** 点击日志行展开操作入口；再点一次收起。 */
  function toggleEventActions(event) {
    expandedEventId.value = expandedEventId.value === event.id ? null : event.id;
  }

  // 生命周期日志（所有类型）都可删除：只删日志行，不影响任务、节点与进度数据本身。
  function deleteTaskEvent(event) {
    if (!selectedTask.value) return;
    const taskId = selectedTask.value.id;
    openConfirmation("删除日志", "确定删除这条生命周期日志吗？此操作不能恢复。", () =>
      removeTaskEvent(taskId, event.id),
    );
  }

  async function removeTaskEvent(taskId, eventId) {
    try {
      await invoke("delete_task_event", {
        owner: currentCategory.value,
        taskId,
        eventId,
      });
      if (expandedEventId.value === eventId) expandedEventId.value = null;
      const updated = await invoke("get_task", {
        owner: currentCategory.value,
        taskId,
      });
      await openTask(updated);
    } catch (err) {
      if (notify) notify(err, "删除日志失败");
    }
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
        await invoke("archive_task", { owner: currentCategory.value, taskId, isCompleted: state.isCompleted });
        await refreshActiveTasks();
        if (view.value === "detail" && selectedTask.value?.id === taskId) {
          const updated = await invoke("get_task", { owner: currentCategory.value, taskId });
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
    fullLogOpen,
    expandedEventId,
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
    toggleMilestoneForm,
    toggleProgressForm,
    addMilestone,
    startMilestoneEdit,
    cancelMilestoneEdit,
    saveMilestoneEdit,
    undoCompleteMilestone,
    startMilestone,
    undoStartMilestone,
    deleteMilestone,
    isMilestoneOverdue,
    saveTaskProgress,
    toggleEventActions,
    deleteTaskEvent,
  };
}
