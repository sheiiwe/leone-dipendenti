(function(){
'use strict';

var cfg = window.LC_LOGIN_HERO || {};
var PORTAL = String(cfg.portale || '');
var BUCKET = 'app-media';
var ADMIN_EMAIL_HERO = 'amministrazione@leoneconsultingitalia.it';
var current = { immagine_url:String(cfg.defaultImage || ''), posizione_x:50, posizione_y:50, zoom:1 };
var savedUrl = '';
var pendingFile = null;
var pendingObjectUrl = '';

function clamp(value,min,max){
  value = Number(value);
  if(!Number.isFinite(value)) value = min;
  return Math.min(max,Math.max(min,value));
}
function normalize(row){
  row = row || {};
  var imageUrl = String(row.immagine_url || cfg.defaultImage || '');
  var legacyImages = Array.isArray(cfg.legacyImages) ? cfg.legacyImages.map(String) : [];
  var isLegacy = legacyImages.indexOf(imageUrl) >= 0;
  return {
    immagine_url: isLegacy ? String(cfg.defaultImage || '') : imageUrl,
    posizione_x: isLegacy ? 50 : clamp(row.posizione_x == null ? 50 : row.posizione_x,0,100),
    posizione_y: isLegacy ? 50 : clamp(row.posizione_y == null ? 50 : row.posizione_y,0,100),
    zoom: isLegacy ? 1 : clamp(row.zoom == null ? 1 : row.zoom,1,3)
  };
}
function client(){
  try{ return typeof db !== 'undefined' ? db : null }catch(e){ return null }
}
function applyImage(img,empty,state,overrideUrl){
  if(!img) return;
  var url = overrideUrl || state.immagine_url || '';
  img.style.setProperty('--lc-hero-x',state.posizione_x+'%');
  img.style.setProperty('--lc-hero-y',state.posizione_y+'%');
  img.style.setProperty('--lc-hero-zoom',String(state.zoom));
  if(url){
    img.src = url;
    img.hidden = false;
    if(empty) empty.hidden = true;
  }else{
    img.removeAttribute('src');
    img.hidden = true;
    if(empty) empty.hidden = false;
  }
}
function updateLive(){
  mountLiveSlogan();
  applyImage(
    document.getElementById('lc-login-hero-image'),
    document.getElementById('lc-login-hero-empty'),
    current
  );
}
function mountLiveSlogan(){
  var slogan=String(cfg.slogan || '');
  var img=document.getElementById('lc-login-hero-image');
  var visual=img && img.closest('.lc-login-visual');
  if(!visual || !slogan || visual.querySelector('.lc-login-slogan')) return;
  var shade=document.createElement('div');
  shade.className='lc-login-shade';
  var text=document.createElement('div');
  text.className='lc-login-slogan';
  text.innerHTML=slogan;
  visual.appendChild(shade);
  visual.appendChild(text);
}
async function loadLoginHeroConfig(){
  if(!PORTAL) return current;
  var c = client();
  if(!c){ updateLive(); return current; }
  try{
    var result = await c.from('portali_login_config').select('immagine_url,posizione_x,posizione_y,zoom').eq('portale',PORTAL).maybeSingle();
    if(result.error && result.error.code !== 'PGRST116') throw result.error;
    current = normalize(result.data);
    savedUrl = current.immagine_url;
  }catch(e){
    console.warn('Configurazione immagine login non disponibile:',e);
  }
  updateLive();
  return current;
}
function status(text,isError){
  var el=document.getElementById('lc-editor-status');
  if(!el) return;
  el.textContent=text || '';
  el.className='lc-editor-status '+(text?(isError?'err':'ok'):'');
}
function updateOutputs(){
  var x=document.getElementById('lc-hero-x');
  var y=document.getElementById('lc-hero-y');
  var z=document.getElementById('lc-hero-zoom');
  var xo=document.getElementById('lc-hero-x-out');
  var yo=document.getElementById('lc-hero-y-out');
  var zo=document.getElementById('lc-hero-zoom-out');
  if(x) x.value=String(Math.round(current.posizione_x));
  if(y) y.value=String(Math.round(current.posizione_y));
  if(z) z.value=String(current.zoom);
  if(xo) xo.textContent=Math.round(current.posizione_x)+'%';
  if(yo) yo.textContent=Math.round(current.posizione_y)+'%';
  if(zo) zo.textContent=current.zoom.toFixed(2)+'×';
}
function updatePreview(){
  applyImage(
    document.getElementById('lc-editor-image'),
    document.getElementById('lc-editor-empty'),
    current,
    pendingObjectUrl || current.immagine_url
  );
  updateOutputs();
}
function safeName(name){
  return String(name||'immagine').toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'');
}
function storagePathFromPublicUrl(url){
  if(!url) return '';
  var marker='/storage/v1/object/public/'+BUCKET+'/';
  var i=url.indexOf(marker);
  if(i<0) return '';
  try{ return decodeURIComponent(url.slice(i+marker.length).split('?')[0]); }catch(e){ return ''; }
}
async function saveHero(){
  var c=client();
  var button=document.getElementById('lc-save-hero');
  if(!c){ status('Connessione al database non disponibile.',true); return; }
  if(!pendingFile && !current.immagine_url){ status('Carica prima un’immagine.',true); return; }
  button.disabled=true;
  button.textContent='Salvataggio…';
  status('');
  var uploadedPath='';
  try{
    var sessionResult=await c.auth.getSession();
    var email=String(sessionResult.data && sessionResult.data.session && sessionResult.data.session.user && sessionResult.data.session.user.email || '').toLowerCase();
    if(email!==ADMIN_EMAIL_HERO) throw new Error('Questa funzione è riservata all’amministrazione.');

    var finalUrl=current.immagine_url;
    if(pendingFile){
      var ext=(safeName(pendingFile.name).split('.').pop() || 'jpg').replace(/[^a-z0-9]/g,'');
      if(!ext || ext.length>5) ext=pendingFile.type==='image/png'?'png':(pendingFile.type==='image/webp'?'webp':'jpg');
      uploadedPath='login-hero/'+PORTAL+'/hero-'+Date.now()+'.'+ext;
      var uploaded=await c.storage.from(BUCKET).upload(uploadedPath,pendingFile,{
        cacheControl:'3600',
        upsert:false,
        contentType:pendingFile.type
      });
      if(uploaded.error) throw uploaded.error;
      var pub=c.storage.from(BUCKET).getPublicUrl(uploadedPath);
      finalUrl=pub.data.publicUrl+'?v='+Date.now();
    }

    var payload={
      portale:PORTAL,
      immagine_url:finalUrl,
      posizione_x:Number(current.posizione_x.toFixed(2)),
      posizione_y:Number(current.posizione_y.toFixed(2)),
      zoom:Number(current.zoom.toFixed(2)),
      aggiornato_il:new Date().toISOString()
    };
    var stored=await c.from('portali_login_config').upsert(payload,{onConflict:'portale'}).select().single();
    if(stored.error) throw stored.error;

    var oldPath=storagePathFromPublicUrl(savedUrl);
    current=normalize(stored.data);
    savedUrl=current.immagine_url;
    pendingFile=null;
    if(pendingObjectUrl){ URL.revokeObjectURL(pendingObjectUrl); pendingObjectUrl=''; }
    var fileInput=document.getElementById('lc-hero-file');
    if(fileInput) fileInput.value='';
    updatePreview();
    updateLive();
    if(uploadedPath && oldPath && oldPath!==uploadedPath){
      try{ await c.storage.from(BUCKET).remove([oldPath]); }catch(removeError){ console.warn('Vecchia immagine non rimossa:',removeError); }
    }
    status('Immagine salvata. La pagina di accesso ora userà questo ritaglio.',false);
  }catch(e){
    if(uploadedPath){
      try{ await c.storage.from(BUCKET).remove([uploadedPath]); }catch(cleanupError){}
    }
    status((e && e.message) ? e.message : 'Non è stato possibile salvare l’immagine.',true);
  }finally{
    button.disabled=false;
    button.textContent='Salva immagine';
  }
}
function editorMarkup(){
  var slogan=String(cfg.slogan || '');
  var label=String(cfg.etichetta || PORTAL);
  var overlay=slogan ? '<div class="lc-login-shade"></div><div class="lc-login-slogan">'+slogan+'</div>' : '';
  return ''+
    '<div class="lc-editor-head">'+
      '<div><h2>Immagine pagina di accesso</h2><p>Carica e sistema l’immagine principale del '+label+'. L’anteprima riproduce il ritaglio visibile nella pagina di login.</p></div>'+
      '<span class="lc-editor-badge">Solo amministrazione</span>'+
    '</div>'+
    '<div class="lc-editor-grid">'+
      '<div>'+
        '<div class="lc-editor-preview" id="lc-editor-preview" title="Trascina l’immagine per spostarla">'+
          '<img id="lc-editor-image" class="lc-hero-img" alt="Anteprima immagine di accesso" hidden>'+
          '<div id="lc-editor-empty" class="lc-login-empty">Nessuna immagine caricata</div>'+
          overlay+
        '</div>'+
        '<div class="lc-editor-help" style="margin-top:9px">Puoi trascinare direttamente l’immagine nell’anteprima. Su telefono usa un dito; i cursori permettono una regolazione più precisa.</div>'+
      '</div>'+
      '<div class="lc-editor-controls">'+
        '<input id="lc-hero-file" type="file" accept="image/jpeg,image/png,image/webp" hidden>'+
        '<button id="lc-pick-hero" class="lc-file-button" type="button">Carica una nuova immagine</button>'+
        '<div class="lc-control"><label for="lc-hero-zoom"><span>Zoom</span><output id="lc-hero-zoom-out">1.00×</output></label><input id="lc-hero-zoom" type="range" min="1" max="3" step="0.01" value="1"></div>'+
        '<div class="lc-control"><label for="lc-hero-x"><span>Posizione orizzontale</span><output id="lc-hero-x-out">50%</output></label><input id="lc-hero-x" type="range" min="0" max="100" step="1" value="50"></div>'+
        '<div class="lc-control"><label for="lc-hero-y"><span>Posizione verticale</span><output id="lc-hero-y-out">50%</output></label><input id="lc-hero-y" type="range" min="0" max="100" step="1" value="50"></div>'+
        '<div class="lc-editor-actions"><button id="lc-center-hero" class="lc-editor-button" type="button">Centra</button><button id="lc-save-hero" class="lc-editor-button lc-primary" type="button">Salva immagine</button></div>'+
        '<div id="lc-editor-status" class="lc-editor-status" aria-live="polite"></div>'+
      '</div>'+
    '</div>';
}
function bindEditor(){
  var pick=document.getElementById('lc-pick-hero');
  var file=document.getElementById('lc-hero-file');
  var preview=document.getElementById('lc-editor-preview');
  if(!pick || !file || !preview) return;

  pick.addEventListener('click',function(){ file.click(); });
  file.addEventListener('change',function(){
    var chosen=file.files && file.files[0];
    if(!chosen) return;
    if(['image/jpeg','image/png','image/webp'].indexOf(chosen.type)<0){
      file.value='';
      status('Formato non supportato. Usa JPG, PNG oppure WebP.',true);
      return;
    }
    if(chosen.size>5*1024*1024){
      file.value='';
      status('L’immagine supera 5 MB. Riducila e riprova.',true);
      return;
    }
    pendingFile=chosen;
    if(pendingObjectUrl) URL.revokeObjectURL(pendingObjectUrl);
    pendingObjectUrl=URL.createObjectURL(chosen);
    status('Anteprima pronta: regola ritaglio e zoom, poi salva.',false);
    updatePreview();
  });

  [['lc-hero-x','posizione_x'],['lc-hero-y','posizione_y'],['lc-hero-zoom','zoom']].forEach(function(pair){
    var input=document.getElementById(pair[0]);
    input.addEventListener('input',function(){
      current[pair[1]]=Number(input.value);
      updatePreview();
      status('');
    });
  });
  document.getElementById('lc-center-hero').addEventListener('click',function(){
    current.posizione_x=50;
    current.posizione_y=50;
    current.zoom=1;
    updatePreview();
    status('Immagine ricentrata nell’anteprima. Premi Salva immagine per confermare.',false);
  });
  document.getElementById('lc-save-hero').addEventListener('click',saveHero);

  var dragging=false,lastX=0,lastY=0;
  preview.addEventListener('pointerdown',function(e){
    if(!(pendingObjectUrl || current.immagine_url)) return;
    dragging=true; lastX=e.clientX; lastY=e.clientY;
    preview.classList.add('is-dragging');
    preview.setPointerCapture(e.pointerId);
  });
  preview.addEventListener('pointermove',function(e){
    if(!dragging) return;
    var rect=preview.getBoundingClientRect();
    var dx=e.clientX-lastX,dy=e.clientY-lastY;
    lastX=e.clientX; lastY=e.clientY;
    current.posizione_x=clamp(current.posizione_x-(dx/Math.max(rect.width,1))*100/current.zoom,0,100);
    current.posizione_y=clamp(current.posizione_y-(dy/Math.max(rect.height,1))*100/current.zoom,0,100);
    updatePreview();
    status('');
  });
  function stopDrag(){ dragging=false; preview.classList.remove('is-dragging'); }
  preview.addEventListener('pointerup',stopDrag);
  preview.addEventListener('pointercancel',stopDrag);
}
async function initLoginHeroAdmin(containerId){
  var target=document.getElementById(containerId);
  if(!target) return;
  if(!target.dataset.lcInitialized){
    target.innerHTML=editorMarkup();
    target.dataset.lcInitialized='1';
    bindEditor();
  }
  await loadLoginHeroConfig();
  updatePreview();
}
window.loadLoginHeroConfig=loadLoginHeroConfig;
window.initLoginHeroAdmin=initLoginHeroAdmin;

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',function(){ loadLoginHeroConfig(); });
}else{
  loadLoginHeroConfig();
}
})();
