#!/usr/bin/env python3
"""Build A-share research data with official filing links and sourced snapshots."""

import json
import re
import subprocess
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "public" / "data"
UA = "Mozilla/5.0 (compatible; ValueLedger/2.0; +https://github.com/LuoJake/value-ledger)"
CN_TZ = timezone(timedelta(hours=8))


def curl_json(url, *, referer, data=None, attempts=2):
    command = [
        "curl", "--http1.1", "--fail", "--silent", "--show-error",
        "--location", "--connect-timeout", "6", "--max-time", "15",
        "--user-agent", UA, "--header", f"Referer: {referer}",
    ]
    if data is not None:
        command += ["--request", "POST", "--header", "Content-Type: application/x-www-form-urlencoded", "--data", data]
    command.append(url)
    for attempt in range(attempts):
        try:
            result = subprocess.run(
                command, capture_output=True, text=True, encoding="utf-8", errors="strict",
                timeout=20, check=True,
            )
            return json.loads(result.stdout.lstrip("\ufeff"))
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired, json.JSONDecodeError):
            if attempt == attempts - 1:
                raise
            time.sleep(2 ** attempt)


def financials(company):
    secucode = f'{company["code"]}.{company["exchange"]}'
    filter_value = f'(SECUCODE="{secucode}")(REPORT_TYPE="年报")'
    query = urllib.parse.urlencode({
        "reportName": "RPT_F10_FINANCE_MAINFINADATA",
        "columns": "ALL",
        "filter": filter_value,
        "pageNumber": 1,
        "pageSize": 8,
        "sortTypes": -1,
        "sortColumns": "REPORT_DATE",
    })
    url = f"https://datacenter.eastmoney.com/securities/api/data/v1/get?{query}"
    payload = curl_json(url, referer="https://emweb.securities.eastmoney.com/")
    rows = payload.get("result", {}).get("data", [])
    series = []
    for row in reversed(rows[:6]):
        series.append({
            "year": str(row.get("REPORT_YEAR") or row["REPORT_DATE"][:4]),
            "reportDate": row.get("REPORT_DATE", "")[:10],
            "noticeDate": row.get("NOTICE_DATE", "")[:10],
            "revenue": row.get("TOTALOPERATEREVE"),
            "netProfit": row.get("PARENTNETPROFIT"),
            "operatingCashFlow": None if company["type"] == "financial" else row.get("NETCASH_OPERATE_PK"),
            "roe": row.get("ROEJQ"),
            "debtRatio": row.get("ZCFZL"),
            "eps": row.get("EPSJB"),
            "bookValuePerShare": row.get("BPS"),
            "grossMargin": None if company["type"] == "financial" else row.get("XSMLL"),
        })
    return series, url


def price_snapshot(company):
    market = "1" if company["exchange"] == "SH" else "0"
    fields = "f43,f44,f45,f46,f57,f58,f60,f116,f117,f162,f167,f168"
    url = f'https://push2.eastmoney.com/api/qt/stock/get?secid={market}.{company["code"]}&fields={fields}'
    row = curl_json(url, referer="https://quote.eastmoney.com/", attempts=1).get("data") or {}
    scaled = lambda key: row.get(key) / 100 if isinstance(row.get(key), (int, float)) else None
    price = scaled("f43")
    previous = scaled("f60")
    return {
        "price": price,
        "previousClose": previous,
        "changePct": ((price / previous - 1) * 100) if price is not None and previous else None,
        "marketCap": row.get("f116"),
        "floatMarketCap": row.get("f117"),
        "peTtm": scaled("f162"),
        "pb": scaled("f167"),
        "turnoverRate": scaled("f168"),
        "retrievedAt": datetime.now(CN_TZ).isoformat(),
        "provider": "东方财富行情接口",
        "freshness": "延迟快照，禁止用于交易下单",
        "sourceUrl": f'https://quote.eastmoney.com/{"sh" if company["exchange"] == "SH" else "sz"}{company["code"]}.html',
    }


