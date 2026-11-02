import { createApp } from "vue";
import App from "./App.vue";
import { installGlobalErrorHandlers } from "./lib/errors.js";
import "./styles.css";

const app = createApp(App);
// 兜住未被组件就地处理的异常（async 事件处理器、定时器、未处理的 Promise），
// 统一走顶部提示气泡，避免"点了没反应"。
installGlobalErrorHandlers(app);
app.mount("#app");
