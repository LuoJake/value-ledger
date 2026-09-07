#!/usr/bin/env python3
"""Build the static fundamentals dataset from official SEC EDGAR APIs."""

import json
import os
import subprocess
import time
import urllib.request
from urllib.error import HTTPError, URLError
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "public" / "data"
USER_AGENT = os.environ.get(
    "SEC_USER_AGENT", "ValueLedger/1.0 research@example.com"
)
HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "application/json,text/plain,*/*",
    "Accept-Language": "en-US,en;q=0.9",
}

# Stable SEC identifiers for the starter universe. The ticker directory is
# still used when available, so extending watchlist.json needs no code change.
STARTER_CIKS = {
    "AAPL": (320193, "Apple Inc."),
    "BRK-B": (1067983, "Berkshire Hathaway Inc."),
    "COST": (909832, "Costco Wholesale Corporation"),
    "GOOG": (1652044, "Alphabet Inc."),
    "KO": (21344, "The Coca-Cola Company"),
    "MSFT": (789019, "Microsoft Corporation"),
}


def get_json(url):
    for attempt in range(2):
        try:
            request = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.load(response)
        except (HTTPError, URLError):
            if attempt == 1:
                result = subprocess.run(
                    ["curl", "--http1.1", "--fail", "--silent", "--show-error", "--location", "--user-agent", USER_AGENT, url],
                    capture_output=True,
                    text=True,
                    timeout=45,
                    check=True,
                )
                return json.loads(result.stdout)
            time.sleep(2 ** attempt)


def annual_series(facts, candidates, unit="USD", instant=False):
    chosen = {}
    for tag in candidates:
        fact = facts.get("us-gaap", {}).get(tag)
        if not fact:
            continue
        units = fact.get("units", {}).get(unit, [])
        for item in units:
            if item.get("form") not in ("10-K", "10-K/A") or not item.get("fy") or not item.get("end"):
                continue
            # A 10-K repeats comparative years with the filing's current `fy`.
            # Only keep the fact whose period end belongs to that fiscal year.
            if int(item["end"][:4]) != int(item["fy"]):
                continue
            if instant:
                if item.get("fp") != "FY":
                    continue
            else:
                start, end = item.get("start"), item.get("end")
                if not start or not end:
                    continue
                days = (datetime.fromisoformat(end) - datetime.fromisoformat(start)).days
                if not 300 <= days <= 430:
                    continue
            year = item["end"][:4]
            # Candidate tags are ordered by preference. A later candidate only
            # fills a missing year; amendments can replace the same tag's fact.
            if year not in chosen:
                chosen[year] = {**item, "_tag": tag}
            elif chosen[year]["_tag"] == tag and item.get("filed", "") > chosen[year].get("filed", ""):
                chosen[year] = {**item, "_tag": tag}
    return [
        {"year": year, "value": chosen[year]["val"], "filed": chosen[year].get("filed")}
        for year in sorted(chosen, key=int)[-6:]
    ]


def latest(series):
    return series[-1]["value"] if series else None


def filing_url(cik, accession, document):
    accession_flat = accession.replace("-", "")
    return f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{accession_flat}/{document}"


def build_company(ticker, cik, company_name):
    padded = str(cik).zfill(10)
    company_facts = get_json(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{padded}.json")
    time.sleep(0.12)
    submissions = get_json(f"https://data.sec.gov/submissions/CIK{padded}.json")
    facts = company_facts.get("facts", {})

    revenue = annual_series(facts, ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"])
    net_income = annual_series(facts, ["NetIncomeLoss", "ProfitLoss"])
    operating_cash = annual_series(facts, ["NetCashProvidedByUsedInOperatingActivities"])
    capex = annual_series(facts, ["PaymentsToAcquirePropertyPlantAndEquipment"])
    equity = annual_series(facts, ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"], instant=True)
    assets = annual_series(facts, ["Assets"], instant=True)
    liabilities = annual_series(facts, ["Liabilities"], instant=True)
    cash = annual_series(facts, ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"], instant=True)
    shares = annual_series(facts, ["WeightedAverageNumberOfDilutedSharesOutstanding"], unit="shares")

    capex_by_year = {x["year"]: x["value"] for x in capex}
    fcf = [
        {"year": x["year"], "value": x["value"] - capex_by_year.get(x["year"], 0), "filed": x["filed"]}
        for x in operating_cash
    ]

    recent = submissions.get("filings", {}).get("recent", {})
    filings = []
    for index, form in enumerate(recent.get("form", [])):
        if form not in ("10-K", "10-Q"):
            continue
        accession = recent["accessionNumber"][index]
        document = recent["primaryDocument"][index]
        filings.append({
            "form": form,
            "filed": recent["filingDate"][index],
            "period": recent["reportDate"][index],
            "url": filing_url(cik, accession, document),
        })
        if len(filings) == 6:
            break

    latest_equity = latest(equity)
    latest_income = latest(net_income)
    latest_assets = latest(assets)
    latest_liabilities = latest(liabilities)
    metrics = {
        "revenue": latest(revenue),
        "netIncome": latest_income,
        "freeCashFlow": latest(fcf),
        "equity": latest_equity,
        "cash": latest(cash),
        "roe": latest_income / latest_equity if latest_income is not None and latest_equity else None,
        "liabilitiesToAssets": latest_liabilities / latest_assets if latest_liabilities is not None and latest_assets else None,
    }
    return {
        "ticker": ticker,
        "name": company_facts.get("entityName") or company_name,
        "cik": padded,
        "fiscalYearEnd": submissions.get("fiscalYearEnd"),
        "metrics": metrics,
        "series": {"revenue": revenue, "netIncome": net_income, "freeCashFlow": fcf, "shares": shares},
        "filings": filings,
        "source": f"https://data.sec.gov/api/xbrl/companyfacts/CIK{padded}.json",
    }


def main():
    config = json.loads((DATA_DIR / "watchlist.json").read_text(encoding="utf-8"))
    lookup = dict(STARTER_CIKS)
    requested = [ticker.upper().replace(".", "-") for ticker in config["tickers"]]
    if any(ticker not in lookup for ticker in requested):
        try:
            tickers = get_json("https://www.sec.gov/files/company_tickers.json")
            lookup.update({
                row["ticker"].upper().replace(".", "-"): (row["cik_str"], row["title"])
                for row in tickers.values()
            })
        except Exception as exc:
            print(f"SEC ticker directory unavailable; using starter CIK map: {exc}")
    companies, errors = [], []
    for ticker in config["tickers"]:
        key = ticker.upper().replace(".", "-")
        try:
            cik, name = lookup[key]
            companies.append(build_company(key, cik, name))
            print(f"Fetched {key}")
        except Exception as exc:
            errors.append({"ticker": key, "error": str(exc)})
            print(f"Failed {key}: {exc}")
        time.sleep(0.12)
    output = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "U.S. Securities and Exchange Commission EDGAR",
        "sourceUrl": "https://www.sec.gov/edgar/sec-api-documentation",
        "companies": companies,
        "errors": errors,
    }
    (DATA_DIR / "fundamentals.json").write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    if not companies:
        raise SystemExit("No company data could be fetched")


if __name__ == "__main__":
    main()
