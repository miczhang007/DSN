import { describe, expect, it } from "vitest";
import {
  eventText,
  fallbackTaskStatus,
  formatBool,
  formatTextValue,
  taskStatus,
  taskStatusText,
} from "../src/lib/labels.js";

describe("任务状态文案", () => {
  it("优先后端下发的 status", () => {
    expect(taskStatus({ status: "in_progress" })).toBe("in_progress");
    expect(taskStatus({ status: "suspended", completed_at: "2026-11-02" })).toBe("suspended");
  });

  it("缺少 status 时按时间字段推断", () => {
    expect(fallbackTaskStatus({})).toBe("pending");
    expect(fallbackTaskStatus({ archived_at: "2026-11-01" })).toBe("uncompleted");
    expect(fallbackTaskStatus({ archived_at: "2026-11-01", completed_at: "2026-11-01" })).toBe("completed");
    expect(fallbackTaskStatus({ completed_at: "2026-11-01" })).toBe("completed");
    expect(fallbackTaskStatus({ suspended_at: "2026-11-01" })).toBe("suspended");
    expect(fallbackTaskStatus({ start_at: "2099-01-01" })).toBe("not_started");
    expect(fallbackTaskStatus({ start_at: "2020-01-01" })).toBe("in_progress");
    expect(fallbackTaskStatus({ started_at: "2020-01-01" })).toBe("in_progress");
  });

  it("状态文案覆盖全部取值，未知状态回退为待完成", () => {
    const cases = {
      pending: "待完成",
      not_started: "未开始",
      in_progress: "进行中",
      suspended: "已挂起",
      completed: "已完成",
      uncompleted: "未完成",
      deleted: "已删除",
    };
    for (const [status, text] of Object.entries(cases)) {
      expect(taskStatusText({ status })).toBe(text);
    }
    expect(taskStatusText({ status: "unknown" })).toBe("待完成");
  });
});

describe("生命周期事件文案", () => {
  it("基础事件与节点事件", () => {
    expect(eventText({ event_type: "created" })).toBe("创建任务");
    expect(eventText({ event_type: "completed" })).toBe("完成任务");
    expect(eventText({ event_type: "milestone_completed", after_value: "提交评审" })).toBe("完成节点：提交评审");
    expect(eventText({ event_type: "milestone_created", after_value: "初稿" })).toBe("新增节点：初稿");
    expect(eventText({ event_type: "progress_updated", after_value: "已联系客户" })).toBe("已联系客户");
  });

  it("改名事件展示前后值，缺值时显示无", () => {
    expect(eventText({ event_type: "title_changed", before_value: "旧标题", after_value: "新标题" }))
      .toBe("任务内容：旧标题 -> 新标题");
    expect(eventText({ event_type: "milestone_deleted" })).toBe("删除节点：无");
  });

  it("归档事件区分系统自动归档与手动归档", () => {
    expect(eventText({ event_type: "archived", after_value: "auto" })).toBe("系统自动归档（隔天）");
    expect(eventText({ event_type: "archived" })).toBe("归档任务");
  });

  it("未知事件类型原样返回，便于排查", () => {
    expect(eventText({ event_type: "some_future_event" })).toBe("some_future_event");
  });
});

describe("通用展示函数", () => {
  it("formatBool 只把 true/1 视为是", () => {
    expect(formatBool("true")).toBe("是");
    expect(formatBool("1")).toBe("是");
    expect(formatBool("false")).toBe("否");
    expect(formatBool("")).toBe("否");
  });

  it("formatTextValue 空值显示无", () => {
    expect(formatTextValue("")).toBe("无");
    expect(formatTextValue(null)).toBe("无");
    expect(formatTextValue("内容")).toBe("内容");
  });
});
