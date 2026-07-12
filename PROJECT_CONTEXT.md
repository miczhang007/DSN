# 桌面便签项目上下文

## 项目位置

- 当前项目目录：`D:\AI项目\桌面便签`
- 原开发目录：`C:\Users\miczhang\Documents\Codex\2026-07-10\new-chat`
- 迁移时间：2026-07-10

## 原始对话线程

- 线程标题：确认桌面便签应用方案
- 线程 ID：`019f49ca-6b9b-7013-95d2-ee38c9cb1425`
- 原线程工作目录：`C:\Users\miczhang\Documents\Codex\2026-07-10\new-chat`

## 已确认需求

桌面便签是一个 Windows 单机桌面待办工具，定位为极简便签，而不是复杂任务管理系统。

保留功能：

- 添加任务
- 可选 deadline
- 可选紧急标记
- 主界面只展示待办任务列表
- 默认排序：紧急 > deadline > 创建时间
- 完成任务后直接归档
- 历史任务查看
- 单任务生命周期追溯
- 菜单内查看历史、便签大小、产品说明、退出

明确去掉：

- 任务说明
- 手动排序
- 筛选
- 进度维护
- 多级紧急程度
- 完成后是否归档的选择
- 主界面常驻添加表单
- 主界面常驻历史列表

## 技术路线

- Tauri
- Vite
- Vue
- JavaScript
- SQLite

选择原因：

- Tauri 适合轻量 Windows 桌面应用
- Vue + JavaScript 更适合当前小工具规模
- SQLite 用于可靠保存任务、历史和生命周期事件
- 预留未来云同步扩展边界

## 视觉方向

- 应用本体像一张桌面便签
- 不做传统 Windows 标题栏
- 不做明显程序框架
- 透明无边框窗口
- 弱化外部背景
- 浅黄色纸张质感
- 主界面只突出待办列表
- `+` 和菜单作为轻量入口
- 右下角弱视觉显示 `桌面便签 v1.0`

## 产品说明口径

- 产品名称：桌面便签-本地开源版
- 版本：v1.0
- 当前形态：本地开源版
- 开源方式：MIT License
- 收费方式：本地版免费开源；未来云同步服务为独立可选订阅
- 开发者：miczhang（个人开发者）
- 联系方式：`miczhang007@qq.com`
- 源码仓库地址：https://github.com/miczhang007/DSN

## 已生成产物

产物目录：`D:\AI项目\桌面便签\outputs`

- `Desktop Sticky Note_1.0.0_x64-setup.exe`
- `Desktop Sticky Note_1.0.0_x64_en-US.msi`
- `desktop-sticky-note.exe`

## 已完成验证

- `npm run build` 通过
- `npm run tauri -- build` 通过
- 已生成 `exe`、`msi`、`setup.exe`

## 注意事项

- 安装包元数据使用英文 `Desktop Sticky Note`，用于绕开 WiX 对中文安装包元数据的 code page 限制。
- 应用内部 UI 仍显示中文“桌面便签”。
- 原目录移动时曾因进程占用导致删除旧目录失败，但文件已复制到 `D:\AI项目\桌面便签`。
- Codex 线程 `cwd` 仍可能显示旧目录；后续开发应以 `D:\AI项目\桌面便签` 为准。
