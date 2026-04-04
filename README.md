# 洛克王国世界精灵蛋查询站

一个基于 **Vue 3 + Vite + Element Plus** 的前端静态网站。  
核心功能：输入精灵蛋的 **直径（m）** 与 **重量（kg）**，返回可能孵化的候选精灵与概率。

- 在线地址（GitHub Pages）：`https://mfskys.github.io/rocomegg/`
- 仓库地址：`https://github.com/mfskys/rocomegg`

---

## 1. 技术栈

- **Vue 3**：页面框架
- **Vite**：开发与构建工具
- **Element Plus**：UI 组件库
- **JSON（public/data）**：静态数据存储
- **GitHub Pages**：静态站部署

---

## 2. 目录结构

```text
rock-egg-table/
├─ public/
│  ├─ rocom.ico
│  └─ data/
│     ├─ creatures-master-list.json        # 精灵主清单（id + name）
│     └─ egg-measurements-final.json       # 精灵蛋直径/重量与精灵对照数据（正式）
├─ src/
│  ├─ App.vue
│  ├─ main.js
│  └─ style.css
├─ index.html
├─ vite.config.js
└─ package.json
```

---

## 3. 本地开发

> 建议 Node.js 版本：18+

### 安装依赖

```bash
npm install
```

### 启动开发环境

```bash
npm run dev
```

默认地址：`http://localhost:5173/`

---

## 4. 构建与预览

### 生产构建

```bash
npm run build
```

### 本地预览构建结果

```bash
npm run preview
```

---

## 5. GitHub Pages 部署

本项目使用 `gh-pages` 发布 `dist` 目录到 `gh-pages` 分支。

### 一键部署

```bash
npm run deploy
```

### GitHub 仓库 Pages 设置

进入仓库：

`Settings -> Pages -> Build and deployment`

- Source: `Deploy from a branch`
- Branch: `gh-pages`
- Folder: `/(root)`

---

## 6. 重要配置说明（务必检查）

### `vite.config.js` 中 `base` 必须与仓库名一致

仓库名为 `rocomegg` 时，应配置：

```js
base: '/rocomegg/'
```

否则上线后可能出现资源 404 或白屏。

---

## 7. 数据维护说明

### 数据文件

- `public/data/egg-measurements-final.json`：查询使用的正式数据
- `public/data/creatures-master-list.json`：精灵主清单（用于编号映射）

### 建议规范

- 直径单位：`m`
- 重量单位：`kg`
- 范围支持格式：如 `0.45~0.65`、`1.17-1.25`、`3.2`
- 更新数据后执行：
  1. `npm run build`
  2. 本地确认页面无报错
  3. `npm run deploy`

---

## 8. 图标（Favicon）

当前站点图标使用：

- `public/rocom.ico`

若要替换图标，直接覆盖该文件并重新部署。

---

## 9. 常见问题

### Q1：页面提示“数据加载失败，请检查 public/data/*.json”
常见原因：
- Pages 子路径下资源地址错误
- 数据文件名不一致
- `base` 配置与仓库名不一致

请优先检查：
1. `vite.config.js` 中 `base`
2. `public/data` 下 JSON 文件是否存在
3. 部署后是否已刷新缓存（`Ctrl + F5`）

### Q2：部署成功但页面是旧内容
- 再执行一次 `npm run deploy`
- 等待 1~5 分钟
- 浏览器强刷

---

## 10. 开发建议（可选）

- 开启 GitHub 安全提醒：`Settings -> Security -> Dependabot alerts`
- 可在后续改为 GitHub Actions 自动部署，减少手动部署步骤
- 建议新增 issue 模板用于记录数据修正与命名映射

---

## 11. License

本项目使用 **MIT License**。

---