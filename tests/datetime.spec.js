import { describe, expect, it } from "vitest";
import {
  compareEventTime,
  dateTimeToIso,
  defaultStartTime,
  formatDeadline,
  formatTime,
  formatTimestamp,
  formatTimeValue,
  localDateInputValue,
  nowLocalParts,
  parseStartAtTime,
  splitIsoForInput,
} from "../src/lib/datetime.js";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^\d{2}:\d{2}$/;

describe("日期时间工具", () => {
  it("localDateInputValue 返回本地今天且格式为 YYYY-MM-DD", () => {
    expect(localDateInputValue()).toMatch(DATE_ONLY);
  });

  it("nowLocalParts 同时给出日期与时间，供控件预填", () => {
    const { date, time } = nowLocalParts();
    expect(date).toMatch(DATE_ONLY);
    expect(time).toMatch(CLOCK);
  });

  it("defaultStartTime 是今天之后的日期", () => {
    // 字符串可直接比较：YYYY-MM-DD 字典序即时间序
    expect(defaultStartTime()).toMatch(DATE_ONLY);
    expect(defaultStartTime() > localDateInputValue()).toBe(true);
  });

  it("dateTimeToIso 未指定时间时只存日期，指定时间时存为 UTC", () => {
    expect(dateTimeToIso("2026-11-02", "")).toBe("2026-11-02");
    expect(dateTimeToIso("", "09:30")).toBeNull();

    const iso = dateTimeToIso("2026-11-02", "09:30");
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    // 存进去的本地时间必须能原样读回来
    expect(splitIsoForInput(iso)).toEqual({ date: "2026-11-02", time: "09:30" });
  });

  it("splitIsoForInput 对仅日期、空值与完整时间分别处理", () => {
    expect(splitIsoForInput("2026-11-02")).toEqual({ date: "2026-11-02", time: "" });
    expect(splitIsoForInput("")).toEqual({ date: "", time: "" });
    expect(splitIsoForInput(null)).toEqual({ date: "", time: "" });

    const parts = splitIsoForInput("2026-11-02T01:30:00.000Z");
    expect(parts.date).toMatch(DATE_ONLY);
    expect(parts.time).toMatch(CLOCK);
  });

  it("parseStartAtTime 把仅日期解析为本地零点，空值返回 NaN", () => {
    expect(parseStartAtTime("2026-11-02")).toBe(new Date("2026-11-02T00:00:00").getTime());
    expect(Number.isNaN(parseStartAtTime(""))).toBe(true);
    expect(Number.isNaN(parseStartAtTime(null))).toBe(true);
  });

  it("formatDeadline 空值显示无截止时间，仅日期不显示时分", () => {
    expect(formatDeadline("")).toBe("无截止时间");
    expect(formatDeadline(null)).toBe("无截止时间");

    const dateOnly = formatDeadline("2026-11-02");
    expect(dateOnly).not.toContain(":");
    expect(dateOnly).toContain("11");
  });

  it("formatTime 空值返回空串，formatTimeValue 空值显示未设置", () => {
    expect(formatTime("")).toBe("");
    expect(formatTimeValue("")).toBe("未设置");
    expect(formatTimeValue("2026-11-02")).toBe(formatDeadline("2026-11-02"));
  });

  it("formatTimestamp 展示精确时间戳，空值与非法值安全回落", () => {
    expect(formatTimestamp("")).toBe("");
    expect(formatTimestamp(null)).toBe("");
    expect(formatTimestamp("不是时间")).toBe("不是时间");

    const text = formatTimestamp("2026-11-06T02:30:00+00:00");
    expect(text).toContain("2026");
    expect(text).toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  it("compareEventTime 只日期事件排在同一天具体时间之后，同时间按 id 稳定", () => {
    const dateOnly = { created_at: "2026-11-02", id: 1 };
    const timed = { created_at: dateTimeToIso("2026-11-02", "09:30"), id: 2 };
    expect(compareEventTime(dateOnly, timed)).toBeGreaterThan(0);

    const a = { created_at: "2026-11-02", id: 1 };
    const b = { created_at: "2026-11-02", id: 2 };
    expect(compareEventTime(a, b)).toBeLessThan(0);
  });
});
