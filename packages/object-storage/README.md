# @app/object-storage

后端共享的 S3-compatible 对象存储基础包，提供 client 构造、对象 key 处理、上传、读取、复制和删除等通用原语。

## 职责与边界

- 屏蔽具体 S3/R2 endpoint、签名和基础请求差异。
- 为 Server、Worker 和 processing 包提供一致的对象操作接口。
- 不决定“哪类业务文件保存多久”、数据库引用关系或 HTTP 授权；这些属于业务 owner。
- 不在浏览器端使用，也不把访问密钥暴露给 `@app/shared` 或 Web bundle。

## 如何修改或新增

- 通用存储操作在 `src/index.ts` 扩展，输入应明确 bucket/key/content type，避免业务命名。
- 新增 provider 差异时优先通过配置或小 adapter 处理，不复制整套 client。
- 删除/覆盖操作必须保持目标精确，并为 key 编码、not-found 和 provider error 添加测试。
- 业务级预签名权限、保留期和审计在调用方实现。

```bash
bun run --filter @app/object-storage typecheck
bun run --filter @app/object-storage test
```
