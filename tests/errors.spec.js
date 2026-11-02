import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h } from "vue";
import {
  installGlobalErrorHandlers,
  messageFromError,
  reportError,
  setErrorReporter,
} from "../src/lib/errors.js";

afterEach(() => {
  setErrorReporter(null);
});

describe("错误文案提取", () => {
  it("字符串错误原样使用，Error 用 message，其余用兜底", () => {
    expect(messageFromError("后端返回的错误", "兜底")).toBe("后端返回的错误");
    expect(messageFromError(new Error("网络断开"), "兜底")).toBe("网络断开");
    expect(messageFromError(null, "兜底")).toBe("兜底");
    expect(messageFromError("   ", "兜底")).toBe("兜底");
  });
});

describe("全局错误兜底", () => {
  it("未就地处理的 async 事件处理器异常会被 errorHandler 捕获并弹出提示", async () => {
    const reporter = vi.fn();
    setErrorReporter(reporter);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const Comp = defineComponent({
      setup() {
        return () =>
          h("button", {
            onClick: async () => {
              throw new Error("后端命令失败");
            },
          }, "触发");
      },
    });

    const app = createApp(Comp);
    installGlobalErrorHandlers(app);
    const host = document.createElement("div");
    document.body.appendChild(host);
    app.mount(host);

    host.querySelector("button").click();
    // 让被拒绝的 Promise 走到 errorHandler
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(reporter).toHaveBeenCalledWith("后端命令失败");
    app.unmount();
    host.remove();
  });

  it("reportError 永不抛出，并保留控制台诊断", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const reporter = vi.fn();
    setErrorReporter(reporter);

    expect(() => reportError(new Error("坏了"), "兜底")).not.toThrow();
    expect(reporter).toHaveBeenCalledWith("坏了");
    expect(consoleSpy).toHaveBeenCalled();

    // 没有注册回调时也不能崩，只留日志
    setErrorReporter(null);
    expect(reportError("无回调", "兜底")).toBe("无回调");
  });
});
