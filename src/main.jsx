import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AlertTriangle, BarChart3, BookOpen, Check, ChevronRight, CircleHelp,
  ExternalLink, FileText, Landmark, Menu, Plus, RefreshCw, Search,
  Settings, ShieldCheck, Trash2, X,
} from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip,
  XAxis, YAxis,
} from 'recharts';
import './styles.css';

const QUOTES = [
  ['价格是你付出的，价值是你得到的。', '沃伦·巴菲特'],
  ['投资最重要的不是智商，而是性格。', '沃伦·巴菲特'],
  ['知道自己不知道什么，比聪明更有用。', '查理·芒格'],
  ['市场短期是投票机，长期是称重机。', '本杰明·格雷厄姆'],
  ['如果你不愿持有一家公司十年，就不要考虑持有十分钟。', '沃伦·巴菲特'],
  ['避免愚蠢，比追求聪明容易得多。', '查理·芒格'],
  ['最大的投资风险不是价格波动，而是永久性损失。', '霍华德·马克斯'],
];

const CHECKS = [
  '我能用三句话解释公司如何赚钱',
  '我阅读过最新年报，而不是只看二手观点',
  '增长来自真实经营，而非并购或会计调整',
  '管理层资本配置记录经得起检验',
  '即使股价三年不涨，我仍愿意持有',
  '买入价留有足够安全边际',
];

const formatMoney = (value) => {
  if (value == null) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${(value / 1e12).toFixed(2)} 万亿`;
  if (abs >= 1e8) return `${(value / 1e8).toFixed(1)} 亿`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(1)} 百万`;
  return new Intl.NumberFormat('zh-CN').format(value);
};

const pct = (value) => value == null ? '—' : `${(value * 100).toFixed(1)}%`;
const growth = (series = []) => {
  if (series.length < 2 || !series[0].value || !series.at(-1).value) return null;
  return Math.pow(series.at(-1).value / series[0].value, 1 / (series.length - 1)) - 1;
};

function Metric({ label, value, note, tone }) {
  return <div className="metric">
    <div className="metric-label">{label}<CircleHelp size={13} /></div>
    <strong className={tone || ''}>{value}</strong>
    <span>{note}</span>
  </div>;
}

function EmptyState() {
  return <main className="empty-state">
    <AlertTriangle size={28} />
    <h2>财报数据暂未生成</h2>
    <p>运行 <code>python scripts/fetch_sec_data.py</code> 后刷新页面。抓取失败时不会展示猜测值。</p>
  </main>;
}

