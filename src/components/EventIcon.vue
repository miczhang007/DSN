<template>
  <span class="event-icon" :data-shape="shape" aria-hidden="true">
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
      <path v-for="(d, index) in paths" :key="index" :d="d" />
    </svg>
  </span>
</template>

<script setup>
// 生命周期日志图标：线稿风格，与设计稿一致；不同事件类型对应不同形状。
// 用 path 数据表维护，新增事件类型只需补一条映射。
import { computed } from "vue";

const SHAPES = {
  // 时间类：创建、计划时间调整
  clock: ["M8 2.6a5.4 5.4 0 0 1 0 10.8a5.4 5.4 0 0 1 0-10.8", "M8 5.4v3l2.1 1.3"],
  // 内容编辑
  pencil: ["M11.6 3.1l1.3 1.3-8 8-2.3.7.7-2.3z", "M9.9 5.1l1.2 1.2"],
  // 开始 / 进行中 / 激活
  play: ["M5.9 3.6v8.8l6.8-4.4z"],
  // 挂起
  pause: ["M6.1 4.2v7.6", "M9.9 4.2v7.6"],
  // 完成
  check: ["M3.7 8.4l3 3 5.6-6.2"],
  // 撤销类
  undo: ["M4.9 6.3h4.3a3.6 3.6 0 0 1 0 7.2H6.6", "M7 3.6L4.3 6.3 7 9.1"],
  // 进度记录
  trend: ["M2.9 11.4l3.6-3.7 2.6 2.4 4.1-4.6", "M10.1 5.5h3.2v3.2"],
  // 节点创建
  flag: ["M4.5 3.1v10.4", "M4.5 3.7l7 1.7-7 2z"],
  // 归档
  archive: ["M2.9 4.3h10.2", "M4.3 4.3v8.3h7.4V4.3", "M6.4 6.9h3.2"],
  // 删除
  trash: ["M3.7 5h8.6", "M6.4 5V3.5h3.2V5", "M5.2 5l.7 7.5h4.2L10.8 5"],
  // 紧急标记
  alert: ["M8 3.2v6", "M8 11.3v.8"],
  // 兜底：普通圆点
  dot: ["M8 6.2a1.8 1.8 0 0 1 0 3.6a1.8 1.8 0 0 1 0-3.6"],
};

// 事件类型 → 图标形状；与 Rust 侧写入的 event_type 一一对应。
const ICON_BY_EVENT = {
  created: "clock",
  title_changed: "pencil",
  deadline_changed: "clock",
  urgent_changed: "alert",
  start_at_changed: "clock",
  owner_changed: "flag",
  started: "play",
  suspended: "pause",
  activated: "play",
  progress_updated: "trend",
  milestone_created: "flag",
  milestone_started: "play",
  milestone_start_undone: "undo",
  milestone_renamed: "pencil",
  milestone_planned_changed: "clock",
  milestone_completed: "check",
  milestone_completed_undone: "undo",
  milestone_deleted: "trash",
  completed: "check",
  completion_undone: "undo",
  archived: "archive",
  archive_undone: "undo",
  deleted: "trash",
};

const props = defineProps({
  type: { type: String, default: "" },
});

const shape = computed(() => ICON_BY_EVENT[props.type] || "dot");
const paths = computed(() => SHAPES[shape.value] || SHAPES.dot);
</script>
