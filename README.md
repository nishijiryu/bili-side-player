# BiliSide Player

<img src="public/icons/icon-128.png" alt="BiliSide Player 图标" width="96" height="96">

**哔哩侧栏播放器**是一个 Manifest V3 Chrome 扩展：在 Side Panel 中维护本地歌单，并通过 Bilibili 页面原生 HTML5 播放器播放。数据仅保存在 `chrome.storage.local`，不会下载媒体或绕过站点限制。

## 功能

- 创建和管理多个本地歌单，并在添加视频或合集时多选目标歌单。
- 从当前视频页、Bilibili URL、合集或多 P 列表添加曲目。
- 播放、暂停、切歌、调节音量、静音和拖动进度。
- 支持顺序、列表循环、单曲循环、随机及连续播放。
- 搜索、排序、编辑曲目，并自动定位当前播放项。
- JSON 导入与导出；导入不会覆盖现有歌单。

## 开发与构建

需要 Node.js 20+。运行：

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
```

开发可用 `npm run dev`；生产产物位于 `dist/`。

## 安装

打开 `chrome://extensions`，启用“开发者模式”，点击“加载已解压的扩展程序”，选择本项目的 `dist` 目录。将扩展固定到工具栏，点击图标会打开右侧 Side Panel。

## 权限

- `sidePanel`：提供侧边栏界面。
- `storage`：在本机保存歌单、设置和最近状态。
- `tabs`：查找、创建和复用受管 Bilibili 播放标签页。
- `https://www.bilibili.com/video/*`：仅在视频页读取元数据并控制 HTML5 播放器。
- `https://api.bilibili.com/*`：按 BV/av 标识读取公开的视频封面地址，用于歌单缩略图。

扩展不注入远程 JavaScript，不需要服务器或账号。歌单数据不会上传到项目作者的服务器。

## 项目声明

本项目是非官方的开源工具，与哔哩哔哩（Bilibili）及其关联公司无隶属、授权或背书关系。Bilibili 名称、商标及页面内容归其各自权利人所有。使用者应遵守 Bilibili 服务条款以及所在地法律法规。

## 已知限制与排查

Bilibili 改版可能更换标题、UP 主或播放器 DOM。页面适配集中在 `src/content.ts` 的 `findVideo` 与 `metadata`；若页面未连接，先确认地址属于 `/video/*`、视频可访问且控制台没有站点策略错误。Chrome/Bilibili 的自动播放策略无法绕过，失败时需在页面手动播放。多 P 入口会保留 `p` 参数；站内自行切 P 不会被当作扩展切歌。

service worker 可随时休眠；必要状态写入本地存储，并在消息处理时重新读取。快速连续选歌通过请求编号保证旧页面就绪不会覆盖新选择；结束事件以事件编号和当前视频标识双重去重。

## 开源协议

本项目采用 [MIT License](LICENSE)。

参与开发前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。
