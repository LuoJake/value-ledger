# 衡石 · A 股价值投资研究台

面向长期价值投资者的静态研究工具。主分支只覆盖中国 A 股；原来的美股 SEC 版本保存在 `us-market-v1` 分支。

## 数据来源与边界

| 层级 | 来源 | 用途 |
| --- | --- | --- |
| 法定披露 | 上海证券交易所、巨潮资讯 | 年报核验、公司公告原文 |
| 结构化财务 | 东方财富财务数据接口 | 多年指标与图表计算 |
| 行情快照 | 东方财富行情接口 | 延迟估值参考，不能用于交易 |

结构化数据会自动尝试匹配同年度的官方年报 PDF。页面明确显示匹配状态；未匹配时必须人工复核，不应仅凭图表决策。行情接口失败不会影响财报与公告更新。

## 本地运行

```powershell
npm.cmd install
python scripts/fetch_a_share_data.py
npm.cmd run dev
```

## 添加股票覆盖

网页内添加自选只影响当前浏览器。若代码尚未进入数据集，请编辑 `public/data/watchlist.json`，提供代码、交易所、名称、巨潮 `orgId` 和公司类型，再运行抓取脚本。深市公司的 `orgId` 可从巨潮官方 `https://www.cninfo.com.cn/new/data/szse_stock.json` 查询。

`type` 为 `financial` 时，页面不会横向展示经营现金流，避免把银行、保险与一般企业混用同一分析口径。

## 自动更新与发布

- `update-data.yml` 每两小时抓取财务、行情与官方披露并提交变化。
- `deploy.yml` 在主分支推送或数据更新成功后发布 GitHub Pages。
- GitHub Pages 地址：`https://luojake.github.io/value-ledger/`

本站只用于研究，不构成投资建议。重大投资决定应回到交易所或巨潮资讯原始文件，并阅读审计意见、附注、风险因素和管理层讨论。