def sse_announcements(company):
    params = {
        "isPagination": "true", "productId": company["code"], "keyWord": "",
        "securityType": "0101,120100,020100,020200,120200",
        "pageHelp.pageSize": 50, "pageHelp.pageCount": 50, "pageHelp.pageNo": 1,
        "pageHelp.beginPage": 1, "pageHelp.cacheSize": 1, "pageHelp.endPage": 1,
    }
    url = "https://query.sse.com.cn/security/stock/queryCompanyBulletin.do?" + urllib.parse.urlencode(params)
    data = curl_json(url, referer="https://www.sse.com.cn/")
    return [{
        "date": item.get("SSEDATE"), "title": item.get("TITLE"),
        "type": item.get("BULLETIN_HEADING") or item.get("BULLETIN_TYPE"),
        "url": "https://www.sse.com.cn" + item.get("URL", ""), "source": "上海证券交易所",
    } for item in data.get("pageHelp", {}).get("data", [])]


def cninfo_announcements(company, searchkey=""):
    end = datetime.now(CN_TZ).date()
    start = end - timedelta(days=550)
    form = urllib.parse.urlencode({
        "pageNum": 1, "pageSize": 50, "column": "szse", "tabName": "fulltext",
        "plate": "sz", "stock": f'{company["code"]},{company["orgId"]}', "searchkey": searchkey,
        "secid": "", "category": "", "trade": "", "seDate": f"{start}~{end}",
        "sortName": "", "sortType": "", "isHLtitle": "true",
    })
    data = curl_json(
        "https://www.cninfo.com.cn/new/hisAnnouncement/query",
        referer="https://www.cninfo.com.cn/", data=form,
    )
    return [{
        "date": datetime.fromtimestamp(item["announcementTime"] / 1000, CN_TZ).date().isoformat(),
        "title": re.sub(r"<[^>]+>", "", item.get("announcementTitle") or ""), "type": "公司公告",
        "url": "https://static.cninfo.com.cn/" + item.get("adjunctUrl", ""),
        "source": "巨潮资讯（证监会指定披露平台）",
    } for item in (data.get("announcements") or [])]


def find_annual_report(announcements, year):
    matches = [item for item in announcements if f"{year}年" in item["title"] and "年度报告" in item["title"] and "摘要" not in item["title"]]
    return matches[0] if matches else None


def build_company(company):
    series, financial_url = financials(company)
    time.sleep(0.2)
    announcements = sse_announcements(company) if company["exchange"] == "SH" else cninfo_announcements(company)
    verification_pool = announcements
    if company["exchange"] == "SZ":
        verification_pool = cninfo_announcements(company, "年度报告")
    time.sleep(0.2)
    try:
        quote = price_snapshot(company)
    except Exception as exc:
        print(f'Quote unavailable for {company["code"]}: {exc}')
        quote = {
            "price": None, "previousClose": None, "changePct": None,
            "marketCap": None, "peTtm": None, "pb": None,
            "retrievedAt": datetime.now(CN_TZ).isoformat(),
            "provider": "东方财富行情接口", "freshness": "行情接口暂不可用",
            "sourceUrl": f'https://quote.eastmoney.com/{"sh" if company["exchange"] == "SH" else "sz"}{company["code"]}.html',
        }
    latest = series[-1] if series else {}
    annual_report = find_annual_report(verification_pool, latest.get("year")) if latest else None
    return {
        **company,
        "symbol": f'{company["code"]}.{company["exchange"]}',
        "exchangeName": "上海证券交易所" if company["exchange"] == "SH" else "深圳证券交易所",
        "metrics": {key: latest.get(key) for key in (
            "revenue", "netProfit", "operatingCashFlow", "roe", "debtRatio", "eps", "bookValuePerShare", "grossMargin"
        )},
        "series": series,
        "quote": quote,
        "announcements": announcements[:12],
        "verification": {
            "status": "matched" if annual_report else "unmatched",
            "message": "已匹配交易所年度报告原文" if annual_report else "未自动匹配年度报告，请人工复核",
            "annualReport": annual_report,
        },
        "financialSource": {
            "name": "东方财富结构化财务数据",
            "url": financial_url,
            "role": "计算辅助；最终以交易所/巨潮公告原文为准",
        },
    }


