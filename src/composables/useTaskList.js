// 待办列表：加载、未来任务到点自动刷新、鼠标拖拽手工排序。
//
// 排序结果写回后端（reorder_tasks）。拖拽用逐行 hit-test 实现，
// 5px 阈值区分点击与拖动，拖动后抑制一次点击。

import { onUnmounted, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { parseStartAtTime } from "../lib/datetime.js";
import { taskStatus } from "../lib/labels.js";

const DRAG_THRESHOLD_PX = 5;
const MAX_START_REFRESH_DELAY_MS = 60_000;

/**
 * @param {object} deps
 * @param {import("vue").Ref<string>} deps.currentUser  当前本地用户
 * @param {Function} deps.notify                        错误提示
 * @param {Function} deps.openTask                      打开任务详情
 */
export function useTaskList({ currentUser, notify, openTask }) {
  const activeTasks = ref([]);
  const taskListEl = ref(null);
  const isDragging = ref(false);
  const dragIndex = ref(-1);
  const dragMoved = ref(false);
  const dragStartY = ref(0);
  let suppressClick = false;
  let startRefreshTimer = null;

  async function refreshActiveTasks() {
    if (!currentUser.value) {
      activeTasks.value = [];
      return;
    }
    activeTasks.value = await invoke("list_active_tasks", { owner: currentUser.value });
    scheduleStartRefresh();
  }

  // 未来任务到达开始执行时间后自动刷新，使「未开始」立即变更为「进行中」。
  function scheduleStartRefresh() {
    if (startRefreshTimer) {
      window.clearTimeout(startRefreshTimer);
      startRefreshTimer = null;
    }
    const now = Date.now();
    let nearest = Infinity;
    for (const task of activeTasks.value) {
      if (taskStatus(task) === "not_started" && task.start_at) {
        const at = parseStartAtTime(task.start_at);
        if (at > now && at < nearest) nearest = at;
      }
    }
    if (nearest !== Infinity) {
      const delay = Math.min(nearest - now, MAX_START_REFRESH_DELAY_MS);
      startRefreshTimer = window.setTimeout(() => {
        startRefreshTimer = null;
        if (currentUser.value) refreshActiveTasks().catch(() => {});
      }, delay);
    }
  }

  function startRowDrag(event, index) {
    if (event.button !== 0) return;
    suppressClick = false;
    dragMoved.value = false;
    dragStartY.value = event.clientY;
    isDragging.value = true;
    dragIndex.value = index;
    window.addEventListener("mousemove", onRowDragMove);
    window.addEventListener("mouseup", endRowDrag);
  }

  function onRowDragMove(event) {
    if (!isDragging.value) return;
    if (!dragMoved.value && Math.abs(event.clientY - dragStartY.value) < DRAG_THRESHOLD_PX) return;
    dragMoved.value = true;
    const rows = taskListEl.value?.querySelectorAll(".task-row");
    if (!rows) return;
    let target = -1;
    for (let i = 0; i < rows.length; i++) {
      const rect = rows[i].getBoundingClientRect();
      if (event.clientY >= rect.top && event.clientY <= rect.bottom) {
        target = i;
        break;
      }
    }
    if (target !== -1 && target !== dragIndex.value) {
      const list = [...activeTasks.value];
      const [moved] = list.splice(dragIndex.value, 1);
      list.splice(target, 0, moved);
      activeTasks.value = list;
      dragIndex.value = target;
    }
  }

  function endRowDrag() {
    if (!isDragging.value) return;
    isDragging.value = false;
    window.removeEventListener("mousemove", onRowDragMove);
    window.removeEventListener("mouseup", endRowDrag);
    if (dragMoved.value) {
      suppressClick = true;
      persistOrder();
    }
    dragIndex.value = -1;
    dragMoved.value = false;
  }

  async function handleTaskMainClick(task) {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    await openTask(task);
  }

  async function persistOrder() {
    if (!currentUser.value) return;
    try {
      await invoke("reorder_tasks", {
        owner: currentUser.value,
        orderedIds: activeTasks.value.map((task) => task.id),
      });
    } catch (err) {
      if (notify) notify(err, "保存排序失败");
      await refreshActiveTasks();
    }
  }

  onUnmounted(() => {
    window.removeEventListener("mousemove", onRowDragMove);
    window.removeEventListener("mouseup", endRowDrag);
    if (startRefreshTimer) {
      window.clearTimeout(startRefreshTimer);
      startRefreshTimer = null;
    }
  });

  return {
    activeTasks,
    taskListEl,
    isDragging,
    dragIndex,
    dragMoved,
    refreshActiveTasks,
    scheduleStartRefresh,
    startRowDrag,
    onRowDragMove,
    endRowDrag,
    handleTaskMainClick,
    persistOrder,
  };
}
