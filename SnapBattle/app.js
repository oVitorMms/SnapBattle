const sb=supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY),$=s=>document.querySelector(s),TZ='America/Sao_Paulo';
// ---- Datas sempre no fuso de Brasília ----
const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:TZ});
const addDays=(d,n)=>{const t=new Date(d+'T12:00:00Z');t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10)};
const THEMES=['Algo azul','Sombra interessante','Sua refeição','Textura','Reflexo','Algo redondo','Vista da janela','Pet ou planta','Contraluz','Algo antigo','Cores quentes','Simetria','Seus pés','Algo minúsculo','Rua','Algo que te faz sorrir','Preto e branco','Linhas e geometria','Seu café','Algo vermelho','Céu','Mãos','Algo quebrado','Perspectiva de baixo','Algo cotidiano','Água','Algo amarelo','Movimento','Seu sapato favorito','Luz natural','Algo macio','Detalhe de porta','Autorretrato criativo','Algo verde','Comida de rua','Número ou letra','Algo que voa','Seu caminho hoje','Algo brilhante','Padrões','Nostalgia','Algo dobrado','Fruta','Sua sombra','Algo gigante','Ferramenta','Cheiro de casa','Algo de madeira','Fim de tarde','Dois objetos iguais','Livro ou música','Algo laranja','Bagunça organizada','Escada','Algo transparente','Seu lugar favorito','Algo que gira','Roxo ou rosa','Humor','Gratidão'];
const themeOf=d=>THEMES[Math.floor(Date.parse(d+'T00:00:00Z')/864e5)%THEMES.length]; // determinístico pela data
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const toast=m=>{const t=$('#toast');t.textContent=m;t.classList.add('on');setTimeout(()=>t.classList.remove('on'),3000)};
const busy=async f=>{$('#loader').hidden=false;try{return await f()}catch(e){toast(e.message||'Algo deu errado')}finally{$('#loader').hidden=true}};
let me=null,mode='login',tab='today',curDate=today();

// ---- Auth ----
$('#authForm').onsubmit=e=>{e.preventDefault();busy(async()=>{
  const f=Object.fromEntries(new FormData(e.target));
  if(mode==='login'){const{error}=await sb.auth.signInWithPassword({email:f.email,password:f.password});if(error)throw error}
  else{const{data,error}=await sb.auth.signUp({email:f.email,password:f.password,options:{data:{username:f.username,invite:f.invite}}});
    if(error)throw error;if(!data.session)toast('Confirme seu e-mail para entrar')}})};
$('#toggle').onclick=()=>{mode=mode==='login'?'signup':'login';$('#authForm').classList.toggle('signup',mode==='signup');$('#toggle').textContent=mode==='login'?'Criar conta':'Já tenho conta'};
sb.auth.onAuthStateChange((ev,s)=>{if(ev==='TOKEN_REFRESHED')return;const was=me?.id;me=s?.user||null;$('#auth').hidden=!!me;$('#app').hidden=!me;if(me&&me.id!==was)go(tab)});

// ---- Navegação ----
function go(t){tab=t;document.querySelectorAll('.panel').forEach(p=>p.hidden=p.id!=='p-'+t);
  document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('on',b.dataset.t===t));
  busy({today:renderToday,rank:renderRank,hist:renderHist,me:renderMe}[t])}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>go(b.dataset.t));
const img=(u,c)=>`<img src="${esc(u)}" data-full="${esc(u)}" loading="lazy" alt="${esc(c)}">`;
document.addEventListener('click',e=>{const u=e.target.dataset?.full;if(u){$('#viewer img').src=u;$('#viewer').hidden=false}});
$('#viewer').onclick=()=>$('#viewer').hidden=true;

