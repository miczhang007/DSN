# Microsoft Store MSIX 发布说明

本项目提交 Microsoft Store 的 MSIX 必须使用仓库内既有的市场身份配置，唯一权威文件为 `store/msix/AppxManifest.xml`。不得新建临时清单、替换包身份，或使用本地测试身份打包。

## 固定市场身份

| 字段 | 固定值 |
| --- | --- |
| Identity Name | `miczhang.-StickyNote` |
| Publisher | `CN=F47FAFC5-B249-47C2-9F9F-3C33FD9E19B4` |
| PublisherDisplayName | `miczhang` |
| 应用显示名 | `桌面便签 -StickyNote` |
| 处理器架构 | `x64` |
| 最低系统版本 | Windows 10 `10.0.17763.0` |

上述值必须与 Partner Center 为“桌面便签 -StickyNote”保留的包身份完全一致。特别是 `Identity Name` 与 `Publisher` 不得根据应用名或开发者昵称自行推测。

## 版本规则

- 应用版本在 `package.json`、`src-tauri/Cargo.toml` 与 `src-tauri/tauri.conf.json` 中保持一致，例如 `1.4.0`。
- 市场 MSIX 使用四段版本号，例如应用版本 `1.4.0` 对应清单版本 `1.4.0.0`。
- 每次应用代码变更完成后，更新 `src/App.vue` 的 `versionLabel`，格式固定为 `v1.4.0 - YYYY-MM-DD HH:mm`。

## 生成市场包

打包前确认测试通过、`versionLabel` 已更新，并在项目根目录执行：

```powershell
.\scripts\build-msix.ps1 -BuildBinary
```

脚本会先生成 release 二进制，再依据 `store/msix/AppxManifest.xml` 封装 MSIX。产物位于：

```text
outputs\Desktop-Sticky-Note_<MSIX版本>_x64.msix
```

例如 `1.4.0` 的市场包为：

```text
outputs\Desktop-Sticky-Note_1.4.0.0_x64.msix
```

## 签名与提交

- 该脚本生成的是未签名 MSIX，供 Partner Center 上传；Microsoft Store 在分发阶段负责签名。
- 未签名包无法直接在本机安装，这是预期行为。
- 本地测试应直接运行 release 或 debug 可执行文件；不要将本地自签名证书、PFX、私钥或测试签名包提交到仓库。
