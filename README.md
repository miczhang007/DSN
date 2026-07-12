# 桌面便签（StickyNote）

一款面向 Windows 的本地桌面便签工具。便签数据默认保存在本机，适合记录待办事项、截止时间与重要事项。

## 产品定位

- 本地版免费开源，功能完整，无需订阅。
- 便签数据默认仅保存在本机，不上传至服务器。
- 未来的云同步与云端备份将作为独立、可选的订阅服务提供。
- 云服务端、账号体系及同步基础设施不属于本仓库的开源范围。

## 开源许可证

本项目采用 [MIT License](LICENSE) 开源。你可以使用、复制、修改和分发本项目，但须保留版权声明和许可证文本。

## 隐私政策

请参阅 [隐私政策](PRIVACY.md)。当前本地版不收集或上传个人信息、使用行为或便签内容。

## 联系方式

- 开发者：miczhang007（个人开发者）
- 邮箱：miczhang007@qq.com
- 源码仓库：https://github.com/miczhang007/DSN

## 技术栈

- Tauri
- Vue
- Vite
- JavaScript
- SQLite

## 开发

```bash
npm install
npm run tauri:dev
```

## 构建

```bash
npm run tauri:build
```
