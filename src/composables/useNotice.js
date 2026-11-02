// 顶部提示气泡的状态与自动消失逻辑。
//
// 从 App.vue 抽出，让"统一提示"成为可复用的横切能力；
// 组件卸载时自动清理定时器，避免对已卸载组件写状态。

import { onUnmounted, ref } from "vue";
import { messageFromError } from "../lib/errors.js";

const NOTICE_DURATION_MS = 5000;

export function useNotice() {
  const notice = ref(null);
  let noticeTimer = null;

  function closeNotice() {
    notice.value = null;
    if (noticeTimer) {
      window.clearTimeout(noticeTimer);
      noticeTimer = null;
    }
  }

  function showNotice(error, fallback) {
    notice.value = { message: messageFromError(error, fallback) };
    if (noticeTimer) window.clearTimeout(noticeTimer);
    noticeTimer = window.setTimeout(closeNotice, NOTICE_DURATION_MS);
  }

  onUnmounted(() => {
    if (noticeTimer) {
      window.clearTimeout(noticeTimer);
      noticeTimer = null;
    }
  });

  return { notice, showNotice, closeNotice };
}