function App() {
  const [dataset, setDataset] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState(localStorage.getItem('vl-selected') || 'AAPL');
  const [watchlist, setWatchlist] = useState(() => JSON.parse(localStorage.getItem('vl-watchlist') || '["AAPL","BRK-B","COST","GOOG"]'));
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [checks, setChecks] = useState(() => JSON.parse(localStorage.getItem('vl-checks') || '{}'));
  const [notes, setNotes] = useState(() => JSON.parse(localStorage.getItem('vl-notes') || '{}'));
  const [price, setPrice] = useState('');
  const [eps, setEps] = useState('');
  const [multiple, setMultiple] = useState('18');
  const [margin, setMargin] = useState('25');

  useEffect(() => {
    fetch('./data/fundamentals.json').then((r) => {
      if (!r.ok) throw new Error('missing');
      return r.json();
    }).then((data) => {
      setDataset(data);
      if (!data.companies.some((c) => c.ticker === selected) && data.companies.length) setSelected(data.companies[0].ticker);
    }).catch(() => setLoadError(true));
  }, []);

  useEffect(() => localStorage.setItem('vl-watchlist', JSON.stringify(watchlist)), [watchlist]);
  useEffect(() => localStorage.setItem('vl-selected', selected), [selected]);
  useEffect(() => localStorage.setItem('vl-checks', JSON.stringify(checks)), [checks]);
  useEffect(() => localStorage.setItem('vl-notes', JSON.stringify(notes)), [notes]);

  const company = dataset?.companies.find((c) => c.ticker === selected) || dataset?.companies[0];
  const quote = QUOTES[Math.floor(Date.now() / 86400000) % QUOTES.length];
  const annual = useMemo(() => {
    if (!company) return [];
    const keyed = {};
    Object.entries(company.series).forEach(([name, series]) => series.forEach((v) => {
      keyed[v.year] ||= { year: v.year };
      keyed[v.year][name] = v.value;
    }));
    return Object.values(keyed).sort((a, b) => a.year.localeCompare(b.year));
  }, [company]);
  const maxBuy = Number(eps) * Number(multiple) * (1 - Number(margin) / 100);
  const impliedUpside = Number(price) > 0 ? maxBuy / Number(price) - 1 : null;
  const companyChecks = checks[selected] || [];

  const choose = (ticker) => { setSelected(ticker); setMenuOpen(false); setTab('overview'); };
  const addTicker = () => {
    const ticker = query.trim().toUpperCase().replace('.', '-');
    if (!ticker) return;
    if (!dataset?.companies.some((c) => c.ticker === ticker)) {
      alert('该代码尚未进入本站 SEC 数据集。请先在 public/data/watchlist.json 中加入代码并运行更新工作流。');
      return;
    }
    setWatchlist((items) => [...new Set([...items, ticker])]);
    setQuery('');
    choose(ticker);
  };
  const toggleCheck = (index) => setChecks((state) => ({
    ...state,
    [selected]: companyChecks.includes(index) ? companyChecks.filter((x) => x !== index) : [...companyChecks, index],
  }));
  const setCompanyNote = (key, value) => setNotes((state) => ({ ...state, [selected]: { ...state[selected], [key]: value } }));

  if (loadError) return <EmptyState />;
  if (!dataset || !company) return <div className="loading"><RefreshCw className="spin" /> 正在核验财报数据…</div>;

  const latestYear = Math.max(...company.series.revenue.map((x) => Number(x.year)), 0);
  const generated = new Date(dataset.generatedAt);
  const ageDays = Math.floor((Date.now() - generated.getTime()) / 86400000);

  return <div className="app-shell">
    <aside className={menuOpen ? 'sidebar open' : 'sidebar'}>
      <div className="brand"><div className="brand-mark">衡</div><div><strong>衡石</strong><span>VALUE LEDGER</span></div></div>
      <nav className="main-nav">
        <button className="active"><BarChart3 />研究台</button>
        <button onClick={() => setTab('discipline')}><ShieldCheck />投资纪律</button>
        <button onClick={() => setTab('filings')}><BookOpen />申报档案</button>
      </nav>
      <div className="watch-head"><span>我的自选</span><span>{watchlist.length}</span></div>
      <div className="ticker-add"><Search size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTicker()} placeholder="添加代码" /><button title="添加" onClick={addTicker}><Plus size={16} /></button></div>
      <div className="watch-items">
        {watchlist.map((ticker) => {
          const item = dataset.companies.find((c) => c.ticker === ticker);
          return <button key={ticker} className={company.ticker === ticker ? 'selected' : ''} onClick={() => choose(ticker)}>
            <span className="ticker-logo">{ticker[0]}</span><span><strong>{ticker}</strong><small>{item?.name || '等待数据'}</small></span><ChevronRight size={15} />
          </button>;
        })}
      </div>
      <div className="source-card"><Landmark size={17} /><div><strong>一手数据源</strong><span>SEC EDGAR · XBRL</span></div><ShieldCheck size={16} /></div>
      <button className="settings"><Settings size={17} />设置与数据源</button>
    </aside>

    <section className="workspace">
      <header className="topbar">
        <button className="menu-button" onClick={() => setMenuOpen(!menuOpen)}><Menu /></button>
        <div className="breadcrumb">研究台 <ChevronRight size={14} /> <strong>{company.ticker}</strong></div>
        <div className={`freshness ${ageDays > 2 ? 'aged' : ''}`}><span></span>数据生成于 {generated.toLocaleDateString('zh-CN')} · {ageDays <= 0 ? '今日' : `${ageDays} 天前`}</div>
      </header>

      <main>
        <section className="company-head">
          <div><div className="eyebrow">NYSE / NASDAQ · SEC CIK {company.cik}</div><h1>{company.name}</h1><div className="company-meta"><b>{company.ticker}</b><span>财年截止 {company.fiscalYearEnd?.replace(/(..)(..)$/, '$1-$2')}</span><a href={company.source} target="_blank" rel="noreferrer">查看原始数据 <ExternalLink size={13} /></a></div></div>
          <div className="quote"><span>今日提醒</span><q>{quote[0]}</q><small>— {quote[1]}</small></div>
        </section>

        <div className="tabs">
          {[['overview','财务概览'],['filings','原始申报'],['valuation','估值草稿'],['discipline','投资纪律']].map(([id,label]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>)}
        </div>

        {tab === 'overview' && <>
          <section className="metrics-row">
            <Metric label="营业收入" value={formatMoney(company.metrics.revenue)} note={`${latestYear || '最近'} 财年 · 美元`} />
            <Metric label="净利润" value={formatMoney(company.metrics.netIncome)} note={`${latestYear || '最近'} 财年 · GAAP`} />
            <Metric label="自由现金流" value={formatMoney(company.metrics.freeCashFlow)} note="经营现金流 − 资本开支" />
            <Metric label="净资产收益率" value={pct(company.metrics.roe)} note="净利润 / 期末股东权益" tone={company.metrics.roe > .15 ? 'positive' : ''} />
            <Metric label="负债 / 资产" value={pct(company.metrics.liabilitiesToAssets)} note="资产负债表口径" />
          </section>

          <section className="grid-main">
            <div className="panel chart-panel">
              <div className="panel-head"><div><span className="kicker">长期经营趋势</span><h2>收入、净利润与自由现金流</h2></div><div className="legend-note">单位：亿美元</div></div>
              <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={annual} margin={{ top: 12, right: 12, left: -15, bottom: 0 }}>
                <defs><linearGradient id="rev" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1e6b54" stopOpacity={0.26}/><stop offset="1" stopColor="#1e6b54" stopOpacity={0.01}/></linearGradient></defs>
                <CartesianGrid stroke="#e6e8e3" vertical={false}/><XAxis dataKey="year" tickLine={false} axisLine={false}/><YAxis tickFormatter={(v) => Math.round(v / 1e8)} tickLine={false} axisLine={false}/><Tooltip formatter={(v) => formatMoney(v)} contentStyle={{borderRadius: 4,border:'1px solid #dfe2dc'}}/><Legend iconType="circle" />
                <Area name="营业收入" type="monotone" dataKey="revenue" stroke="#1e6b54" fill="url(#rev)" strokeWidth={2}/><Area name="净利润" type="monotone" dataKey="netIncome" stroke="#bc7a32" fill="none" strokeWidth={2}/><Area name="自由现金流" type="monotone" dataKey="freeCashFlow" stroke="#456a91" fill="none" strokeWidth={2}/>
              </AreaChart></ResponsiveContainer></div>
              <div className="chart-foot"><span>收入 {company.series.revenue.length} 年 CAGR <b>{pct(growth(company.series.revenue))}</b></span><span>自由现金流 CAGR <b>{pct(growth(company.series.freeCashFlow))}</b></span><span>仅基于 10-K 年度口径</span></div>
            </div>

            <div className="panel filings-mini">
              <div className="panel-head"><div><span className="kicker">事实核查入口</span><h2>最新申报</h2></div><button onClick={() => setTab('filings')}>全部</button></div>
              {company.filings.slice(0, 4).map((f) => <a key={`${f.form}-${f.filed}`} href={f.url} target="_blank" rel="noreferrer"><span className={f.form === '10-K' ? 'form annual' : 'form'}>{f.form}</span><span><strong>报告期 {f.period}</strong><small>提交于 {f.filed}</small></span><ExternalLink size={15}/></a>)}
              {!company.filings.length && <div className="no-data">暂无申报索引</div>}
              <div className="audit-note"><ShieldCheck size={16}/><span>数值来自 SEC 结构化申报。投资判断前仍应阅读原始 10-K 的附注、风险与管理层讨论。</span></div>
            </div>
          </section>

          <section className="panel memo">
            <div className="panel-head"><div><span className="kicker">持仓不是代码，是企业</span><h2>投资备忘录</h2></div><span className="autosave"><Check size={13}/>自动保存在本机</span></div>
            <div className="memo-grid">
              <label>投资论点<textarea value={notes[selected]?.thesis || ''} onChange={(e) => setCompanyNote('thesis', e.target.value)} placeholder="公司为何能在未来十年持续创造价值？" /></label>
              <label>关键风险<textarea value={notes[selected]?.risks || ''} onChange={(e) => setCompanyNote('risks', e.target.value)} placeholder="什么事实会证明我的判断是错的？" /></label>
              <label>卖出条件<textarea value={notes[selected]?.exit || ''} onChange={(e) => setCompanyNote('exit', e.target.value)} placeholder="基本面发生什么变化时重新评估？" /></label>
            </div>
          </section>
        </>}

        {tab === 'filings' && <section className="panel filings-table">
          <div className="panel-head"><div><span className="kicker">可追溯证据</span><h2>SEC 原始申报档案</h2></div><a href={`https://www.sec.gov/edgar/browse/?CIK=${company.cik}`} target="_blank" rel="noreferrer">在 EDGAR 中查看 <ExternalLink size={14}/></a></div>
          <div className="table-head"><span>表格</span><span>报告期</span><span>提交日期</span><span>来源</span></div>
          {company.filings.map((f) => <a className="table-row" key={`${f.form}-${f.filed}`} href={f.url} target="_blank" rel="noreferrer"><b>{f.form}</b><span>{f.period}</span><span>{f.filed}</span><span>SEC EDGAR <ExternalLink size={14}/></span></a>)}
        </section>}

        {tab === 'valuation' && <section className="valuation-grid">
          <div className="panel calculator"><div className="panel-head"><div><span className="kicker">保守假设优先</span><h2>估值草稿</h2></div></div>
            <div className="field-grid"><label>当前价格（手工）<div><span>$</span><input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00"/></div></label><label>正常化每股收益<div><span>$</span><input type="number" value={eps} onChange={(e) => setEps(e.target.value)} placeholder="0.00"/></div></label><label>合理市盈率<div><input type="number" value={multiple} onChange={(e) => setMultiple(e.target.value)}/><span>倍</span></div></label><label>安全边际<div><input type="number" value={margin} onChange={(e) => setMargin(e.target.value)}/><span>%</span></div></label></div>
            <div className="valuation-result"><span>最高买入价</span><strong>{Number.isFinite(maxBuy) && maxBuy > 0 ? `$${maxBuy.toFixed(2)}` : '—'}</strong><small>{impliedUpside == null ? '输入当前价格以比较' : `相对当前价格 ${impliedUpside >= 0 ? '高' : '低'} ${Math.abs(impliedUpside * 100).toFixed(1)}%`}</small></div>
          </div>
          <div className="panel caution"><AlertTriangle/><h2>估值不是精确答案</h2><p>正常化利润应剔除一次性项目，并覆盖完整经济周期。倍数越高，隐含的增长与竞争优势假设越苛刻。</p><p>本站不自动提供股价，是为了避免延迟行情造成“看似实时”的错觉。估值输入只保存在浏览器。</p></div>
        </section>}

        {tab === 'discipline' && <section className="discipline-grid">
          <div className="panel checklist"><div className="panel-head"><div><span className="kicker">在按下买入之前</span><h2>六项防错检查</h2></div><span>{companyChecks.length} / {CHECKS.length}</span></div>
            {CHECKS.map((item, index) => <button key={item} onClick={() => toggleCheck(index)} className={companyChecks.includes(index) ? 'done' : ''}><span>{companyChecks.includes(index) && <Check size={16}/>}</span>{item}</button>)}
            <div className="check-verdict">{companyChecks.length === CHECKS.length ? <><ShieldCheck/>检查完成。现在再问一次：如果明天停牌五年，我还愿意买吗？</> : <><AlertTriangle/>尚有 {CHECKS.length - companyChecks.length} 项未确认。耐心也是一种仓位。</>}</div>
          </div>
          <div className="panel principles"><span className="kicker">决策原则</span><h2>不做什么，比做什么更重要</h2>{QUOTES.slice(0,5).map(([q,a], i) => <blockquote key={q}><span>0{i+1}</span><div><q>{q}</q><small>{a}</small></div></blockquote>)}</div>
        </section>}
      </main>
      <footer>数据仅用于研究，不构成投资建议 · 财报来源 <a href={dataset.sourceUrl} target="_blank" rel="noreferrer">{dataset.source}</a> · 本地笔记不会上传</footer>
    </section>
    {menuOpen && <button className="scrim" onClick={() => setMenuOpen(false)}><X/></button>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
