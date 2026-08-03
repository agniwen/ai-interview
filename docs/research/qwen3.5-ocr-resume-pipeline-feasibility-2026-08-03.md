# Qwen3.5-OCR 替换现有 OCR-LLM PDF 解析分支可行性

日期：2026-08-03

## 结论

可行，推荐将 `ocr-llm` 中的 **PDF 文本提取子路径**迁移到 `qwen3.5-ocr` 的 OpenAI Responses API。它能直接解析整份 PDF，不再需要应用侧用 MuPDF 拆页、渲染 PNG、逐页 OCR；但这不是只修改 `QWEN_OCR_MODEL` 环境变量。

建议保留现有 DOC/DOCX/PPT/XLS/HTML 本地文本提取，以及 OCR 后的结构化简历 LLM 步骤。Qwen3.5-OCR 的整文档输入只解决 PDF 的视觉文字/版面恢复，不等于直接产出项目现有的 `structuredSchema`。

## 当前项目链路

- `qwen-ocr.ts` 使用 Chat Completions，将单张图片转 Base64 后提交给 `qwen-vl-ocr-latest`。
- `resume-parse-pipeline.ts` 对 PDF 使用 MuPDF WASM，以 2 倍缩放最多渲染前 6 页，并在内存中保留 PNG 数组，再逐页调用 OCR。
- Mastra workflow 将整份文件再编码为 `bytesBase64`，步骤中多次解码。
- 批量上传 Worker 先从 S3 把对象完整读入 `arrayBuffer`，然后才进入解析。
- OCR 文本之后仍由 `generateResumeStructured` 调用结构化代理生成统一简历 JSON。

因此当前峰值内存可能同时包含：S3 文件字节、Base64 字符串、MuPDF 的 PDF 副本、多页 PNG、逐页 Base64 字符串和 OCR 文本。

## 目标链路

推荐的 PDF 路径：

1. Worker 保留 `storageKey`，生成短时、只读的 S3 预签名 URL。
2. 使用 OpenAI SDK `client.responses.create`，传入 `input_file.file_url`。
3. 模型指定 `qwen3.5-ocr`，OCR 任务指定 `document_parsing`。
4. 从 `response.output[0].content[0].ocr_result` 读取整份 PDF 结果。
5. 继续使用现有结构化代理映射为项目的统一简历 Schema。

现有 OpenAI SDK 版本为 6.39.0，已包含 `responses.create` 和 `input_file.file_url` 类型，因此无需为了 Responses API 单独换 SDK。阿里云扩展字段 `ocr_options` 是否能直接通过当前 TypeScript 类型，需要在实现时做一次最小编译验证；必要时使用 SDK 的额外请求体能力。

## 能否免拆文档

| 文件类型               | 结论                                                                            |
| ---------------------- | ------------------------------------------------------------------------------- |
| PDF                    | 可以。Responses API 可直接解析整份 PDF，无需本地拆页。                          |
| JPG/PNG                | 可以继续用 Chat Completions 或切到 Responses，但本来就是单图，不涉及 PDF 拆页。 |
| DOC/DOCX               | 不应改走 Qwen3.5-OCR 整 PDF 接口；保留项目现有本地提取/转换。                   |
| PPT/PPTX/XLS/XLSX/HTML | 同上，继续使用现有本地解析。                                                    |

官方限制为 PDF 最多 50 页且不超过 100 MB。超过限制时必须明确拒绝或走备用解析器，不能静默截断。当前实现最多 OCR 前 6 页，迁移后反而能修复 7 页以上简历内容被忽略的问题。

## CPU 与内存影响

### 预期明显下降的部分

- 删除 Worker 内的 MuPDF WASM PDF 渲染 CPU。
- 不再持有多张高分辨率 PNG。
- 不再为每一页生成 Base64 图片。
- PDF 从 N 次 OCR 请求变为一次整文档请求。

### 仍可能保留的资源消耗

如果只替换 OCR 调用，而仍让 Worker 下载整份 PDF并通过 `bytesBase64` 在 workflow 中传递，原始文件和 Base64 副本仍会占内存。要获得完整收益，应为 PDF 增加 URL-first 路径，避免在解析 Worker 中下载、复制和 Base64 化原文件。

因此可以判断“单任务 CPU 和峰值内存会显著下降”，但不能在没有压测前直接降低容器资源配额。远程服务延迟、超时、限流和整份 PDF 重试会成为新的主要瓶颈。

## 需要处理的兼容性与风险

1. **不是环境变量替换**：整 PDF 仅支持 Responses API，当前代码使用 Chat Completions 图片输入。
2. **API 地址**：官方示例使用带业务空间 ID、地域相关的兼容端点；需核对当前百炼空间、API Key 和部署地域。
3. **S3 可访问性**：百炼必须能在 URL 有效期内访问预签名 URL。URL 是临时 bearer credential，禁止写日志，建议短 TTL、仅 GET。
4. **缓存污染**：当前缓存兼容判断只识别 `qwen-ocr` 来源，不区分具体模型。灰度期间需要记录 parser/model version 或禁用相关缓存，否则旧模型结果会被复用。
5. **进度事件变化**：当前 UI/流式事件有逐页开始和完成；整 PDF API 是一次性结果，需要重新定义进度语义。
6. **重试粒度**：当前可单页重试；新方案失败时会重试整份 PDF。
7. **结构化步骤仍存在**：OCR 输出不能直接替代项目的结构化简历 Schema。
8. **Office 文件不在整 PDF 能力范围内**：不要把“免拆 PDF”扩展解释成“所有简历文件都无需本地处理”。

## 推荐落地顺序

1. 只新增 `qwen3.5-ocr` PDF Responses 适配器，保留旧逐页 OCR 为 feature flag fallback。
2. 将 PDF 批量上传路径改为 `storageKey -> presigned URL -> Responses API`；其他格式保持不变。
3. 增加模型/解析器版本化缓存键或兼容元数据。
4. 对 50 页/100 MB 限制、URL 拉取失败、超时和空结果建立显式 fallback。
5. 以真实简历样本进行灰度，不先降低 Worker 资源配置。

## 验证方案

建议至少准备 100 份脱敏简历，覆盖文本 PDF、扫描 PDF、双栏、多表格、中英文混排、7 页以上长简历以及图片简历，比较：

- OCR 完整率、阅读顺序、表格/项目经历恢复；
- 最终结构化 Schema 成功率和关键字段准确率；
- P50/P95 解析时延、超时率、重试率；
- Worker CPU time、RSS、heap/external memory 峰值；
- 单份成本及供应商限流表现。

验收建议：质量不得低于现有方案，7 页以上完整性必须显著改善，Worker CPU 与峰值 RSS 应有可观下降，再决定是否下调容器资源。

## 官方资料

- [阿里云百炼：文字提取（Qwen-OCR）](https://help.aliyun.com/zh/model-studio/qwen-vl-ocr)
- [阿里云百炼：Responses API](https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-responses)

## 调研边界

本报告基于仓库静态代码、已安装 SDK 类型和 2026-08-03 的官方文档；未使用生产凭据发起付费请求，也未对真实简历做质量、耗时和资源压测。
