import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App.vue";

const invokeMock = vi.fn(async (command) => {
  if (command === "list_active_tasks" || command === "list_archived_tasks") return [];
  if (command === "get_task_events" || command === "list_milestones") return [];
  if (command === "is_auto_start_enabled") return false;
  if (command === "set_minimal_mode") return false;
  return null;
});

vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args) => invokeMock(...args) }));

function mountApp() {
  return mount(App);
}

describe("桌面便签核心交互", () => {
  beforeEach(() => {
    invokeMock.mockClear();
    localStorage.clear();
  });

  it("无用户时打开应用会进入用户管理，并提供添加用户入口", async () => {
    const wrapper = mountApp();
    await wrapper.find(".add-button").trigger("click");
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".users-view").exists()).toBe(true);
    expect(wrapper.text()).toContain("新增用户");
  });

  it("添加用户后进入首页并加载该用户任务", async () => {
    const wrapper = mountApp();
    await wrapper.find(".add-button").trigger("click");
    await wrapper.vm.$nextTick();
    const input = wrapper.find('input[autocomplete="username"]');
    await input.setValue("测试用户");
    await wrapper.find("form.user-form").trigger("submit");
    expect(wrapper.find(".task-list").exists()).toBe(false);
    expect(wrapper.text()).toContain("今天还没有待办");
    expect(localStorage.getItem("current-user")).toBe("测试用户");
    expect(invokeMock).toHaveBeenCalledWith("list_active_tasks", { owner: "测试用户" });
  });

  it("删除用户前显示应用内确认弹窗，不调用原生 confirm", async () => {
    const wrapper = mountApp();
    await wrapper.find(".add-button").trigger("click");
    await wrapper.vm.$nextTick();
    await wrapper.find('input[autocomplete="username"]').setValue("待删除");
    await wrapper.find("form.user-form").trigger("submit");
    await wrapper.find(".menu-button").trigger("click");
    const userManagerButton = wrapper.findAll("button").find((button) => button.text() === "用户管理");
    await userManagerButton.trigger("click");
    const deleteButton = wrapper.findAll("button").find((button) => button.text() === "删除");
    await deleteButton.trigger("click");
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(document.body.textContent).toContain("删除用户");
  });
});
