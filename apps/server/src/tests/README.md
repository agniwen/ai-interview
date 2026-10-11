# tests

Server 级别的测试：应用工厂与路由组织边界、后端运行时边界、错误处理和内部错误响应约定。

- `recruiting-workflows/`：针对 `@app/recruiting-workflows` 的真实数据库集成测试。它们需要 Server 的测试环境和数据库夹具，所以放在这里，而不是包里。

各能力自己的测试放在对应目录下的 `tests/`。
