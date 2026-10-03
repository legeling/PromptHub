# Proposal: 文本类 Prompt 媒体上传入口提层与限制提示

## Change Key
`desktop-editor-media-visibility`（v0.6.3 / X2，体验，响应 #64）

## Why
#64 用户原话：图片上传应"设置到显眼的第一层级"，且希望有体积/格式提示。现状：文本类 prompt 的媒体区藏在 More Settings 展开区深处（EditPromptModal:1473），上传按钮仅有"Upload/Add Link"字样，无任何约束说明（实际限制：本地保存 20MB、URL 下载 10MB，主进程 image.ipc 常量）。图片类型 prompt 已在第一层级（1242），仅文本类不一致。

## Scope
两弹窗中 `renderReferenceMediaSection()` 的 JSX 位置从深处提升到用户提示词区之后、"补充信息"折叠组之前；媒体区加一行静态 hint（格式 + 大小上限真实值）。上传/保存/校验逻辑零改动。

## Risks & Rollback
纯布局移动 + 文案；回滚移动 JSX 位置。

## Traceability
FR-MEDIA-001..002 → DES-MEDIA-001 → TEST-MEDIA-001..002