def macro_dataset():
    definitions = {
        "gdp": ("RPT_ECONOMY_GDP", 8, ["REPORT_DATE", "DOMESTICL_PRODUCT_BASE", "SUM_SAME"]),
        "cpi": ("RPT_ECONOMY_CPI", 12, ["REPORT_DATE", "NATIONAL_SAME", "NATIONAL_SEQUENTIAL"]),
        "pmi": ("RPT_ECONOMY_PMI", 12, ["REPORT_DATE", "MAKE_INDEX", "NMAKE_INDEX"]),
        "money": ("RPT_ECONOMY_CURRENCY_SUPPLY", 12, ["REPORT_DATE", "BASIC_CURRENCY_SAME", "CURRENCY_SAME", "FREE_CASH_SAME"]),
    }

    def fetch_one(item):
        key, (report, size, fields) = item
        query = urllib.parse.urlencode({
            "reportName": report, "columns": "ALL", "sortColumns": "REPORT_DATE",
            "sortTypes": -1, "pageNumber": 1, "pageSize": size,
        })
        url = f"https://datacenter-web.eastmoney.com/api/data/v1/get?{query}"
        payload = curl_json(url, referer="https://data.eastmoney.com/")
        rows = payload.get("result", {}).get("data", [])
        return key, [{field: row.get(field) for field in fields} for row in reversed(rows)]

    output = {}
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = [executor.submit(fetch_one, item) for item in definitions.items()]
        for future in as_completed(futures):
            key, rows = future.result()
            output[key] = rows
    output["sources"] = [
        {"name": "国家统计局", "url": "https://www.stats.gov.cn/sj/", "covers": "GDP、CPI、PMI 官方发布"},
        {"name": "中国人民银行", "url": "https://www.pbc.gov.cn/diaochatongjisi/116219/index.html", "covers": "货币供应量官方发布"},
        {"name": "东方财富宏观数据", "url": "https://data.eastmoney.com/cjsj/", "covers": "结构化整理与自动计算"},
    ]
    return output


def main():
    config = json.loads((DATA_DIR / "watchlist.json").read_text(encoding="utf-8"))
    companies_by_code, errors = {}, []
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = {executor.submit(build_company, company): company for company in config["companies"]}
        for future in as_completed(futures):
            company = futures[future]
            try:
                companies_by_code[company["code"]] = future.result()
                print(f'Fetched {company["code"]} {company["name"]}')
            except Exception as exc:
                errors.append({"code": company["code"], "name": company["name"], "error": str(exc)})
                print(f'Failed {company["code"]}: {exc}')
    companies = [companies_by_code[item["code"]] for item in config["companies"] if item["code"] in companies_by_code]
    try:
        macro = macro_dataset()
        print("Fetched official-source macro indicators")
    except Exception as exc:
        macro = {"error": str(exc), "sources": []}
        print(f"Macro data unavailable: {exc}")
    output = {
        "generatedAt": datetime.now(CN_TZ).isoformat(),
        "market": "中国 A 股",
        "sourcePolicy": "财务指标使用结构化辅助源计算，逐家公司链接交易所或巨潮官方公告复核；行情为延迟快照。",
        "companies": companies,
        "macro": macro,
        "errors": errors,
    }
    (DATA_DIR / "a-share-data.json").write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    if not companies:
        raise SystemExit("No A-share data could be fetched")


if __name__ == "__main__":
    main()
