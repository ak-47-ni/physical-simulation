# 2026-04-13 Worker C Plan

## 先读

先阅读总控文档：

- `docs/superpowers/plans/2026-04-13-physics-sandbox-arc-track-handoff-and-runtime-trajectory-master-plan.md`

## 你的目标

补齐这次问题缺失的“跨层真实回归”。

当前已有部分桌面端测试会 mock `tick_runtime`，这类测试不能证明真实的 bridge + sim-core 物理链路是否正常。你要补的是更接近真实用户场景的回归覆盖。

## 你拥有的修改边界

优先修改这些文件或新增同类文件：

- `crates/sim-core/tests/` 下新增一个面向真实用户场景的回归测试文件
- `apps/desktop/src/state/runtimeCompileRequest.test.ts`
- 如需要，可新增桌面端 compile contract 测试文件

不要修改：

- `crates/sim-core/src/solver.rs`
- `crates/sim-core/src/bridge.rs`
- `apps/desktop/src/analysis/useRuntimeTrajectorySamples.ts`

如果你发现必须动这些核心文件，先停，不要越界。

## 你要覆盖的链路

### 1. 桌面端 authoring payload 契约

验证 anchored `arc-track` 进入 runtime compile request 时，以下字段没有丢失或串错：

- `anchorEntityId`
- `anchorEntityKind`
- `anchorEndpoint`
- `entryEndpoint`
- `radius`
- `sweepAngleDegrees`
- `rotationDegrees`

### 2. bridge -> sim-core 的真实用户场景回归

需要新增一条接近真实用户使用的测试：

- 一个锁定 `board`
- 一个吸附在 board 端点的 `arc-track`
- 一个带水平速度、朝端点运动的 `ball`
- 通过真实 compile / runtime step 链路推进

期望：

- 在进入 junction 后，`ball` 不应像轨道不存在一样立刻掉落
- 如果后续支撑不足，可以脱轨，但不能在入口处直接失效

### 3. 不依赖 UI mock tick 证明物理正确

你新增的核心物理回归不能建立在手工拼出来的 fake frame 上。

## 建议实施方式

1. 在 `crates/sim-core/tests/` 新建一条完整 regression，用 bridge payload 或 compile request 驱动 runtime。
2. 在桌面端补 compile request contract 测试，确保 authoring 侧字段稳定。
3. 如发现现有测试覆盖了旧模型假设，记录出来，但本轮不要顺手大面积清理无关旧测试。

## 需要输出的信息

1. 你新增了哪条“真实用户场景”回归。
2. 这条回归如何避免再次出现“桌面端看起来对，真实 runtime 仍然错”的情况。
3. 提交时列出你改过的文件。

## 建议自检

1. 跑你新增的 `crates/sim-core/tests/...` 回归文件
2. 跑 `runtimeCompileRequest` 相关测试
3. 如果你新增桌面端测试，确认它们不依赖 fake physics frame 来证明 arc-track handoff
