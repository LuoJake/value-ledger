import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AlertTriangle, BarChart3, Bell, BookOpen, Check, ChevronRight, CircleHelp,
  ExternalLink, FileCheck2, Landmark, Menu, Newspaper, Plus, RefreshCw,
  Search, Settings, ShieldCheck, X,
} from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import './styles.css';

const QUOTES = [
  ['价格是你付出的，价值是你得到的。', '沃伦·巴菲特'],
  ['投资最重要的不是智商，而是性格。', '沃伦·巴菲特'],
  ['知道自己不知道什么，比聪明更有用。', '查理·芒格'],
  ['市场短期是投票机，长期是称重机。', '本杰明·格雷厄姆'],
  ['投资者最大的敌人，很可能就是他自己。', '本杰明·格雷厄姆'],
  ['避免愚蠢，比追求聪明容易得多。', '查理·芒格'],
  ['最大的投资风险不是价格波动，而是永久性损失。', '霍华德·马克斯'],
];

const CHECKS = [
  '我能用三句话解释公司如何赚钱',
  '我读过最新年报及审计意见，而不是只看二手观点',
  '我检查过关联交易、商誉、应收和存货的异常变化',
  '管理层的分红、回购与融资记录经得起检验',
  '即使股价三年不涨，我仍愿意持有',
  '买入价已经考虑周期下行并留有安全边际',
];