// ---- Cronômetro até 00h00 de Brasília + virada de dia ----
const fmt=new Intl.DateTimeFormat('en-GB',{timeZone:TZ,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
setInterval(()=>{
  if(today()!==curDate){curDate=today();if(me)go(tab)}
  const p=fmt.formatToParts(new Date()).reduce((a,x)=>(a[x.type]=+x.value,a),{});
  const r=86400-(p.hour*3600+p.minute*60+p.second);
  $('#cd').textContent=[r/3600|0,(r%3600)/60|0,r%60].map(n=>String(n).padStart(2,'0')).join(':')},1000);

// ---- Compressão client-side (1080px, JPEG 0.75) ----
const compress=f=>new Promise((ok,no)=>{const im=new Image();im.onload=()=>{const r=Math.min(1,1080/im.width),c=document.createElement('canvas');
  c.width=Math.round(im.width*r);c.height=Math.round(im.height*r);c.getContext('2d').drawImage(im,0,0,c.width,c.height);
  c.toBlob(b=>b?ok(b):no(new Error('Falha ao comprimir')),'image/jpeg',.75)};im.onerror=()=>no(new Error('Imagem inválida'));im.src=URL.createObjectURL(f)});
const upload=file=>busy(async()=>{const d=today(),blob=await compress(file),path=`${me.id}/${d}.jpg`;
  const{error:e1}=await sb.storage.from('daily-photos').upload(path,blob,{contentType:'image/jpeg',upsert:true});if(e1)throw e1;
  const url=sb.storage.from('daily-photos').getPublicUrl(path).data.publicUrl;
  const{error}=await sb.from('photos').insert({user_id:me.id,image_url:url,caption:$('#cap').value.trim(),challenge_date:d});if(error)throw error;
  toast('Foto enviada!');renderToday()});

// ---- Aba Hoje ----
async function renderToday(){
  const d=today(),el=$('#p-today');$('#theme').textContent=themeOf(d);
  const[{data:mine},{data:sp},{data:yr}]=await Promise.all([
    sb.from('photos').select('id').eq('user_id',me.id).eq('challenge_date',d).maybeSingle(),
    sb.from('spectators').select('day').eq('user_id',me.id).eq('day',d).maybeSingle(),
    sb.rpc('day_results',{d:addDays(d,-1)})]);
  const w=yr?.[0]?.votes_count>0?yr[0]:null;
  let h=w?`<div class="card win"><b>Vencedor de ontem: ${esc(w.username)}</b>${img(w.image_url,w.caption)}<small>Média ${w.avg_score} em ${w.votes_count} votos</small></div>`:'';
  if(!mine&&!sp){
    el.innerHTML=h+`<div class="card"><h3>Poste sua foto de hoje</h3><p class="muted">Você só vê as fotos da turma depois de postar.</p><input id="cap" maxlength="100" placeholder="Legenda (até 100 caracteres)">
      <div class="row"><label class="btn">Tirar foto<input type="file" accept="image/*" capture="environment" hidden></label><label class="btn alt">Da galeria<input type="file" accept="image/*" hidden></label></div>
      <button class="link" id="spec">Só espiar (sem voto hoje)</button></div>`;
    el.querySelectorAll('input[type=file]').forEach(i=>i.onchange=()=>i.files[0]&&upload(i.files[0]));
    $('#spec').onclick=()=>busy(async()=>{const{error}=await sb.from('spectators').insert({user_id:me.id,day:d});if(error)throw error;renderToday()});
    return}
  const[{data:ph},{data:vt}]=await Promise.all([
    sb.from('photos').select('id,user_id,image_url,caption,profiles(username)').eq('challenge_date',d).order('created_at'),
    sb.from('votes').select('photo_id,score').eq('voter_id',me.id)]);
  const my=Object.fromEntries((vt||[]).map(v=>[v.photo_id,v.score]));
  h+=(mine?'':'<p class="muted">Modo espectador: hoje você não vota.</p>')+((ph||[]).map(p=>{const own=p.user_id===me.id;
    return `<div class="card"><b>${esc(p.profiles?.username)}${own?' (você)':''}</b>${img(p.image_url,p.caption)}<p>${esc(p.caption)}</p>${own||!mine?'':`<div class="stars" data-id="${p.id}">${[1,2,3,4,5].map(n=>`<button aria-label="${n} estrelas" class="${n<=(my[p.id]||0)?'on':''}" data-s="${n}">★</button>`).join('')}</div>`}</div>`}).join('')||'<p class="muted">Ainda não há fotos.</p>');
  el.innerHTML=h;
  el.querySelectorAll('.stars button').forEach(b=>b.onclick=()=>busy(async()=>{
    const{error}=await sb.from('votes').upsert({photo_id:b.parentNode.dataset.id,voter_id:me.id,score:+b.dataset.s},{onConflict:'photo_id,voter_id'});
    if(error)throw error;toast('Voto salvo');renderToday()}));
}

// ---- Ranking ----
async function renderRank(){
  const[{data:r},{data:ph}]=await Promise.all([sb.rpc('ranking'),sb.from('photos').select('user_id,challenge_date')]);
  const t=today(),ds={};(ph||[]).forEach(p=>(ds[p.user_id]??=new Set()).add(p.challenge_date));
  const streak=u=>{const s=ds[u]||new Set();let d=s.has(t)?t:addDays(t,-1),n=0;while(s.has(d)){n++;d=addDays(d,-1)}return n};
  $('#p-rank').innerHTML=(r||[]).map((u,i)=>`<div class="card row between"><span>${['🥇','🥈','🥉'][i]||(i+1)+'º'} <b>${esc(u.username)}</b></span><small>${u.total_points} pts · ${u.wins} vitórias · ${streak(u.user_id)} dias seguidos</small></div>`).join('')||'<p class="muted">Sem dados ainda.</p>';
}

// ---- Histórico ----
async function renderHist(){
  const el=$('#p-hist'),y=addDays(today(),-1);
  if(!$('#hd')){el.innerHTML=`<input type="date" id="hd" max="${y}" value="${y}"><div id="hl"></div>`;$('#hd').onchange=()=>busy(renderHist)}
  const dd=$('#hd').value||y,{data}=await sb.rpc('day_results',{d:dd});
  $('#hl').innerHTML=`<p class="muted">Tema do dia: ${esc(themeOf(dd))}</p>`+((data||[]).map(r=>{const win=r.rnk==1&&r.votes_count>0;
    return `<div class="card ${win?'win':''}"><b>${win?'Vencedor · ':''}${esc(r.username)}</b>${img(r.image_url,r.caption)}<p>${esc(r.caption)}</p><small>Média ${r.avg_score??'–'} em ${r.votes_count} votos</small></div>`}).join('')||'<p class="muted">Nenhuma foto neste dia.</p>');
}

// ---- Perfil ----
async function renderMe(){
  const{data:p}=await sb.from('profiles').select('username').eq('id',me.id).single();
  $('#p-me').innerHTML=`<div class="card"><h3>${esc(p.username)}</h3><p class="muted">${esc(me.email)}</p><form onsubmit="return false"><input id="nn" value="${esc(p.username)}" maxlength="30"><button class="btn" id="sv">Salvar nome</button><button class="btn alt" id="lo">Sair</button></form></div>`;
  $('#sv').onclick=()=>busy(async()=>{const{error}=await sb.from('profiles').update({username:$('#nn').value.trim()}).eq('id',me.id);if(error)throw error;toast('Nome salvo');renderMe()});
  $('#lo').onclick=()=>sb.auth.signOut();
}
