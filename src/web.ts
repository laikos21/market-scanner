export const WEB_HTML = String.raw`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#111827">
  <title>MarketScanner 620</title>
  <link rel="stylesheet" href="/app.css">
</head>
<body>
  <div id="login" class="overlay hidden">
    <form id="login-form" class="login-card">
      <div class="eyebrow">Acceso privado</div>
      <h1>MarketScanner 620</h1>
      <p>Ingresá la contraseña del panel para administrar los tickers.</p>
      <label>Contraseña<input id="password" type="password" autocomplete="current-password" required></label>
      <button type="submit">Ingresar</button>
      <p id="login-error" class="error"></p>
    </form>
  </div>

  <header>
    <div>
      <div class="eyebrow">Timing intradía · 5 minutos</div>
      <h1>MarketScanner <span>620</span></h1>
    </div>
    <div class="header-actions">
      <span id="health" class="badge neutral">Comprobando…</span>
      <button id="run" class="secondary">Ejecutar ahora</button>
      <button id="test" class="secondary">Probar Telegram</button>
      <button id="logout" class="ghost">Salir</button>
    </div>
  </header>

  <main>
    <section class="intro">
      <div>
        <h2>Watchlist armada</h2>
        <p>Detecta MACD 6/20 bullish cross y espera la confirmación EMA6/EMA20. Solo procesa velas RTH cerradas.</p>
      </div>
      <div id="cycle" class="cycle">Sin ciclos registrados</div>
    </section>

    <section class="panel bulk-panel">
      <div class="bulk-heading">
        <div>
          <h2>Importar desde un screener</h2>
          <p class="muted">Pegá los tickers o el texto copiado de PULSE Leaders. Primero muestra un preview; los existentes se omiten y no se pausan automáticamente.</p>
        </div>
        <span class="badge neutral">add-only</span>
      </div>
      <p class="bookmarklet-help">Para hacerlo con un clic: arrastrá este enlace a la barra de marcadores y después usalo dentro de cualquier Screener PULSE.</p>
      <a id="pulse-bookmarklet" class="bookmarklet-link" href="#" title="Arrastrar a la barra de marcadores">↗ Importar Screener PULSE con un clic</a>
      <textarea id="bulk-text" rows="5" placeholder="NVDA\nPANW\nCRWD\n..."></textarea>
      <div class="bulk-fields">
        <label>Origen<input id="bulk-source" maxlength="80" value="PULSE Leaders"></label>
        <label>Contexto<input id="bulk-note" maxlength="200" value="EMA21 Pullback · PULSE Leaders"></label>
        <label>Señal MACD<select id="bulk-signal"><option value="10" selected>10 (original)</option><option value="9">9</option></select></label>
        <label>Ventana<select id="bulk-window"><option value="3">3 velas</option><option value="6" selected>6 velas</option><option value="9">9 velas</option><option value="12">12 velas</option></select></label>
      </div>
      <div class="bulk-actions"><button id="bulk-preview" class="secondary">Previsualizar importación</button><button id="bulk-import" disabled>Importar nuevos</button></div>
      <p id="bulk-error" class="error"></p>
      <div id="bulk-preview-output" class="bulk-preview hidden"></div>
    </section>

    <section class="panel">
      <form id="setup-form" class="setup-form">
        <label>Ticker<input id="symbol" maxlength="16" placeholder="NVDA" required></label>
        <label>Señal MACD
          <select id="signal"><option value="10">10 (original)</option><option value="9">9</option></select>
        </label>
        <label>Ventana
          <select id="window"><option value="3">3 velas</option><option value="6" selected>6 velas</option><option value="9">9 velas</option><option value="12">12 velas</option></select>
        </label>
        <label class="note">Contexto<input id="note" maxlength="200" placeholder="Pullback a EMA21 Daily"></label>
        <button type="submit">Armar 620</button>
      </form>
      <p id="form-error" class="error"></p>
    </section>

    <section>
      <div id="empty" class="empty hidden">Todavía no hay tickers armados.</div>
      <div id="setups" class="grid"></div>
    </section>

    <section class="panel events-panel">
      <h2>Eventos recientes</h2>
      <div id="events" class="events"><p class="muted">Sin eventos.</p></div>
    </section>
  </main>
  <div id="toast" class="toast hidden"></div>
  <script src="/app.js" defer></script>
</body>
</html>`;

