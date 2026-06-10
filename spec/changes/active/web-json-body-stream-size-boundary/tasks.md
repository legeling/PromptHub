# Tasks

- [x] 明确 Web JSON/body 读取边界
- [x] 添加受限 byte/text body 读取工具
- [x] 将 `parseJsonBody()` 改为读取过程中执行大小限制
- [x] 为 auth/AI/sync/import/media 接入明确业务上限
- [x] 将 skill optional JSON body 改为受限读取
- [x] 补充无 `Content-Length` 的 streamed auth body 回归测试
- [x] 将 multipart import 改为先受限读取再解析 `formData()`
- [x] 补充无 `Content-Length` 的 streamed multipart import 超限回归测试
- [x] 运行 Web typecheck、目标路由测试、lint 和 diff 检查
