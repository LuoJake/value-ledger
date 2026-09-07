# 衡石 · Value Ledger

面向长期价值投资者的静态研究台。第一版覆盖向美国 SEC 申报的公司，财务数据来自 SEC EDGAR 的 Company Facts XBRL 与原始 10-K/10-Q 申报。

## 本地运行

```powershell
npm.cmd install
$env:SEC_USER_AGENT = "ValueLedger/1.0 your-email@example.com"
python scripts/fetch_sec_data.py
npm.cmd run dev
```

SEC 要求自动请求提供可联系的 User-Agent。请将示例邮箱替换为自己的联系邮箱，并控制请求频率。

## 添加数据覆盖

网页内添加自选只改变浏览器本地列表。若股票尚未进入静态数据集，请在 `public/data/watchlist.json` 中加入其美股代码，再运行抓取脚本。首批公司使用固定 SEC CIK；其他代码会通过 SEC 官方 ticker 目录解析。

## GitHub Pages

仓库包含两个 Actions：

- `deploy.yml`：推送 `main` 后构建并发布 GitHub Pages。
- `update-data.yml`：每天抓取一次 SEC 数据并提交有变化的数据文件。

在仓库 `Settings > Secrets and variables > Actions` 中添加 `SEC_CONTACT_EMAIL`，内容为有效联系邮箱；然后在 `Settings > Pages` 中把 Source 设为 `GitHub Actions`。

## 数据边界

- 财报数字来自官方结构化申报，但不同公司 XBRL 标签可能不同；重要判断必须回看原始申报与附注。
- 页面不提供实时价格，也不构成投资建议。
- 自选、备忘录、检查项和估值输入只保存在当前浏览器，不会上传。