export const WEB_CSS = String.raw`
:root { color-scheme: dark; --bg:#090d16; --panel:#111827; --panel2:#172033; --line:#27344c; --text:#e8eef9; --muted:#93a4bd; --green:#39d98a; --yellow:#f8c95c; --red:#ff6b75; --blue:#70a5ff; }
* { box-sizing:border-box; }
body { margin:0; min-height:100vh; background:radial-gradient(circle at 20% -10%,#192b4a 0,transparent 34%),var(--bg); color:var(--text); font:15px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; }
button,input,select { font:inherit; }
button { border:0; border-radius:10px; padding:10px 15px; background:var(--blue); color:#08101e; font-weight:750; cursor:pointer; }
button:hover { filter:brightness(1.08); }
button:disabled { opacity:.55; cursor:wait; }
button.secondary { background:#23334f; color:var(--text); }
button.ghost { background:transparent; color:var(--muted); }
button.danger { background:#3a2029; color:#ff9da5; }
header { min-height:78px; border-bottom:1px solid var(--line); background:rgba(9,13,22,.78); backdrop-filter:blur(15px); display:flex; align-items:center; justify-content:space-between; gap:20px; padding:15px max(20px,calc((100% - 1120px)/2)); position:sticky; top:0; z-index:5; }
h1,h2,p { margin-top:0; }
h1 { font-size:24px; margin-bottom:0; letter-spacing:-.03em; }
h1 span { color:var(--green); }
h2 { font-size:18px; margin-bottom:7px; }
.eyebrow { color:var(--blue); text-transform:uppercase; letter-spacing:.12em; font-size:11px; font-weight:800; }
.header-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
.badge { display:inline-flex; align-items:center; border:1px solid var(--line); border-radius:999px; padding:7px 11px; font-size:12px; font-weight:800; }
.badge.green { color:var(--green); border-color:#245a45; background:#102a21; }
.badge.amber { color:var(--yellow); border-color:#665322; background:#292312; }
.badge.red { color:var(--red); border-color:#68303a; background:#2d161c; }
.badge.neutral { color:var(--muted); }
main { width:min(1120px,calc(100% - 32px)); margin:30px auto 70px; }
.intro { display:flex; justify-content:space-between; align-items:flex-start; gap:24px; margin-bottom:20px; }
.intro p { color:var(--muted); max-width:680px; margin-bottom:0; }
.cycle { color:var(--muted); text-align:right; font-size:13px; }
.panel { background:linear-gradient(145deg,rgba(23,32,51,.9),rgba(17,24,39,.95)); border:1px solid var(--line); border-radius:16px; padding:18px; box-shadow:0 18px 50px rgba(0,0,0,.18); }
.bulk-panel { margin-bottom:20px; }
.bulk-heading { display:flex; justify-content:space-between; gap:18px; align-items:flex-start; }
.bulk-heading p { max-width:760px; margin-bottom:14px; }
.bookmarklet-help { margin:0 0 4px; color:var(--muted); font-size:12px; }
.bookmarklet-link { display:inline-block; color:var(--blue); font-size:13px; font-weight:800; margin-bottom:12px; text-decoration:none; border-bottom:1px dashed var(--blue); }
.bookmarklet-link:hover { color:var(--green); border-color:var(--green); }
textarea { width:100%; resize:vertical; min-height:108px; border:1px solid var(--line); border-radius:10px; background:#0d1422; color:var(--text); padding:11px; outline:none; font:13px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace; }
textarea:focus { border-color:var(--blue); box-shadow:0 0 0 3px rgba(112,165,255,.12); }
.bulk-fields { display:grid; grid-template-columns:minmax(150px,.8fr) minmax(220px,1.6fr) 150px 140px; gap:12px; margin-top:12px; }
.bulk-actions { display:flex; gap:10px; margin-top:14px; }
.bulk-preview { margin-top:15px; padding:13px; border:1px solid var(--line); border-radius:11px; background:#0c1320; }
.bulk-summary { display:flex; flex-wrap:wrap; gap:8px 16px; color:var(--muted); font-size:13px; }
.bulk-summary strong { color:var(--text); }
.bulk-list { margin:9px 0 0; color:#c4d1e5; font-size:13px; word-break:break-word; }
.bulk-list.warn { color:var(--yellow); }
.bulk-list.error { color:var(--red); }
.source { color:var(--blue); font-size:11px; margin-top:3px; }
.setup-form { display:grid; grid-template-columns:140px 150px 140px minmax(220px,1fr) auto; gap:12px; align-items:end; }
label { display:grid; gap:6px; color:var(--muted); font-size:12px; font-weight:700; }
input,select { width:100%; border:1px solid var(--line); border-radius:10px; background:#0d1422; color:var(--text); padding:10px 11px; outline:none; }
input:focus,select:focus { border-color:var(--blue); box-shadow:0 0 0 3px rgba(112,165,255,.12); }
.grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:14px; margin:20px 0; }
.card { background:var(--panel); border:1px solid var(--line); border-radius:15px; padding:17px; }
.card.paused { opacity:.62; }
.card-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
.symbol { font-size:22px; font-weight:850; letter-spacing:.02em; }
.phase { color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.08em; }
.detail { color:var(--muted); min-height:44px; margin:13px 0; }
.metrics { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.metric { background:#0c1320; border-radius:9px; padding:8px 10px; }
.metric span { display:block; color:var(--muted); font-size:11px; }
.metric strong { font-size:13px; }
.context { color:#c4d1e5; margin:12px 0 0; font-size:13px; }
.card-actions { display:flex; gap:8px; margin-top:15px; }
.card-actions button { flex:1; padding:8px; font-size:13px; }
.events-panel { margin-top:24px; }
.event { display:grid; grid-template-columns:90px 90px 1fr auto; gap:12px; align-items:center; padding:11px 0; border-top:1px solid var(--line); }
.event:first-child { border-top:0; }
.event-kind { font-weight:800; }
.event-kind.early { color:var(--yellow); }
.event-kind.confirmed { color:var(--green); }
.event-kind.system { color:var(--red); }
.muted,.empty { color:var(--muted); }
.empty { text-align:center; padding:50px 20px; }
.error { color:var(--red); margin:10px 0 0; }
.overlay { position:fixed; inset:0; display:grid; place-items:center; z-index:20; background:rgba(4,7,12,.9); backdrop-filter:blur(8px); }
.login-card { width:min(420px,calc(100% - 32px)); background:var(--panel); border:1px solid var(--line); border-radius:18px; padding:28px; box-shadow:0 30px 90px #000; }
.login-card p { color:var(--muted); }
.login-card button { width:100%; margin-top:16px; }
.toast { position:fixed; right:22px; bottom:22px; max-width:360px; background:#17243a; border:1px solid #375079; border-radius:12px; padding:13px 16px; box-shadow:0 16px 50px #000; z-index:30; }
.hidden { display:none !important; }
@media (max-width:850px) { header { position:static; align-items:flex-start; } .setup-form { grid-template-columns:1fr 1fr; } .bulk-fields { grid-template-columns:1fr 1fr; } .setup-form .note { grid-column:1/-1; } .setup-form button { grid-column:1/-1; } .intro { display:block; } .cycle { text-align:left; margin-top:12px; } }
@media (max-width:560px) { header { display:block; } .header-actions { justify-content:flex-start; margin-top:12px; } .setup-form { grid-template-columns:1fr; } .setup-form .note,.setup-form button { grid-column:auto; } .event { grid-template-columns:75px 1fr; } .event time,.event .delivery { display:none; } }
`;

