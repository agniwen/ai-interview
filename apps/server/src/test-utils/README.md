# test-utils

Server 集成测试共用的数据库夹具：唯一 fixture ID、测试数据清理、跨测试文件的 advisory lock。

## 边界

- 只被测试 import，生产代码不能依赖。
- 需要真实数据库的测试共用同一个库，所以清理必须精确到自己创建的数据，并在需要时加锁。
