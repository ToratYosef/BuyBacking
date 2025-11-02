const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

/* ========= SETTINGS ========= */
const PHONE_SLUGS = [
  'apple-iphone-17-pro-max',
  'apple-iphone-16-pro-max','apple-iphone-16-pro','apple-iphone-16-plus','apple-iphone-16',
  'apple-iphone-15-pro-max','apple-iphone-15-pro','apple-iphone-15-plus','apple-iphone-15',
  'apple-iphone-14-pro-max','apple-iphone-14-pro','apple-iphone-14-plus','apple-iphone-14',
  'apple-iphone-13-pro-max','apple-iphone-13-pro','apple-iphone-13','apple-iphone-13-mini',
  'apple-iphone-12-pro-max','apple-iphone-12-pro'
];
const BASE_URL = 'https://www.sellcell.com/phones/';
const DEBUG_DIR_JSON = 'debug_json';
const DEBUG_DIR_HTML  = 'debug_html';
const OUT_JSON = 'highest_sell_prices.json';
const OUT_XML  = 'models.xml';

/* pacing (override via env) */
const HUMAN_JITTER_MIN_MS = parseInt(process.env.JITTER_MIN_MS || '1200', 10);
const HUMAN_JITTER_MAX_MS = parseInt(process.env.JITTER_MAX_MS || '2600', 10);
const BETWEEN_PAGES_MS    = parseInt(process.env.BETWEEN_PAGES_MS || '6000', 10);
const BLOCK_COOLDOWN_MS   = parseInt(process.env.BLOCK_COOLDOWN_MS || '90000', 10); // 90s
const AJAX_WAIT_MS        = parseInt(process.env.AJAX_WAIT_MS || '9000', 10);
/* ============================ */

const CONDITIONS = ['flawless','good','fair','broken'];
const MAX_ECHO_CHARS = parseInt(process.env.ECHO_LIMIT || '2000', 10);
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const jitter = (a=HUMAN_JITTER_MIN_MS,b=HUMAN_JITTER_MAX_MS)=>a+Math.floor(Math.random()*(b-a));

/* ========= HELPERS ========= */
const titleCase = s => s.replace(/\b\w/g,c=>c.toUpperCase());
const toModelName = slug => titleCase(slug.replace('apple-iphone-','').replace(/-/g,' '));
const toModelID   = slug => slug.replace('apple-iphone-','');
const toDeviceParam = id => `iphone-${id}`;
const norm = s => (s??'').toString().trim().replace(/\s+/g,' ');
const num  = v => (typeof v==='number') ? v : (Number.parseFloat((v??'').toString().replace(/[^0-9.]/g,'')) || 0);

const isBlockedHTML = t => /<title>\s*Oops!\s*<\/title>/i.test(t) && /temporarily blocked/i.test(t);
const isBlockedPayload = t => /<title>\s*Oops!\s*<\/title>/i.test(t) || /temporarily blocked/i.test(t) || /unusual usage/i.test(t);

function echoToConsole(label, url, text){
  const len = text?.length || 0;
  const clip = (text||'').slice(0, MAX_ECHO_CHARS);
  const tail = len > MAX_ECHO_CHARS ? `\n[... clipped ${len-MAX_ECHO_CHARS} more chars ...]` : '';
  console.log(`\n----- ${label} (${len} bytes) ${url ? ':: '+url : ''} -----\n${clip}${tail}\n----- END ${label} -----\n`);
}

function normalizeCondition(v){
  const s = (v||'').toLowerCase();
  if (/mint|flawless|like\s*new|excellent|brand\s*new|new/.test(s)) return 'flawless';
  if (/very\s*good|average|used|good|working/.test(s))            return 'good';
  if (/fair|poor/.test(s))                                        return 'fair';
  if (/faulty|broken|no\s*power|blacklist|blocked|cracked/.test(s))return 'broken';
  return '';
}
function capacityFromString(t){
  const s = norm(t).toUpperCase();
  const m = s.match(/(\d+(?:\.\d+)?)\s*(TB|GB)/);
  if (!m) return '';
  const qty = m[1].replace(/\.0$/,'');
  return (m[2] === 'TB') ? `${qty}TB` : `${qty}GB`;
}
function normalizeCapacityFromAny({original_model,name,modified_model,line}){
  // Try rich strings first
  for (const src of [original_model, name, modified_model, line]){
    if (!src) continue;
    const cap = capacityFromString(src);
    if (cap) return cap;
  }
  return '';
}
/* =========================== */

