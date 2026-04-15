# 微信小程序：洛克星盘 已上线

此项目已转到微信小程序，所以不再进行维护


# 洛克星盘：洛克王国世界工具站

一个基于 `Vue 3 + Vite + Element Plus` 的前端查询工具站，面向《洛克王国世界》玩家，提供精灵蛋数据查询、蛋组检索、繁殖匹配与异色孵化路线规划能力。

---

## ✨ 核心功能

### 1) 精灵蛋尺寸查询
输入蛋的尺寸与重量，系统返回候选精灵并给出概率参考，支持以下命中层级：

- 精准命中（精确记录）
- 容差命中 1（尺寸 ±0.01，重量 ±0.1）
- 容差命中 2（尺寸 ±0.02，重量 ±0.2）
- 范围命中
- 最近候选兜底

特性：
- 同一命中档内按“距离输入值更近”优先排序
- 候选可显示对应精灵图片
- 支持回车直接触发查询

---

### 2) 蛋组查询
按「精灵名称」或「蛋组关键词」查询蛋组关系，支持进化链展示与结果聚合。

适合用于：
- 快速确认某精灵所属蛋组
- 反查同蛋组精灵集合

---

### 3) 繁殖匹配查询
输入目标精灵（母系）后，系统返回父系候选，并显示可配对信息、进化链和蛋组标签。

适合用于：
- 规划目标精灵的繁殖路径
- 快速筛选可行父系

---

### 4) 异色孵化路线规划
支持维护“已有异色清单（含雌/雄）”，系统会结合当前数据自动给出：

- 已拥有 / 可获取 / 不可获取状态
- 推荐路线与进度展示
- 候选列表排序与分组

适合用于：
- 以“集齐异色”为目标进行阶段性推进

---

## Star History

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=mfskys/rocomegg&type=date&theme=dark&legend=top-left" />
  <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=mfskys/rocomegg&type=date&legend=top-left" />
  <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=mfskys/rocomegg&type=date&legend=top-left" />
</picture>