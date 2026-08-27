import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../src/App.vue";

const invokeMock = vi.fn(async (command) => {
  if (command === "list_active_tasks" || command === "list_archived_tasks") return [];
  if (command === "is_auto_start_enabled" || command === "set_minimal_mode") return false;
  return [];
});

vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args) => invokeMock(...args) }));

afterEach(() => {
  invokeMock.mockClear();
  localStorage.clear();
});

describe("本次变更回归：周期任务", () => {
  it("新建按日规则时默认不预选工作日，并按所选日期提交", async () => {
    localStorage.setItem("current-user", "测试用户");
    const wrapper = mount(App);
    await wrapper.vm.$nextTick();
    await wrapper.find(".add-button").trigger("click");
    await wrapper.vm.$nextTick();
    await wrapper.find('input[maxlength="80"]').setValue("每日运动");
    await wrapper.find("input[type=checkbox]").setValue(true);
    await wrapper.findAll("button").find((button) => button.text() === "添加任务").trigger("click");

    expect(invokeMock).toHaveBeenCalledWith("create_recurring_task_setting", expect.objectContaining({
      title: "每日运动",
      weekdays: [],
    }));
  });
});