/* ========= CORE PARSING (UNLOCKED ONLY) ========= */
function parseAjaxUnlocked(text){
  if (!text || typeof text !== 'string' || isBlockedPayload(text)) return [];
  const rows = [];

  // JSON path
  let j = null;
  try { j = JSON.parse(text); } catch {}
  if (j){
    const arr = Array.isArray(j) ? j : (Array.isArray(j.prices) ? j.prices : []);
    for (const d of arr){
      // ensure it's Unlocked only
      const txtWhole = `${d.original_model||''} ${d.name||''} ${d.modified_model||''} ${d.line||''}`.toLowerCase();
      const unlockedAttr = (d.attributes && (String(d.attributes.network) === '29')); // 29 observed
      const unlockedText = /unlocked/.test(txtWhole) && !/verizon|t-?mobile|tmobile|at&t|att/.test(txtWhole);
      if (!(unlockedAttr || unlockedText)) continue;

      const cap = normalizeCapacityFromAny(d);
      if (!cap) continue;

      const vendor = d.merchant_full_name || d.merchant_short_name || '';

      // numeric fields
      const pairs = [
        ['price_new','flawless'],
        ['price_working','good'],
        ['price_poor','fair'],
        ['price_broken','broken']
      ];
      for (const [k,cond] of pairs){
        const price = num(d[k]);
        if (price > 0) rows.push({ capacity: cap, condition: cond, price, vendor });
      }

      // enrich from embedded XML-like 'line'
      if (d.line){
        const takeNum = (tag)=>{
          const m = d.line.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`,'i'));
          return num(m?.[1]||0);
        };
        const extras = {
          flawless: takeNum('flawless') || takeNum('new'),
          good:     Math.max(takeNum('used'), takeNum('average'), takeNum('good')),
          fair:     Math.max(takeNum('fair'), takeNum('poor')),
          broken:   Math.max(takeNum('faulty'), takeNum('broken'), takeNum('noPower'), takeNum('no_power'), takeNum('cracked')),
        };
        for (const cond of Object.keys(extras)){
          const price = extras[cond];
          if (price > 0) rows.push({ capacity: cap, condition: cond, price, vendor });
        }
      }
    }
    return rows;
  }

  // XML-like fallback
  const items = [...text.matchAll(/<item>([\s\S]*?)<\/item>/gi)];
  for (const m of items){
    const blk = m[1];
    const pick = tag => ((blk.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`,'i'))||[])[1]||'').trim();
    const title = pick('title');
    const carrier = (pick('carrier')||'').toLowerCase();
    if (carrier !== 'unlocked') continue;

    const cap = capacityFromString(title);
    if (!cap) continue;

    const link = pick('link');
    const vendor = link ? link.replace(/^https?:\/\//,'').split(/[/?#]/)[0].replace(/^www\./,'') : '';

    const pairs = [
      ['flawless','flawless'],['new','flawless'],
      ['very_good','good'],['average','good'],['used','good'],['good','good'],
      ['fair','fair'],['poor','fair'],
      ['faulty','broken'],['broken','broken'],['cracked','broken'],['noPower','broken'],['no_power','broken']
    ];
    for (const [tag,label] of pairs){
      const rx = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`,'i');
      const mv = blk.match(rx);
      const price = num(mv?.[1]||'');
      if (price > 0) rows.push({ capacity: cap, condition: label, price, vendor });
    }
  }
  return rows;
}

/* Highest per (capacity × condition) for Unlocked */
function buildUnlockedBest(rows){
  const best = new Map(); // key: cap|cond -> {price, vendor}
  const capSet = new Set();
  for (const r of rows){
    const cap  = r.capacity;
    const cond = normalizeCondition(r.condition) || r.condition;
    const price = Number(r.price)||0;
    const vendor = r.vendor||'';
    if (!cap || !CONDITIONS.includes(cond) || price<=0) continue;

    capSet.add(cap);
    const key = `${cap}|${cond}`;
    const cur = best.get(key);
    if (!cur || price > cur.price) best.set(key, {price, vendor});
  }
  // keep natural sort by numeric size then TB/GB
  const caps = Array.from(capSet).sort((a,b)=>{
    const rx=/(\d+(?:\.\d+)?)(TB|GB)/;
    const pa=a.toUpperCase().match(rx), pb=b.toUpperCase().match(rx);
    if(!pa||!pb) return a.localeCompare(b);
    const va=parseFloat(pa[1])*(pa[2]==='TB'?1024:1);
    const vb=parseFloat(pb[1])*(pb[2]==='TB'?1024:1);
    return va-vb;
  });
  return { best, capacities: caps };
}
/* ===================================== */

/* ========= PAGE INTERACTIONS ========= */
function attachAjaxCollector(page, bucket){
  const listener = async (res) => {
    const ru = res.url();
    if (!/devices\/ajax_comparison/i.test(ru)) return;
    try{
      const txt = await res.text();
      echoToConsole('AJAX_RESPONSE', ru, txt);
      if (!isBlockedPayload(txt)) bucket.push(txt);
      const safe = ru.replace(/[^a-z0-9]+/gi,'_').slice(0,120);
      await fs.promises.writeFile(path.join(DEBUG_DIR_JSON,`auto__${safe}.xml`), txt, 'utf8').catch(()=>{});
    }catch{}
  };
  page.on('response', listener);
  return () => page.off('response', listener);
}

async function ensureUnlockedSelected(page){
  // Try Select2 UI first
  const opened = await page.evaluate(() => {
    const el = document.querySelector('#select2-network-pp-container') || document.querySelector('[id^="select2-network-pp-container"]');
    if (!el) return false;
    el.click();
    return true;
  });
  if (opened){
    try{
      await page.waitForSelector('#select2-network-pp-results', {timeout: 5000});
      const ok = await page.evaluate(()=>{
        const norm = s=>s.replace(/\s+/g,' ').trim();
        const want = 'Unlocked';
        const ul = document.querySelector('#select2-network-pp-results');
        if(!ul) return false;
        const items = [...ul.querySelectorAll('.select2-results__option')];
        const li = items.find(x => norm(x.textContent||'') === want || norm(x.innerHTML||'').includes('Unlocked'));
        if(!li) return false;
        li.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
        li.click();
        return true;
      });
      if (ok) return true;
    }catch{}
  }
  // Fallback: change hidden select and fire change/select2 events
  const ok = await page.evaluate(()=>{
    const sel = document.querySelector('#network-pp');
    if(!sel) return false;
    let id = null;
    for (const o of sel.options){
      const txt=(o.textContent||'').trim();
      if (txt==='Unlocked') { id=o.value; break; }
    }
    if(!id) id='29'; // observed unlocked id
    sel.value = id;
    sel.dispatchEvent(new Event('change',{bubbles:true}));
    try{ if(window.jQuery) window.jQuery(sel).trigger('change.select2'); }catch{}
    return true;
  });
  return ok;
}

async function fetchAjaxUnlockedViaPOST(page){
  try{
    const txt = await page.evaluate(async ()=>{
      const p = new URLSearchParams();
      p.set('url', location.pathname);
      p.set('currency','USD');
      p.set('network','29'); // Unlocked
      const r = await fetch('/devices/ajax_comparison/', {
        method:'POST',
        headers:{
          'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With':'XMLHttpRequest',
        },
        credentials:'same-origin',
        body:p
      });
      return await r.text();
    });
    echoToConsole('AJAX_MANUAL_POST_RESPONSE', '/devices/ajax_comparison/', txt);
    return txt;
  }catch{ return ''; }
}
/* ==================================== */

/* ========= XML & CONSOLE EMIT ========= */
function printUnlockedSummary(modelName, best){
  // Print only cells we actually have
  const printedCaps = new Set();
  for (const [key,val] of best.entries()){
    const [cap,cond] = key.split('|');
    printedCaps.add(cap);
    console.log(`${modelName.toLowerCase()} Unlocked ${cap} ${cond} -> $${val.price}`);
  }
  if (printedCaps.size===0) {
    console.log(`   ✓ ${modelName}: 0 cells emitted (no capacities)`);
  }
}

function buildModelXMLUnlocked(meta, best, capacities){
  const lines = [];
  lines.push(`  <model>`);
  lines.push(`    <parentDevice>iphone</parentDevice>`);
  lines.push(`    <modelID>${meta.modelID}</modelID>`);
  for(const cap of capacities){
    lines.push(`    <prices>`);
    lines.push(`      <storageSize>${cap}</storageSize>`);
    lines.push(`      <priceValue>`);
    lines.push(`        <unlocked>`);
    for(const cond of CONDITIONS){
      const v = best.get(`${cap}|${cond}`)?.price || 0;
      lines.push(`          <${cond}>${v}</${cond}>`);
    }
    lines.push(`        </unlocked>`);
    lines.push(`      </priceValue>`);
    lines.push(`    </prices>`);
  }
  lines.push(`    <slug>${meta.modelID}</slug>`);
  lines.push(`    <imageUrl>https://raw.githubusercontent.com/ToratYosef/BuyBacking/main/iphone/assets/${meta.modelID}</imageUrl>`);
  lines.push(`    <name>${meta.name.toUpperCase()}</name>`);
  lines.push(`    <brand>iphone</brand>`);
  lines.push(`    <deeplink>https://secondhandcell.com/sell/?device=${toDeviceParam(meta.modelID)}&amp;storage={storage}&amp;carrier=Unlocked&amp;power={power}&amp;functionality={functionality}&amp;quality={quality}</deeplink>`);
  lines.push(`  </model>`);
  return lines.join('\n');
}
/* ===================================== */

/* ========= PER-DEVICE FLOW ========= */
async function scrapeDeviceUnlocked(page, slug){
  const url = `${BASE_URL}${slug}/`;
  await fs.promises.mkdir(DEBUG_DIR_JSON,{recursive:true}).catch(()=>{});
  await fs.promises.mkdir(DEBUG_DIR_HTML,{recursive:true}).catch(()=>{});

  const bucket = [];
  const detach = attachAjaxCollector(page, bucket);

  // navigate with retry if blocked
  for (let attempt=1; attempt<=3; attempt++){
    await page.goto(url, { waitUntil:'domcontentloaded', timeout:90000 });
    const html = await page.content();
    echoToConsole('PAGE_HTML', url, html);
    await fs.promises.writeFile(path.join(DEBUG_DIR_HTML,`${slug}.html`), html, 'utf8').catch(()=>{});

    if (isBlockedHTML(html)) {
      console.log('   ⚠️  Blocked page HTML detected. Cooling down...');
      await sleep(BLOCK_COOLDOWN_MS * attempt);
      continue; // retry
    }
    break;
  }

  try{ const b = await page.$('#onetrust-accept-btn-handler'); if(b){ await b.click({delay:30}); await sleep(250);} }catch{}

  // force Unlocked
  await ensureUnlockedSelected(page);
  await sleep(jitter());

  // wait for ajax or fallback to manual POST
  let txts = [];
  try{
    await Promise.race([
      page.waitForResponse(r=>/devices\/ajax_comparison/i.test(r.url()), {timeout: AJAX_WAIT_MS}),
      sleep(AJAX_WAIT_MS)
    ]);
  }catch{}
  if (bucket.length === 0){
    const manual = await fetchAjaxUnlockedViaPOST(page);
    if (manual) txts.push(manual);
  } else {
    txts = bucket.splice(0);
  }

  const rows = [];
  for (const t of txts){
    if (isBlockedPayload(t)) {
      console.log('   ⚠️  Blocked AJAX payload. Cooling down...');
      await sleep(BLOCK_COOLDOWN_MS);
      continue;
    }
    rows.push(...parseAjaxUnlocked(t));
  }

  detach();
  return rows;
}
/* =================================== */

/* ==================== DRIVER ==================== */
(async ()=>{
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  await page.setViewport({ width:1366, height:900 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36');
  await page.setExtraHTTPHeaders({ 'Accept-Language':'en-US,en;q=0.9' });
  try{ await page.emulateTimezone('America/New_York'); }catch{}

  const audit = [];
  const xmlParts = [];

  for (const slug of PHONE_SLUGS){
    const modelName = toModelName(slug);
    console.log(`\n➡️ ${BASE_URL}${slug}/\n`);
    try{
      const rows = await scrapeDeviceUnlocked(page, slug);
      const { best, capacities } = buildUnlockedBest(rows);

      // console summary
      printUnlockedSummary(modelName, best);

      // JSON audit
      for(const [key,val] of best.entries()){
        const [cap,cond] = key.split('|');
        audit.push({
          model: modelName,
          modelID: toModelID(slug),
          network: 'Unlocked',
          capacity: cap,
          condition: cond,
          highestPrice: val.price,
          vendor: val.vendor || ''
        });
      }

      // XML block
      xmlParts.push(buildModelXMLUnlocked({ modelID: toModelID(slug), name: modelName }, best, capacities));

      const cellCount = capacities.length * CONDITIONS.length;
      const capsStr = capacities.length ? capacities.join(', ') : 'no capacities';
      console.log(`   ✓ ${modelName}: ${cellCount} cells emitted (${capsStr})`);

      await sleep(BETWEEN_PAGES_MS + jitter());
    }catch(e){
      console.error(`❌ ${slug}: ${e.message}`);
    }
  }

  await browser.close();

  fs.writeFileSync(OUT_JSON, JSON.stringify(audit, null, 2));
  const xml = ['<?xml version="1.0" encoding="UTF-8"?>','<models>', ...xmlParts, '</models>'].join('\n');
  fs.writeFileSync(OUT_XML, xml);
  console.log(`\n📁 Wrote ${OUT_XML} and ${OUT_JSON}`);
})();
