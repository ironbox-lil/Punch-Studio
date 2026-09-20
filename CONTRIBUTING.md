# 开发与维护

使用 Node.js 24，运行 `npm ci && npm run dev`。不配置密钥也可进行图像引擎和界面开发。

## 分层

- `src/domain`：纯几何函数和场景模型；维持源孔与目标碎片的一一对应。
- `src/imaging`：Canvas 像素操作；预览、AI 裁剪输入和高清导出共用选区。
- `src/editor`、`src/components`：交互、草稿、资源生命周期；不得隐式调用付费模型。
- `shared`、`server`：严格协议校验、模型适配、服务端配置；不得将密钥放进前端变量或错误响应。

## 检查

```sh
npm run check
npm run format:check
npx playwright install chromium
npm run test:e2e
git add .
npm run check:repo
```

浏览器配置测试拦截配置 API，服务端测试使用临时目录；不要让自动化测试写入开发者的 `.local/llm.json` 或调用真实模型。新增视觉行为应验证像素、边界或交互结果，避免仅重复实现逻辑。

`base photos/` 和 `reference/` 可用于个人本机验收，不提交图片或包含这些图片的截图。基础测试使用合成图，CI 不要求私人素材。

模型适配使用 Chat Completions 和 `image_url`。兼容模式不发送 DeepSeek 专有的 `thinking` 参数；更换服务后重建缓存。改变请求协议时同时更新共享校验、API 测试和界面。

源码打包：暂存全部预期改动后运行 `npm run package:source`。打包器对暂存区做安全检查，并使用同一 Git tree 生成 ZIP，无须先创建提交。版本号在 `package.json` 与 `package-lock.json` 中保持一致。
