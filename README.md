# 洛克王国世界精灵蛋查询站

一个基于 **Vue 3 + Vite + Element Plus** 的前端静态网站。  
核心功能：输入精灵蛋的 **直径（m）** 与 **重量（kg）**，返回可能孵化的候选精灵与概率。

---

## 技术栈

- Vue 3
- Vite
- Element Plus
- JSON（`public/data`）

---

## 本地开发

```bash
npm install
npm run dev
```

默认地址：`http://localhost:5173/`

---

## 构建

```bash
npm run build
npm run preview
```

---

## 重要配置

`vite.config.js` 中 `base` 必须与仓库名一致。  
仓库名为 `rocomegg` 时应配置：

```js
base: '/rocomegg/'
```

否则上线后可能出现资源 404 或白屏。

---

## 数据文件

- `public/data/egg-measurements-final.json`：查询使用的正式数据
- `public/data/creatures-master-list.json`：精灵主清单（用于编号映射）

数据建议规范：

- 直径单位：`m`
- 重量单位：`kg`
- 范围格式支持：`0.45~0.65`、`1.17-1.25`、`3.2`

---

## 图标（Favicon）

当前图标文件：

- `public/rocom.ico`

如需替换，覆盖该文件后重新构建/部署即可。

---

## 常见问题

### 页面提示“数据加载失败，请检查 public/data/*.json”
请检查：

1. `vite.config.js` 的 `base` 是否正确
2. `public/data` 下文件是否存在且命名正确
3. 是否强刷缓存（`Ctrl + F5`）

### 页面更新不及时
- 等待几分钟后再访问
- 强刷浏览器缓存

---

## License

MIT