# 参与贡献

感谢你为 BiliSide Player 提交改进。

## 开发流程

1. Fork 仓库并从默认分支创建功能分支。
2. 安装 Node.js 20+，运行 `npm ci`。
3. 修改代码并为核心逻辑补充测试。
4. 提交前运行：

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## 提交建议

- 一个 Pull Request 聚焦一个问题，说明动机、行为变化及验证方式。
- UI 变化请附截图；Bilibili DOM 兼容性修复请附页面类型和可复现步骤。
- 不要提交账号信息、Cookie、访问令牌、导出的私人歌单、`dist/` 或 `node_modules/`。
- 新功能应遵守最小权限原则，不下载媒体，也不绕过登录、地区、版权或付费限制。

提交代码即表示你同意按本项目的 MIT License 发布贡献。
