# scripts

一次性运维、回填、迁移和评测脚本，用 `bun src/scripts/<name>.ts` 手动运行，不会被 Server 进程加载。

## 约定

- 脚本复用 Server 的 DAO、application 和共享包，不复制业务逻辑。
- 会写数据的脚本必须可以安全重跑（幂等），并支持先演练（dry-run）或缩小范围执行。
- 脚本的输入数据、fixture 和测试放在各自子目录里（例如 `structured-resume-eval/`）。