const money = (value) => {
  if (value == null) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${(value / 1e12).toFixed(2)} 万亿`;
  if (abs >= 1e8) return `${(value / 1e8).toFixed(1)} 亿`;
  if (abs >= 1e4) return `${(value / 1e4).toFixed(1)} 万`;
  return new Intl.NumberFormat('zh-CN').format(value);
};
const percent = (value) => value == null ? '—' : `${Number(value).toFixed(1)}%`;
const cagr = (series, key) => {
  const valid = (series || []).filter((row) => row[key] != null && row[key] > 0);
  if (valid.length < 2) return null;
  return (Math.pow(valid.at(-1)[key] / valid[0][key], 1 / (valid.length - 1)) - 1) * 100;
};

function Metric({ label, value, note, tone = '' }) {
  return <div className="metric"><div className="metric-label">{label}<CircleHelp size={13}/></div><strong className={tone}>{value}</strong><span>{note}</span></div>;
}

function EmptyState() {
  return <main className="empty-state"><AlertTriangle size={28}/><h2>A 股数据暂未生成</h2><p>运行 <code>python scripts/fetch_a_share_data.py</code> 后刷新。抓取失败时不会展示猜测值。</p></main>;
}

function App() {
  const [dataset, setDataset] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState(localStorage.getItem('vl-cn-selected') || '600519');
  const [watchlist, setWatchlist] = useState(() => JSON.parse(localStorage.getItem('vl-cn-watchlist') || '["600519","000858","000333","600036"]'));
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [checks, setChecks] = useState(() => JSON.parse(localStorage.getItem('vl-cn-checks') || '{}'));
  const [notes, setNotes] = useState(() => JSON.parse(localStorage.getItem('vl-cn-notes') || '{}'));
  const [price, setPrice] = useState('');
  const [normalizedEps, setNormalizedEps] = useState('');
  const [multiple, setMultiple] = useState('15');
  const [margin, setMargin] = useState('30');

  useEffect(() => {
    fetch('./data/a-share-data.json').then((response) => {
      if (!response.ok) throw new Error('missing');
      return response.json();
    }).then((data) => {
      setDataset(data);
      if (!data.companies.some((item) => item.code === selected) && data.companies.length) setSelected(data.companies[0].code);
    }).catch(() => setLoadError(true));
  }, []);
  useEffect(() => localStorage.setItem('vl-cn-watchlist', JSON.stringify(watchlist)), [watchlist]);
  useEffect(() => localStorage.setItem('vl-cn-selected', selected), [selected]);
  useEffect(() => localStorage.setItem('vl-cn-checks', JSON.stringify(checks)), [checks]);
  useEffect(() => localStorage.setItem('vl-cn-notes', JSON.stringify(notes)), [notes]);

  const company = dataset?.companies.find((item) => item.code === selected) || dataset?.companies[0];
  const quote = QUOTES[Math.floor(Date.now() / 86400000) % QUOTES.length];
  const latestYear = company?.series.at(-1)?.year;
  const companyChecks = checks[selected] || [];
  const chartData = useMemo(() => company?.series || [], [company]);
  const estimatedValue = Number(normalizedEps) * Number(multiple);
  const maxBuy = estimatedValue * (1 - Number(margin) / 100);
  const choose = (code) => { setSelected(code); setTab('overview'); setMenuOpen(false); };
  const addTicker = () => {
    const code = query.trim();
    if (!/^\d{6}$/.test(code)) return alert('请输入 6 位 A 股代码。');
    if (!dataset?.companies.some((item) => item.code === code)) return alert('该股票尚未进入本站数据集，请先在 public/data/watchlist.json 配置后运行更新。');
    setWatchlist((items) => [...new Set([...items, code])]); setQuery(''); choose(code);
  };
  const toggleCheck = (index) => setChecks((state) => ({ ...state, [selected]: companyChecks.includes(index) ? companyChecks.filter((item) => item !== index) : [...companyChecks, index] }));
  const setNote = (key, value) => setNotes((state) => ({ ...state, [selected]: { ...state[selected], [key]: value } }));

  if (loadError) return <EmptyState/>;
  if (!dataset || !company) return <div className="loading"><RefreshCw className="spin"/>正在核验 A 股披露数据…</div>;
  const generated = new Date(dataset.generatedAt);
  const ageHours = Math.max(0, Math.floor((Date.now() - generated) / 3600000));
  const isFinancial = company.type === 'financial';

  return <div className="app-shell">
    <aside className={menuOpen ? 'sidebar open' : 'sidebar'}>
      <div className="brand"><div className="brand-mark">衡</div><div><strong>衡石</strong><span>A-SHARE LEDGER</span></div></div>
      <nav className="main-nav">
        <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}><BarChart3/>研究台</button>
        <button className={tab === 'news' ? 'active' : ''} onClick={() => setTab('news')}><Newspaper/>及时披露</button>
        <button className={tab === 'discipline' ? 'active' : ''} onClick={() => setTab('discipline')}><ShieldCheck/>投资纪律</button>
        <button className={tab === 'filings' ? 'active' : ''} onClick={() => setTab('filings')}><BookOpen/>原始公告</button>
      </nav>
      <div className="watch-head"><span>我的 A 股自选</span><span>{watchlist.length}</span></div>
      <div className="ticker-add"><Search size={15}/><input value={query} onChange={(e) => setQuery(e.target.value.replace(/\D/g, '').slice(0, 6))} onKeyDown={(e) => e.key === 'Enter' && addTicker()} placeholder="输入 6 位代码"/><button title="添加自选" onClick={addTicker}><Plus size={16}/></button></div>
      <div className="watch-items">{watchlist.map((code) => {
        const item = dataset.companies.find((row) => row.code === code);
        return <button key={code} className={company.code === code ? 'selected' : ''} onClick={() => choose(code)}><span className="ticker-logo">{item?.name?.[0] || code[0]}</span><span><strong>{item?.name || code}</strong><small>{code} · {item?.exchange === 'SH' ? '沪市' : '深市'}</small></span><ChevronRight size={15}/></button>;
      })}</div>
      <div className="source-card"><Landmark size={17}/><div><strong>官方披露校验</strong><span>上交所 · 巨潮资讯</span></div><ShieldCheck size={16}/></div>
      <button className="settings"><Settings size={17}/>设置与数据边界</button>
    </aside>

    <section className="workspace">
      <header className="topbar"><button className="menu-button" onClick={() => setMenuOpen(!menuOpen)}><Menu/></button><div className="breadcrumb">A 股研究台 <ChevronRight size={14}/> <strong>{company.code}</strong></div><div className={`freshness ${ageHours > 4 ? 'aged' : ''}`}><span/>数据生成于 {generated.toLocaleString('zh-CN', { hour12: false })} · {ageHours ? `${ageHours} 小时前` : '1 小时内'}</div></header>
      <main>
        <section className="company-head">
          <div><div className="eyebrow">{company.exchangeName} · {company.symbol}</div><h1>{company.name}</h1><div className="company-meta"><b>{company.code}</b><span>{isFinancial ? '金融企业口径' : '一般企业口径'}</span>{company.verification.annualReport ? <a href={company.verification.annualReport.url} target="_blank" rel="noreferrer">{latestYear} 年报原文 <ExternalLink size={13}/></a> : <span className="warn-text">年报待人工核验</span>}</div></div>
          <div className="quote"><span>今日提醒</span><q>{quote[0]}</q><small>— {quote[1]}</small></div>
        </section>

        <div className="tabs">{[['overview','财务概览'],['news','及时披露'],['filings','原始年报'],['valuation','估值草稿'],['discipline','投资纪律']].map(([id, label]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>)}</div>

        {tab === 'overview' && <>
          <section className="data-trust"><div className={company.verification.status === 'matched' ? 'verified' : 'pending'}>{company.verification.status === 'matched' ? <FileCheck2/> : <AlertTriangle/>}<span><strong>{company.verification.message}</strong><small>结构化数据用于计算，投资结论以官方公告原文为准</small></span></div><a href={company.financialSource.url} target="_blank" rel="noreferrer">查看结构化数据源 <ExternalLink size={13}/></a></section>
          <section className="metrics-row a-share-metrics">
            <Metric label="营业总收入" value={money(company.metrics.revenue)} note={`${latestYear} 年报 · 人民币`}/>
            <Metric label="归母净利润" value={money(company.metrics.netProfit)} note={`${latestYear} 年报`}/>
            <Metric label={isFinancial ? '经营现金流' : '经营活动现金流'} value={isFinancial ? '不适用' : money(company.metrics.operatingCashFlow)} note={isFinancial ? '金融企业不做横向比较' : '现金流量表口径'}/>
            <Metric label="加权净资产收益率" value={percent(company.metrics.roe)} note="年报披露口径" tone={company.metrics.roe >= 15 ? 'positive' : ''}/>
            <Metric label="资产负债率" value={percent(company.metrics.debtRatio)} note={isFinancial ? '金融业需结合资本充足率' : '期末资产负债表'}/>
            <Metric label="基本每股收益" value={company.metrics.eps == null ? '—' : `¥${Number(company.metrics.eps).toFixed(2)}`} note="年报披露口径"/>
          </section>

          <section className="grid-main">
            <div className="panel chart-panel"><div className="panel-head"><div><span className="kicker">六年经营轨迹</span><h2>收入、归母净利润{isFinancial ? '' : '与经营现金流'}</h2></div><div className="legend-note">单位：亿元</div></div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{top:12,right:12,left:-15,bottom:0}}><defs><linearGradient id="rev" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1e6b54" stopOpacity={.26}/><stop offset="1" stopColor="#1e6b54" stopOpacity={.01}/></linearGradient></defs><CartesianGrid stroke="#e6e8e3" vertical={false}/><XAxis dataKey="year" tickLine={false} axisLine={false}/><YAxis tickFormatter={(value) => Math.round(value / 1e8)} tickLine={false} axisLine={false}/><Tooltip formatter={(value) => money(value)} contentStyle={{borderRadius:4,border:'1px solid #dfe2dc'}}/><Legend iconType="circle"/><Area name="营业收入" type="monotone" dataKey="revenue" stroke="#1e6b54" fill="url(#rev)" strokeWidth={2}/><Area name="归母净利润" type="monotone" dataKey="netProfit" stroke="#bc7a32" fill="none" strokeWidth={2}/>{!isFinancial && <Area name="经营现金流" type="monotone" dataKey="operatingCashFlow" stroke="#456a91" fill="none" strokeWidth={2}/>}</AreaChart></ResponsiveContainer></div><div className="chart-foot"><span>收入 CAGR <b>{percent(cagr(company.series, 'revenue'))}</b></span><span>归母利润 CAGR <b>{percent(cagr(company.series, 'netProfit'))}</b></span><span>仅比较完整年度</span></div></div>
            <div className="panel filings-mini"><div className="panel-head"><div><span className="kicker">两小时内同步</span><h2>最新公司披露</h2></div><button onClick={() => setTab('news')}>全部</button></div>{company.announcements.slice(0,5).map((item, index) => <a key={`${item.date}-${index}`} href={item.url} target="_blank" rel="noreferrer"><span className="form annual">公告</span><span><strong>{item.title}</strong><small>{item.date} · {item.source}</small></span><ExternalLink size={15}/></a>)}<div className="audit-note"><ShieldCheck size={16}/><span>这里展示法定披露，不是媒体传闻。信息可能延迟，重大决策请以交易所页面为准。</span></div></div>
          </section>

          <section className="panel memo"><div className="panel-head"><div><span className="kicker">持仓不是代码，是企业</span><h2>投资备忘录</h2></div><span className="autosave"><Check size={13}/>自动保存在本机</span></div><div className="memo-grid"><label>投资论点<textarea value={notes[selected]?.thesis || ''} onChange={(e) => setNote('thesis', e.target.value)} placeholder="公司的护城河、增长来源和资本回报是什么？"/></label><label>关键风险<textarea value={notes[selected]?.risks || ''} onChange={(e) => setNote('risks', e.target.value)} placeholder="什么事实会证明我的判断是错的？"/></label><label>跟踪指标<textarea value={notes[selected]?.signals || ''} onChange={(e) => setNote('signals', e.target.value)} placeholder="每个季度只跟踪哪些真正重要的指标？"/></label></div></section>
        </>}

        {tab === 'news' && <section className="panel news-feed"><div className="panel-head"><div><span className="kicker">官方披露优先</span><h2>{company.name} · 最新公告</h2></div><span className="source-stamp"><Bell size={13}/>每 2 小时抓取</span></div>{company.announcements.map((item, index) => <a key={`${item.date}-${index}`} href={item.url} target="_blank" rel="noreferrer"><time>{item.date}</time><span><strong>{item.title}</strong><small>{item.source} · {item.type}</small></span><ExternalLink size={15}/></a>)}</section>}

        {tab === 'filings' && <section className="filing-focus"><div className="panel annual-report-card"><FileCheck2/><span className="kicker">结构化数据核验锚点</span><h2>{latestYear} 年年度报告</h2>{company.verification.annualReport ? <><p>{company.verification.annualReport.title}</p><a href={company.verification.annualReport.url} target="_blank" rel="noreferrer">打开官方 PDF <ExternalLink size={15}/></a><small>{company.verification.annualReport.source} · {company.verification.annualReport.date}</small></> : <><p>当前未能自动匹配官方年报。请勿仅依据结构化指标决策。</p><span className="warn-text">需要人工复核</span></>}</div><div className="panel source-rules"><span className="kicker">数据分层</span><h2>什么可以相信，如何使用</h2><div><b>一级 · 法定披露</b><p>交易所与巨潮资讯 PDF，是最终核验依据。</p></div><div><b>二级 · 结构化财务</b><p>用于图表与筛选，存在口径映射风险，已链接原始年报交叉核验。</p></div><div><b>三级 · 行情快照</b><p>仅供估值参考，可能延迟或缺失，不用于交易。</p></div></div></section>}

        {tab === 'valuation' && <section className="valuation-grid"><div className="panel calculator"><div className="panel-head"><div><span className="kicker">保守假设优先</span><h2>每股收益估值草稿</h2></div></div><div className="field-grid"><label>参考价格（手工）<div><span>¥</span><input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00"/></div></label><label>正常化每股收益<div><span>¥</span><input type="number" value={normalizedEps} onChange={(e) => setNormalizedEps(e.target.value)} placeholder={`年报 EPS ${company.metrics.eps ?? '—'}`}/></div></label><label>合理市盈率<div><input type="number" value={multiple} onChange={(e) => setMultiple(e.target.value)}/><span>倍</span></div></label><label>安全边际<div><input type="number" value={margin} onChange={(e) => setMargin(e.target.value)}/><span>%</span></div></label></div><div className="valuation-result"><span>最高买入价</span><strong>{Number.isFinite(maxBuy) && maxBuy > 0 ? `¥${maxBuy.toFixed(2)}` : '—'}</strong><small>估算价值 {estimatedValue > 0 ? `¥${estimatedValue.toFixed(2)}` : '—'} · 输入不会上传</small></div></div><div className="panel caution"><AlertTriangle/><h2>A 股估值的额外陷阱</h2><p>先辨别利润是经营所得、投资收益还是公允价值变动。周期股不能直接把景气高点利润乘静态市盈率。</p><p>分红税、再融资、限售解禁、关联交易与控股股东行为，都应进入安全边际。</p></div></section>}

        {tab === 'discipline' && <section className="discipline-grid"><div className="panel checklist"><div className="panel-head"><div><span className="kicker">在按下买入之前</span><h2>A 股六项防错检查</h2></div><span>{companyChecks.length} / {CHECKS.length}</span></div>{CHECKS.map((item, index) => <button key={item} onClick={() => toggleCheck(index)} className={companyChecks.includes(index) ? 'done' : ''}><span>{companyChecks.includes(index) && <Check size={16}/>}</span>{item}</button>)}<div className="check-verdict">{companyChecks.length === CHECKS.length ? <><ShieldCheck/>检查完成。现在再问：如果明天停牌三年，我仍愿意成为股东吗？</> : <><AlertTriangle/>尚有 {CHECKS.length - companyChecks.length} 项未确认。看不懂也是一种明确结论。</>}</div></div><div className="panel principles"><span className="kicker">决策原则</span><h2>不做什么，比做什么更重要</h2>{QUOTES.slice(0,5).map(([text, author], index) => <blockquote key={text}><span>0{index + 1}</span><div><q>{text}</q><small>{author}</small></div></blockquote>)}</div></section>}
      </main>
      <footer>仅供研究，不构成投资建议 · 法定披露来源：上交所 / 巨潮资讯 · 结构化财务：东方财富 · 本地笔记不会上传</footer>
    </section>
    {menuOpen && <button className="scrim" aria-label="关闭菜单" onClick={() => setMenuOpen(false)}><X/></button>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
