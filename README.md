# lingbei-showcase

零杯 2026 数字创作大赛 · 作品展官网
<https://yourskenny.top/lingbei-showcase/>

## 本地预览

```bash
python3 -m http.server 8080 --directory .
# http://localhost:8080/
```

纯静态站点，无构建步骤。`index.html` 为唯一页面，作品详情使用 `#/work/<id>` 哈希路由与原生 `<dialog>`。

## 目录

- `data/works.json`、`assets/shots/`：流水线生成的数据与截图，**不要手改**
- `index.html`：首页、三厅、索引与详情容器
- `assets/css/site.css`：展签式视觉与响应式
- `assets/js/app.js`：数据加载、筛选、搜索、详情与深链
- `STATE.md` / `BACKLOG.md` / `progress/`：跨轮决策、待办与工作记录

## 约束

纯静态、移动端优先、无追踪、无后端；线上状态与提交数据为 2026.11.04 快照。
