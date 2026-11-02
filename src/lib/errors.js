// 统一错误处理：文案提取、全局兜底与上报出口。
//
// 设计意图：
//   1. 组件里"知道该怎么提示"的地方仍用具体兜底文案（体验更好）；
//   2. 没人接的异常（async 事件处理器、定时器、未处理的 Promise）由全局兜底
//      统一提示，避免界面点了没反应又没有任何反馈；
//   3. 任何情况下都保留 console 诊断信息，方便排查。

let reporter = null;

export function messageFromError(error, fallback) {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/** 注册把错误展示给用户的回调；App 挂载时注册为 notice 气泡。 */
export function setErrorReporter(fn) {
  reporter = typeof fn === "function" ? fn : null;
}

/** 上报一个未就地处理的错误。永不抛出，避免二次破坏调用栈。 */
export function reportError(error, fallback = "操作失败，请稍后重试") {
  const message = messageFromError(error, fallback);
  console.error("[sticky-note]", message, error);
  if (reporter) reporter(message);
  return message;
}

/** 安装全局兜底：Vue 组件错误 + 未处理的 Promise rejection。 */
export function installGlobalErrorHandlers(app) {
  if (app) {
    app.config.errorHandler = (error) => {
      reportError(error);
    };
  }
  window.addEventListener("unhandledrejection", (event) => {
    reportError(event.reason);
  });
}
