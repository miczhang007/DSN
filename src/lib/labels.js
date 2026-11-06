// 任务状态与生命周期事件的文案映射。
//
// 这些函数不依赖组件状态，只做纯计算，便于单独测试。

import { formatDeadline, formatTimeValue, parseStartAtTime } from "./datetime.js";

export function formatBool(value) {
  return value === "true" || value === "1" ? "是" : "否";
}

export function formatTextValue(value) {
  if (!value) return "无";
  return value;
}

/** 任务状态：优先后端下发的 status，缺失时按时间字段推断。 */
export function taskStatus(task) {
  return task.status || fallbackTaskStatus(task);
}

export function fallbackTaskStatus(task) {
  if (task.archived_at) return task.completed_at ? "completed" : "uncompleted";
  if (task.completed_at) return "completed";
  if (task.suspended_at) return "suspended";
  if (task.start_at && parseStartAtTime(task.start_at) > Date.now()) return "not_started";
  if (task.started_at || (task.start_at && !task.reactivated_at)) return "in_progress";
  return "pending";
}

export function taskStatusText(task) {
  const labels = {
    pending: "待完成",
    not_started: "未开始",
    in_progress: "进行中",
    suspended: "已挂起",
    completed: "已完成",
    uncompleted: "未完成",
    deleted: "已删除",
  };
  return labels[taskStatus(task)] || "待完成";
}

/** 生命周期事件文案；未知事件类型原样展示类型名，便于排查。 */
export function eventText(event) {
  const labels = {
    created: "创建任务",
    title_changed: `任务内容：${formatTextValue(event.before_value)} -> ${formatTextValue(event.after_value)}`,
    deadline_changed: `截止时间：${formatDeadline(event.before_value)} -> ${formatDeadline(event.after_value)}`,
    urgent_changed: `紧急标记：${formatBool(event.before_value)} -> ${formatBool(event.after_value)}`,
    start_at_changed: `任务开始执行时间：${formatTimeValue(event.before_value)} -> ${formatTimeValue(event.after_value)}`,
    owner_changed: `分类：${formatTextValue(event.before_value)} -> ${formatTextValue(event.after_value)}`,
    started: "任务开始执行",
    suspended: "挂起任务",
    activated: "激活任务",
    progress_updated: formatTextValue(event.after_value),
    milestone_completed: `完成节点：${formatTextValue(event.after_value)}`,
    milestone_completed_undone: `撤销完成节点：${formatTextValue(event.after_value)}`,
    milestone_created: `新增节点：${formatTextValue(event.after_value)}`,
    milestone_started: `节点进行中：${formatTextValue(event.after_value)}`,
    milestone_start_undone: `撤销节点进行中：${formatTextValue(event.after_value)}`,
    milestone_renamed: `节点改名：${formatTextValue(event.before_value)} -> ${formatTextValue(event.after_value)}`,
    milestone_planned_changed: `节点计划时间：${formatDeadline(event.before_value)} -> ${formatDeadline(event.after_value)}`,
    milestone_deleted: `删除节点：${formatTextValue(event.before_value)}`,
    completed: "完成任务",
    archived: event.after_value === "auto" ? "系统自动归档（隔天）" : "归档任务",
    merged: `合并任务：合并自 ${formatTextValue(event.after_value)}`,
    completion_undone: "撤销完成",
    archive_undone: "撤销归档",
    deleted: "删除任务",
  };
  return labels[event.event_type] || event.event_type;
}
