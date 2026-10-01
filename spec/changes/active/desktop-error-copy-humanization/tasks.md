# Tasks: desktop-error-copy-humanization

- [x] T1 映射器 + 单测先行（4 用例：全枚举/字符串错误/未知兜底+console/非法输入）
- [x] T2 SecuritySettings 5 处 catch 接入（含 statusFetchFail 路径；change-password 特判并入映射器）
- [x] T3 组件测试（英文错误不再透传断言 ×2；既有"透传未知错误"用例按新契约改写）
- [x] T4 i18n × 7（5 键）+ 回归（security-settings 9/9 + 映射器 4/4）
