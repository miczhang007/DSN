// 日期与时间工具。
//
// 存储约定：
//   - 仅日期为 "YYYY-MM-DD"；
//   - 含具体时间时为 ISO 8601（UTC）。
// 控件回显与界面展示一律换算成本地时间。

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** 未来任务的默认开始日期：本地时区的明天。 */
export function defaultStartTime() {
  const now = new Date();
  now.setDate(now.getDate() + 1);
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

/** 日期（YYYY-MM-DD）+ 可选时间（HH:MM）转为存储值：未指定时间时仅存日期。 */
export function dateTimeToIso(date, time) {
  if (!date) return null;
  if (!time) return date;
  return new Date(`${date}T${time}`).toISOString();
}

/** 当前本地时间拆分为日期与时间（用于预填完成时间/记录时间）。 */
export function nowLocalParts() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  const local = new Date(now.getTime() - offset).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
}

/** 存储值拆分为控件回显的日期与可选时间；仅日期时时间为空。 */
export function splitIsoForInput(value) {
  if (!value) return { date: "", time: "" };
  if (DATE_ONLY.test(value)) return { date: value, time: "" };
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  const local = new Date(date.getTime() - offset).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
}

/** 解析开始执行时间为本地时间戳；仅日期按本地当天零点。 */
export function parseStartAtTime(value) {
  if (!value) return NaN;
  const normalized = DATE_ONLY.test(value) ? `${value}T00:00:00` : value;
  return new Date(normalized).getTime();
}

/** 本地今天，格式 YYYY-MM-DD（用于日期控件默认值）。 */
export function localDateInputValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

// 仅日期不显示时间，避免把 00:00 当成"当天零点"误导用户。
function formatLocalDateTime(value, emptyValue) {
  if (!value) return emptyValue;
  if (DATE_ONLY.test(value)) {
    return new Date(`${value}T00:00:00`).toLocaleString("zh-CN", {
      month: "numeric",
      day: "numeric",
    });
  }
  return new Date(value).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 截止时间展示；空值显示"无截止时间"。 */
export function formatDeadline(value) {
  return formatLocalDateTime(value, "无截止时间");
}

/** 通用时间展示；空值显示空串。 */
export function formatTime(value) {
  return formatLocalDateTime(value, "");
}

/** 时间值展示；空值显示"未设置"。 */
export function formatTimeValue(value) {
  if (!value) return "未设置";
  return formatDeadline(value);
}

// 生命周期排序：仅日期事件视为该日末尾，排在当天有具体时间的事件之后；
// 同一时间再按事件 id 保证顺序稳定。
export function compareEventTime(a, b) {
  const ms = (value) => {
    if (!value) return 0;
    return DATE_ONLY.test(value)
      ? new Date(`${value}T23:59:59`).getTime()
      : new Date(value).getTime();
  };
  const diff = ms(a.created_at) - ms(b.created_at);
  return diff !== 0 ? diff : a.id - b.id;
}
