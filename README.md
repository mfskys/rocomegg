# 洛克王国世界工具站（rocomegg）

一个基于 `Vue 3 + Vite + Element Plus` 的前端查询工具站，面向《洛克王国世界》玩家，提供精灵蛋数据、蛋组关系与异色孵化路线规划能力。

> 项目定位：**纯前端静态站点**，可本地运行，也可部署到任意静态托管平台。

- 在线地址：`https://rocom.mfsky.qzz.io/`
- 仓库地址：`https://github.com/mfskys/rocomegg`

---

## ✨ 核心功能

### 1) 精灵蛋尺寸查询
输入蛋的尺寸（m）与重量（kg），返回候选精灵并给出概率参考：

- 完全命中（精确记录）
- 范围命中
- 近似候选

适合用于：根据游戏内蛋参数快速反推可能孵化对象。

---

### 2) 蛋组查询
按「精灵名称关键词」和/或「蛋组关键词」检索蛋组数据，支持查看进化链与蛋组标签。

适合用于：快速确认某精灵所属蛋组、查找同蛋组成员。

---

### 3) 繁殖匹配查询
输入目标精灵（母系），返回父系候选并展示可配对关系、进化链与蛋组信息。

适合用于：确定当前母系可搭配的父系范围。

---

### 4) 异色孵化路线规划
通过“添加已有异色（可标注雌/雄）”构建你的当前异色池，系统自动给出：

- 已拥有 / 可获取 / 不可获取状态
- 路线卡片与进度条
- 可孵化候选排序
- 下方完整异色候选列表

适合用于：以“集齐异色”为目标进行分步推进。

---

## 🤝 贡献建议

欢迎提交 Issue / PR，常见可贡献方向：

- 数据补充与纠错（蛋组、进化链、异色名单）
- UI/交互体验优化（移动端、可视化）
- 查询逻辑与路线规划算法优化

---

## 📄 License

本项目使用 `LICENSE` 文件中声明的协议。

---

## Star History

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=mfskys/rocomegg&type=date&theme=dark&legend=top-left" />
  <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=mfskys/rocomegg&type=date&legend=top-left" />
  <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=mfskys/rocomegg&type=date&legend=top-left" />
</picture>