export const WEB_JS = String.raw`
const $ = (selector) => document.querySelector(selector);
const mutationHeaders = { "content-type":"application/json", "x-market-scanner-web":"confirm" };

async function api(path, options={}) {
  const response = await fetch(path, { ...options, headers:{...(options.headers||{})}, cache:"no-store" });
  if (response.status === 401) { showLogin(); throw new Error("Sesión vencida"); }
  const body = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || body?.detail || "HTTP " + response.status);
  return body;
}

function showLogin() { $("#login").classList.remove("hidden"); }
function hideLogin() { $("#login").classList.add("hidden"); }
function toast(message) { const node=$("#toast"); node.textContent=message; node.classList.remove("hidden"); setTimeout(()=>node.classList.add("hidden"),3500); }
function fmt(value, digits=4) { return Number.isFinite(value) ? Number(value).toFixed(digits) : "—"; }
function phase(value) { return ({priming:"Calentando",waiting_macd:"Esperando MACD",waiting_ema:"Esperando EMA",confirmed:"Confirmado"})[value] || value; }

function renderSetup(setup) {
  const i=setup.state.indicator;
  const article=document.createElement("article");
  article.className="card " + (setup.enabled?"":"paused");
  article.innerHTML=[
    '<div class="card-head"><div><div class="symbol"></div><div class="phase"></div></div><span class="badge ', setup.state.status==="ok"?"green":"amber", '"></span></div>',
    '<p class="detail"></p>',
    '<div class="metrics">',
    '<div class="metric"><span>MACD / señal</span><strong>',fmt(i.macd),' / ',fmt(i.signal),'</strong></div>',
    '<div class="metric"><span>EMA6 / EMA20</span><strong>',fmt(i.ema6),' / ',fmt(i.ema20),'</strong></div>',
    '<div class="metric"><span>Configuración</span><strong>6/20/',setup.signalPeriod,' · ',setup.confirmationWindowBars,' velas</strong></div>',
    '<div class="metric"><span>Confirmaciones</span><strong>',setup.state.triggerCount,'</strong></div>',
    '</div><p class="context"></p>',
    '<div class="card-actions"><button class="secondary toggle"></button><button class="danger delete">Eliminar</button></div>'
  ].join("");
  article.querySelector(".symbol").textContent=setup.symbol;
  article.querySelector(".phase").textContent=phase(setup.state.phase);
  const badge=article.querySelector(".badge"); badge.textContent=setup.enabled ? setup.state.status : "Pausado";
  article.querySelector(".detail").textContent=setup.state.detail;
  article.querySelector(".context").textContent=setup.note ? "Contexto: " + setup.note : "Sin contexto anotado";
  if (setup.source) { const source=document.createElement("div"); source.className="source"; source.textContent="Origen: "+setup.source; article.querySelector(".context").before(source); }
  const toggle=article.querySelector(".toggle"); toggle.textContent=setup.enabled?"Pausar":"Reanudar";
  toggle.addEventListener("click", async()=>{ try { toggle.disabled=true; await api("/api/scanner/setups/"+setup.id,{method:"PATCH",headers:mutationHeaders,body:JSON.stringify({enabled:!setup.enabled})}); await refresh(); } catch(e){toast(e.message);} finally{toggle.disabled=false;} });
  article.querySelector(".delete").addEventListener("click", async()=>{ if(!confirm("Eliminar "+setup.symbol+" del scanner?"))return; try{await api("/api/scanner/setups/"+setup.id,{method:"DELETE",headers:{"x-market-scanner-web":"confirm"}}); await refresh();}catch(e){toast(e.message);} });
  return article;
}

async function refresh() {
  const [setupsData,health,eventsData]=await Promise.all([api("/api/scanner/setups"),api("/api/scanner/health").catch(e=>({status:"red",problems:[e.message]})),api("/api/scanner/events")]);
  hideLogin();
  const root=$("#setups"); root.replaceChildren(...setupsData.setups.map(renderSetup));
  $("#empty").classList.toggle("hidden",setupsData.setups.length!==0);
  const healthNode=$("#health"); healthNode.className="badge "+(health.status==="green"?"green":health.status==="amber"?"amber":"red"); healthNode.textContent=health.status.toUpperCase(); healthNode.title=(health.problems||[]).join("\n");
  const cycle=health.lastCycle; $("#cycle").textContent=cycle ? "Último ciclo: "+new Date(cycle.startedAt).toLocaleString()+" · "+cycle.barsProcessed+" velas · "+(cycle.earlySignals+cycle.confirmedSignals)+" señales" : "Sin ciclos registrados";
  const events=$("#events");
  if(!eventsData.events.length){events.innerHTML='<p class="muted">Sin eventos.</p>';}else{events.replaceChildren(...eventsData.events.map(event=>{const row=document.createElement("div");row.className="event";row.innerHTML='<span class="event-kind"></span><strong></strong><span></span><time></time>';const kind=row.querySelector(".event-kind");kind.className="event-kind "+event.kind;kind.textContent=event.kind;row.querySelector("strong").textContent=event.symbol||"Sistema";row.querySelector("span:nth-of-type(2)").textContent=event.message.split("\n")[0];row.querySelector("time").textContent=new Date(event.created_at_utc).toLocaleString();return row;}));}
}

let bulkPreviewState=null;
let pulseImportPending=false;
function setupPulseBookmarklet() {
  const link=$("#pulse-bookmarklet");
  if (!link) return;
  const bookmarklet = "javascript:(async()=>{const s=new Set();const pick=()=>{document.querySelectorAll('article').forEach(e=>{const t=(e.innerText||e.textContent||'').trim();const m=t.match(/^([A-Z][A-Z0-9.\\-]{0,15})(?=[A-Z][a-z])/);const f=m?m[1]:(t.match(/^[A-Z][A-Z0-9.\\-]*/)||[''])[0];if(/^[A-Z][A-Z0-9.\\-]{0,15}$/.test(f))s.add(f);});};for(let i=0;i<40;i++){pick();const n=[...document.querySelectorAll('button')].find(b=>/^Next/.test((b.innerText||b.textContent||'').trim())&&!b.disabled);if(!n)break;n.click();await new Promise(r=>setTimeout(r,500));}const u="+JSON.stringify(location.origin)+"+'/?pulse='+encodeURIComponent([...s].join(','))+'&source='+encodeURIComponent(document.title||'PULSE');location.href=u;})()";
  link.href=bookmarklet;
}
function loadPulseImportFromUrl() {
  const params=new URLSearchParams(location.search);
  const symbols=params.get("pulse");
  if (!symbols) return;
  $("#bulk-text").value=symbols.split(",").map(value=>value.trim()).filter(Boolean).join("\n");
  $("#bulk-source").value=params.get("source")||"PULSE";
  pulseImportPending=true;
  history.replaceState({},"",location.pathname);
}
async function previewPulseImportFromUrl() {
  if (!pulseImportPending) return;
  pulseImportPending=false;
  try {
    const result=await api("/api/scanner/import/preview",{method:"POST",headers:mutationHeaders,body:JSON.stringify(bulkPayload())});
    bulkPreviewState=result.preview;
    renderBulkPreview(bulkPreviewState);
    toast("Screener PULSE cargado; revisá el preview");
  } catch(error) { $("#bulk-error").textContent=error.message; }
}
setupPulseBookmarklet();
loadPulseImportFromUrl();
function bulkPayload() {
  return {
    text: $("#bulk-text").value,
    source: $("#bulk-source").value.trim(),
    note: $("#bulk-note").value.trim(),
    signalPeriod: Number($("#bulk-signal").value),
    confirmationWindowBars: Number($("#bulk-window").value)
  };
}
function renderBulkPreview(preview) {
  const node=$("#bulk-preview-output");
  node.replaceChildren();
  const summary=document.createElement("div"); summary.className="bulk-summary";
  [["Nuevos",preview.newSymbols.length], ["Ya existentes",preview.existingSymbols.length], ["Duplicados",preview.duplicates.length], ["Ignorados",preview.invalid.length], ["Disponibles",preview.availableSlots+" / "+preview.limit]].forEach(item=>{const span=document.createElement("span");span.innerHTML="<strong>"+item[0]+":</strong> "+item[1];summary.append(span);});
  node.append(summary);
  [["Se van a agregar",preview.newSymbols,""], ["Ya estaban armados",preview.existingSymbols,"warn"], ["Revisar manualmente",preview.invalid,"error"]].forEach(item=>{if(!item[1].length)return;const p=document.createElement("p");p.className="bulk-list "+item[2];p.textContent=item[0]+": "+item[1].join(", ");node.append(p);});
  const status=document.createElement("p"); status.className="bulk-list "+(preview.canImport?"":"error"); status.textContent=preview.canImport ? "Listo para importar: "+preview.newSymbols.length+" setup(s) habilitado(s)." : (preview.newSymbols.length ? "No hay cupo suficiente; aumentá el límite o importá menos símbolos." : "No hay símbolos nuevos para importar."); node.append(status);
  node.classList.remove("hidden");
  $("#bulk-import").disabled=!preview.canImport;
}
function resetBulkPreview() { bulkPreviewState=null; $("#bulk-import").disabled=true; $("#bulk-preview-output").classList.add("hidden"); }
["#bulk-text","#bulk-source","#bulk-note","#bulk-signal","#bulk-window"].forEach(selector=>$(selector).addEventListener("input",resetBulkPreview));
$("#bulk-preview").addEventListener("click",async()=>{const button=$("#bulk-preview");$("#bulk-error").textContent="";button.disabled=true;resetBulkPreview();try{const result=await api("/api/scanner/import/preview",{method:"POST",headers:mutationHeaders,body:JSON.stringify(bulkPayload())});bulkPreviewState=result.preview;renderBulkPreview(bulkPreviewState);}catch(error){$("#bulk-error").textContent=error.message;}finally{button.disabled=false;}});
$("#bulk-import").addEventListener("click",async()=>{if(!bulkPreviewState||!bulkPreviewState.canImport)return;const count=bulkPreviewState.newSymbols.length;if(!confirm("Agregar "+count+" setup(s) de "+($("#bulk-source").value.trim()||"importación bulk")+"?"))return;const button=$("#bulk-import");$("#bulk-error").textContent="";button.disabled=true;try{const result=await api("/api/scanner/import",{method:"POST",headers:{...mutationHeaders,"x-market-scanner":"confirm"},body:JSON.stringify(bulkPayload())});$("#bulk-text").value="";resetBulkPreview();await refresh();toast("Importados "+result.created.length+" setup(s) 620");}catch(error){$("#bulk-error").textContent=error.message;button.disabled=false;}});

$("#login-form").addEventListener("submit",async(event)=>{event.preventDefault();$("#login-error").textContent="";try{await api("/api/session",{method:"POST",headers:mutationHeaders,body:JSON.stringify({password:$("#password").value})});$("#password").value="";await refresh();await previewPulseImportFromUrl();}catch(error){$("#login-error").textContent=error.message;}});
$("#setup-form").addEventListener("submit",async(event)=>{event.preventDefault();$("#form-error").textContent="";const button=event.submitter;button.disabled=true;try{await api("/api/scanner/setups",{method:"POST",headers:mutationHeaders,body:JSON.stringify({symbol:$("#symbol").value.trim().toUpperCase(),signalPeriod:Number($("#signal").value),confirmationWindowBars:Number($("#window").value),note:$("#note").value.trim()})});$("#symbol").value="";$("#note").value="";await refresh();toast("Setup 620 armado");}catch(error){$("#form-error").textContent=error.message;}finally{button.disabled=false;}});
$("#run").addEventListener("click",async()=>{const button=$("#run");button.disabled=true;try{const result=await api("/api/scanner/run?force=1",{method:"POST",headers:{"x-market-scanner":"confirm","x-market-scanner-web":"confirm"}});toast("Ciclo listo: "+result.barsProcessed+" velas procesadas");await refresh();}catch(e){toast(e.message);}finally{button.disabled=false;}});
$("#test").addEventListener("click",async()=>{const button=$("#test");button.disabled=true;try{const result=await api("/api/scanner/test-notification",{method:"POST",headers:{"x-market-scanner":"confirm","x-market-scanner-web":"confirm"}});toast(result.deliveryOk?"Mensaje enviado a Telegram":"Telegram rechazó el mensaje");await refresh();}catch(e){toast(e.message);}finally{button.disabled=false;}});
$("#logout").addEventListener("click",async()=>{try{await api("/api/session",{method:"DELETE",headers:{"x-market-scanner-web":"confirm"}});}finally{showLogin();}});
refresh().then(previewPulseImportFromUrl).catch(()=>showLogin());
`;
