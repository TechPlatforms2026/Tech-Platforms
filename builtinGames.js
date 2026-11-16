const YORUNGE_SAVUNMASI_HTML = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Yörünge Savunması — Tech Games</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#090d16;color:#f1f5f9;font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:12px;user-select:none}
  .hud{width:100%;max-width:680px;display:flex;justify-content:space-between;align-items:center;padding:8px 14px;background:#0f1623;border:1px solid #1e293b;border-radius:10px;margin-bottom:10px;font-size:13px;font-weight:600}
  .hud span b{color:#34d399;font-variant-numeric:tabular-nums}
  .wrap{position:relative;width:100%;max-width:680px;aspect-ratio:16/10;border:1px solid #1e293b;border-radius:12px;overflow:hidden;background:#05080f}
  canvas{display:block;width:100%;height:100%;cursor:crosshair}
  .overlay{position:absolute;inset:0;background:rgba(9,13,22,.84);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;gap:12px}
  .overlay.hidden{display:none}
  h2{font-size:24px;color:#fff}
  p{font-size:13px;color:#94a3b8;max-width:420px;line-height:1.5}
  button{background:#10b981;color:#052e16;border:0;border-radius:8px;padding:10px 22px;font-size:14px;font-weight:700;cursor:pointer}
  button:hover{background:#34d399}
</style>
</head>
<body>
  <div class="hud">
    <span>Skor: <b id="sc">0</b></span>
    <span>Dalga: <b id="wv">1</b></span>
    <span>Kalkan: <b id="hp">100</b>%</span>
  </div>
  <div class="wrap">
    <canvas id="c" width="680" height="425"></canvas>
    <div id="ov" class="overlay">
      <h2 id="ov-title">Yörünge Savunması</h2>
      <p id="ov-desc">W/A/S/D veya Ok tuşları ile gemiyi yönetin, fare tıklaması veya Boşluk ile plazma atışı yapın. Asteroitlerden kaçın ve hedefleri yok edin.</p>
      <button id="start-btn" type="button">Oyunu Başlat</button>
    </div>
  </div>
<script>
const c = document.getElementById('c');
const ctx = c.getContext('2d');
const scEl = document.getElementById('sc');
const wvEl = document.getElementById('wv');
const hpEl = document.getElementById('hp');
const ov = document.getElementById('ov');
const ovTitle = document.getElementById('ov-title');
const ovDesc = document.getElementById('ov-desc');
const btn = document.getElementById('start-btn');

let state = 'MENU', score = 0, hp = 100, wave = 1, lastSpawn = 0, shootCd = 0;
let ship = { x: 340, y: 340, vx: 0, vy: 0 };
let bullets = [], rocks = [], stars = [], keys = {};
for (let i=0;i<60;i++) stars.push({x:Math.random()*680,y:Math.random()*425,s:Math.random()*1.8+0.6,sp:Math.random()*0.6+0.2});

function resetGame() {
  score = 0; hp = 100; wave = 1;
  ship = { x: 340, y: 340, vx: 0, vy: 0 };
  bullets = []; rocks = []; lastSpawn = 0; shootCd = 0;
  state = 'PLAYING';
  ov.classList.add('hidden');
  syncHud();
}
function syncHud(){ scEl.textContent=score; wvEl.textContent=wave; hpEl.textContent=Math.max(0,hp); }

btn.addEventListener('click', resetGame);
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
c.addEventListener('pointerdown', () => { keys['Pointer'] = true; });
window.addEventListener('pointerup', () => { keys['Pointer'] = false; });

function loop(ts) {
  ctx.fillStyle = '#05080f';
  ctx.fillRect(0,0,680,425);
  stars.forEach(st => {
    st.y += st.sp;
    if (st.y > 425) { st.y = 0; st.x = Math.random()*680; }
    ctx.fillStyle = 'rgba(148,163,184,0.45)';
    ctx.fillRect(st.x, st.y, st.s, st.s);
  });

  if (state === 'PLAYING') {
    const spd = 4.2;
    if (keys['ArrowLeft'] || keys['KeyA']) ship.x -= spd;
    if (keys['ArrowRight'] || keys['KeyD']) ship.x += spd;
    if (keys['ArrowUp'] || keys['KeyW']) ship.y -= spd;
    if (keys['ArrowDown'] || keys['KeyS']) ship.y += spd;
    ship.x = Math.max(20, Math.min(660, ship.x));
    ship.y = Math.max(24, Math.min(400, ship.y));

    if (shootCd > 0) shootCd--;
    if ((keys['Space'] || keys['Pointer']) && shootCd === 0) {
      bullets.push({ x: ship.x, y: ship.y - 16, vy: -8.5 });
      shootCd = 9;
    }

    const spawnEvery = Math.max(260, 820 - wave * 55);
    if (ts - lastSpawn > spawnEvery) {
      lastSpawn = ts;
      const r = 12 + Math.random() * 14;
      rocks.push({ x: 24 + Math.random() * 632, y: -20, r, vy: 1.6 + Math.random() * (1.2 + wave * 0.25) });
    }

    for (let i = bullets.length - 1; i >= 0; i--) {
      bullets[i].y += bullets[i].vy;
      if (bullets[i].y < -10) bullets.splice(i, 1);
    }

    for (let i = rocks.length - 1; i >= 0; i--) {
      const rk = rocks[i];
      rk.y += rk.vy;
      if (rk.y > 450) { rocks.splice(i, 1); continue; }
      const dx = rk.x - ship.x, dy = rk.y - ship.y;
      if (Math.hypot(dx, dy) < rk.r + 13) {
        rocks.splice(i, 1);
        hp -= 25;
        syncHud();
        if (hp <= 0) {
          state = 'OVER';
          ovTitle.textContent = 'Görev Tamamlandı';
          ovDesc.textContent = 'Toplam Skor: ' + score + ' · Ulaşılan Dalga: ' + wave;
          btn.textContent = 'Tekrar Oyna';
          ov.classList.remove('hidden');
        }
        continue;
      }
      for (let j = bullets.length - 1; j >= 0; j--) {
        const b = bullets[j];
        if (Math.hypot(rk.x - b.x, rk.y - b.y) < rk.r + 5) {
          bullets.splice(j, 1);
          rocks.splice(i, 1);
          score += 20;
          wave = 1 + Math.floor(score / 180);
          syncHud();
          break;
        }
      }
    }

    // Draw bullets
    ctx.fillStyle = '#38bdf8';
    bullets.forEach(b => { ctx.fillRect(b.x - 2, b.y - 8, 4, 12); });

    // Draw rocks
    rocks.forEach(rk => {
      ctx.beginPath();
      ctx.arc(rk.x, rk.y, rk.r, 0, Math.PI * 2);
      ctx.fillStyle = '#334155';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#f59e0b';
      ctx.stroke();
    });

    // Draw ship
    ctx.beginPath();
    ctx.moveTo(ship.x, ship.y - 16);
    ctx.lineTo(ship.x + 13, ship.y + 12);
    ctx.lineTo(ship.x, ship.y + 6);
    ctx.lineTo(ship.x - 13, ship.y + 12);
    ctx.closePath();
    ctx.fillStyle = '#10b981';
    ctx.fill();
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
<\/script>
</body>
</html>`;
const NEON_BLOK_KIRICI_HTML = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Neon Blok Kırıcı — Tech Games</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#090d16;color:#f1f5f9;font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:12px}
  .hud{width:100%;max-width:680px;display:flex;justify-content:space-between;padding:8px 14px;background:#0f1623;border:1px solid #1e293b;border-radius:10px;margin-bottom:10px;font-size:13px;font-weight:600}
  .hud b{color:#38bdf8;font-variant-numeric:tabular-nums}
  .wrap{position:relative;width:100%;max-width:680px;aspect-ratio:16/10;border:1px solid #1e293b;border-radius:12px;overflow:hidden;background:#05080f}
  canvas{display:block;width:100%;height:100%}
  .overlay{position:absolute;inset:0;background:rgba(9,13,22,.85);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:12px;padding:24px}
  .overlay.hidden{display:none}
  button{background:#38bdf8;color:#082f49;border:0;border-radius:8px;padding:10px 22px;font-size:14px;font-weight:700;cursor:pointer}
</style>
</head>
<body>
<div class="hud"><span>Skor: <b id="sc">0</b></span><span>Can: <b id="lv">3</b></span></div>
<div class="wrap">
  <canvas id="c" width="680" height="425"></canvas>
  <div id="ov" class="overlay">
    <h2 id="t">Neon Blok Kırıcı</h2>
    <p id="d">Fare hareketiyle veya Sol/Sağ ok tuşlarıyla raketi kontrol edin, enerji topuyla tüm blokları kırın.</p>
    <button id="b" type="button">Başlat</button>
  </div>
</div>
<script>
const c=document.getElementById('c'),ctx=c.getContext('2d');
const sc=document.getElementById('sc'),lv=document.getElementById('lv');
const ov=document.getElementById('ov'),t=document.getElementById('t'),d=document.getElementById('d'),b=document.getElementById('b');
let state='MENU',score=0,lives=3,paddle={x:290,w:104},ball={x:340,y:260,vx:3.8,vy:-4.1},bricks=[],keys={};

function buildBricks(){
  bricks=[];
  const colors=['#10b981','#38bdf8','#f59e0b','#818cf8'];
  for(let r=0;r<4;r++) for(let col=0;col<9;col++) bricks.push({x:26+col*71,y:42+r*26,w:63,h:18,alive:true,color:colors[r]});
}
function start(){
  score=0;lives=3;paddle.x=288;ball={x:340,y:260,vx:3.8,vy:-4.1};
  buildBricks();state='PLAYING';ov.classList.add('hidden');
  sc.textContent=score;lv.textContent=lives;
}
b.onclick=start;
window.onkeydown=e=>{keys[e.code]=true;};
window.onkeyup=e=>{keys[e.code]=false;};
c.addEventListener('pointermove',e=>{
  const rect=c.getBoundingClientRect();
  const px=(e.clientX-rect.left)*(680/rect.width);
  paddle.x=Math.max(8,Math.min(672-paddle.w,px-paddle.w/2));
});
function tick(){
  ctx.fillStyle='#05080f';ctx.fillRect(0,0,680,425);
  if(state==='PLAYING'){
    if(keys['ArrowLeft']||keys['KeyA']) paddle.x=Math.max(8,paddle.x-6.5);
    if(keys['ArrowRight']||keys['KeyD']) paddle.x=Math.min(672-paddle.w,paddle.x+6.5);
    ball.x+=ball.vx;ball.y+=ball.vy;
    if(ball.x<8||ball.x>672) ball.vx*=-1;
    if(ball.y<8) ball.vy*=-1;
    if(ball.y>=384&&ball.y<=398&&ball.x>=paddle.x&&ball.x<=paddle.x+paddle.w&&ball.vy>0){
      const hit=(ball.x-(paddle.x+paddle.w/2))/(paddle.w/2);
      ball.vx=hit*5.4;ball.vy=-Math.abs(ball.vy);
    }
    if(ball.y>430){
      lives--;lv.textContent=Math.max(0,lives);
      if(lives<=0){state='OVER';t.textContent='Oyun Bitti';d.textContent='Toplam Skor: '+score;b.textContent='Tekrar Oyna';ov.classList.remove('hidden');}
      else {ball={x:paddle.x+paddle.w/2,y:280,vx:3.5,vy:-4};}
    }
    let left=0;
    for(const br of bricks){
      if(!br.alive) continue;
      left++;
      if(ball.x>br.x&&ball.x<br.x+br.w&&ball.y>br.y&&ball.y<br.y+br.h){
        br.alive=false;ball.vy*=-1;score+=15;sc.textContent=score;
      }
      if(br.alive){ctx.fillStyle=br.color;ctx.fillRect(br.x,br.y,br.w,br.h);}
    }
    if(left===0){state='WIN';t.textContent='Tebrikler!';d.textContent='Tüm blokları temizlediniz · Skor: '+score;b.textContent='Tekrar Oyna';ov.classList.remove('hidden');}
    ctx.fillStyle='#e2e8f0';ctx.fillRect(paddle.x,388,paddle.w,11);
    ctx.beginPath();ctx.arc(ball.x,ball.y,7,0,Math.PI*2);ctx.fillStyle='#38bdf8';ctx.fill();
  }
  requestAnimationFrame(tick);
}
buildBricks();requestAnimationFrame(tick);
<\/script>
</body>
</html>`;
const REAKTOR_2048_HTML = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>2048 Reaktör Matrisi — Tech Games</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#090d16;color:#f1f5f9;font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:14px;gap:12px}
  .top{width:320px;display:flex;justify-content:space-between;align-items:center}
  .score{background:#0f1623;border:1px solid #1e293b;border-radius:8px;padding:6px 12px;font-size:13px;font-weight:700}
  .score b{color:#10b981}
  button{background:#10b981;color:#052e16;border:0;border-radius:8px;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer}
  .grid{width:320px;height:320px;background:#0f1623;border:1px solid #1e293b;border-radius:12px;padding:10px;display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
  .cell{border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:20px;font-variant-numeric:tabular-nums;background:#090d16;color:#e2e8f0}
  .hint{font-size:12px;color:#94a3b8;text-align:center}
  .pad{display:flex;gap:6px}
  .pad button{background:#1e293b;color:#e2e8f0;padding:8px 14px}
</style>
</head>
<body>
  <div class="top">
    <div class="score">Skor: <b id="sc">0</b></div>
    <button id="rst" type="button">Tekrar Oyna</button>
  </div>
  <div id="grid" class="grid"></div>
  <div class="pad">
    <button type="button" onclick="move('L')">◀</button>
    <button type="button" onclick="move('U')">▲</button>
    <button type="button" onclick="move('D')">▼</button>
    <button type="button" onclick="move('R')">▶</button>
  </div>
  <p class="hint">Ok tuşları veya yön butonları ile aynı sayıları birleştirip 2048 çekirdeğine ulaşın.</p>
<script>
let board=Array(16).fill(0),score=0;
const colors={0:'#090d16',2:'#1e293b',4:'#0f3a4a',8:'#0369a1',16:'#0284c7',32:'#059669',64:'#10b981',128:'#d97706',256:'#f59e0b',512:'#7c3aed',1024:'#9333ea',2048:'#e11d48'};
function addTile(){const emp=[];board.forEach((v,i)=>{if(!v)emp.push(i)});if(emp.length)board[emp[Math.floor(Math.random()*emp.length)]]=Math.random()<0.9?2:4;}
function slide(arr){const f=arr.filter(Boolean);for(let i=0;i<f.length-1;i++){if(f[i]===f[i+1]){f[i]*=2;score+=f[i];f[i+1]=0;}}const c=f.filter(Boolean);while(c.length<4)c.push(0);return c;}
function move(dir){
  const prev=board.join(',');
  for(let i=0;i<4;i++){
    let line=[];
    for(let j=0;j<4;j++){
      const idx=dir==='L'?i*4+j:dir==='R'?i*4+(3-j):dir==='U'?j*4+i:(3-j)*4+i;
      line.push(board[idx]);
    }
    const merged=slide(line);
    for(let j=0;j<4;j++){
      const idx=dir==='L'?i*4+j:dir==='R'?i*4+(3-j):dir==='U'?j*4+i:(3-j)*4+i;
      board[idx]=merged[j];
    }
  }
  if(board.join(',')!==prev){addTile();render();}
}
function render(){
  const g=document.getElementById('grid');g.innerHTML='';
  board.forEach(v=>{const d=document.createElement('div');d.className='cell';d.textContent=v||'';d.style.background=colors[v]||'#10b981';g.appendChild(d);});
  document.getElementById('sc').textContent=score;
}
function init(){board=Array(16).fill(0);score=0;addTile();addTile();render();}
document.getElementById('rst').onclick=init;
window.onkeydown=e=>{if(e.key==='ArrowLeft'){e.preventDefault();move('L')}if(e.key==='ArrowRight'){e.preventDefault();move('R')}if(e.key==='ArrowUp'){e.preventDefault();move('U')}if(e.key==='ArrowDown'){e.preventDefault();move('D')}};
init();
<\/script>
</body>
</html>`;
const SIBER_YILAN_HTML = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Siber Yılan Arena — Tech Games</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#090d16;color:#f1f5f9;font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:12px;gap:10px}
  .hud{width:400px;max-width:100%;display:flex;justify-content:space-between;align-items:center;background:#0f1623;border:1px solid #1e293b;border-radius:8px;padding:8px 12px;font-size:13px;font-weight:700}
  .hud b{color:#10b981}
  canvas{background:#05080f;border:1px solid #1e293b;border-radius:10px;max-width:100%}
  button{background:#10b981;color:#052e16;border:0;border-radius:6px;padding:6px 14px;font-size:12px;font-weight:700;cursor:pointer}
</style>
</head>
<body>
<div class="hud"><span>Skor: <b id="sc">0</b></span><span id="st">Hazır</span><button id="rst" type="button">Tekrar Oyna</button></div>
<canvas id="c" width="400" height="400"></canvas>
<script>
const c=document.getElementById('c'),ctx=c.getContext('2d'),sc=document.getElementById('sc'),st=document.getElementById('st');
let snake,dir,food,score,dead,tm;
function spawnFood(){return {x:Math.floor(Math.random()*20),y:Math.floor(Math.random()*20)};}
function init(){
  snake=[{x:10,y:10},{x:9,y:10},{x:8,y:10}];dir={x:1,y:0};food=spawnFood();score=0;dead=false;
  sc.textContent=0;st.textContent='Oynanıyor';
  if(tm)clearInterval(tm);tm=setInterval(step,110);
}
function step(){
  if(dead)return;
  const head={x:(snake[0].x+dir.x+20)%20,y:(snake[0].y+dir.y+20)%20};
  if(snake.some(p=>p.x===head.x&&p.y===head.y)){dead=true;st.textContent='Çarpışma!';return;}
  snake.unshift(head);
  if(head.x===food.x&&head.y===food.y){score+=10;sc.textContent=score;food=spawnFood();}
  else snake.pop();
  ctx.fillStyle='#05080f';ctx.fillRect(0,0,400,400);
  ctx.fillStyle='#f59e0b';ctx.fillRect(food.x*20+3,food.y*20+3,14,14);
  snake.forEach((p,i)=>{ctx.fillStyle=i===0?'#34d399':'#059669';ctx.fillRect(p.x*20+1,p.y*20+1,18,18);});
}
document.getElementById('rst').onclick=init;
window.onkeydown=e=>{
  if(e.key==='ArrowUp'&&dir.y===0){e.preventDefault();dir={x:0,y:-1};}
  if(e.key==='ArrowDown'&&dir.y===0){e.preventDefault();dir={x:0,y:1};}
  if(e.key==='ArrowLeft'&&dir.x===0){e.preventDefault();dir={x:-1,y:0};}
  if(e.key==='ArrowRight'&&dir.x===0){e.preventDefault();dir={x:1,y:0};}
};
init();
<\/script>
</body>
</html>`;
const REFLEKS_MATRISI_HTML = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Refleks Hız Testi — Tech Games</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#090d16;color:#f1f5f9;font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:14px;gap:12px}
  .hud{width:100%;max-width:520px;display:flex;justify-content:space-between;background:#0f1623;border:1px solid #1e293b;border-radius:10px;padding:10px 14px;font-size:13px;font-weight:700}
  .hud b{color:#38bdf8}
  .arena{position:relative;width:100%;max-width:520px;height:320px;background:#05080f;border:1px solid #1e293b;border-radius:12px;overflow:hidden}
  .dot{position:absolute;width:46px;height:46px;border-radius:999px;background:#10b981;border:2px solid #a7f3d0;cursor:pointer;transform:translate(-50%,-50%)}
  .btn{background:#38bdf8;color:#082f49;border:0;border-radius:8px;padding:10px 20px;font-size:13px;font-weight:700;cursor:pointer}
</style>
</head>
<body>
<div class="hud"><span>İsabet: <b id="hits">0</b></span><span>Ort. Hız: <b id="avg">-</b> ms</span><span>Süre: <b id="tm">25</b>s</span></div>
<div id="arena" class="arena"></div>
<button id="start" class="btn" type="button">25 Saniyelik Testi Başlat</button>
<script>
const arena=document.getElementById('arena'),hitsEl=document.getElementById('hits'),avgEl=document.getElementById('avg'),tmEl=document.getElementById('tm'),startBtn=document.getElementById('start');
let hits=0,times=[],left=25,spawnAt=0,timer=null;
function spawn(){
  arena.innerHTML='';
  if(left<=0)return;
  const dot=document.createElement('button');
  dot.className='dot';
  dot.style.left=(12+Math.random()*76)+'%';
  dot.style.top=(15+Math.random()*70)+'%';
  spawnAt=performance.now();
  dot.onclick=()=>{
    times.push(Math.round(performance.now()-spawnAt));
    hits++;hitsEl.textContent=hits;
    const avg=Math.round(times.reduce((a,b)=>a+b,0)/times.length);
    avgEl.textContent=avg;
    spawn();
  };
  arena.appendChild(dot);
}
startBtn.onclick=()=>{
  hits=0;times=[];left=25;hitsEl.textContent='0';avgEl.textContent='-';tmEl.textContent='25';
  if(timer)clearInterval(timer);
  spawn();
  timer=setInterval(()=>{
    left--;tmEl.textContent=Math.max(0,left);
    if(left<=0){clearInterval(timer);arena.innerHTML='<p style="padding:130px 20px;text-align:center;color:#94a3b8">Test Bitti! Toplam İsabet: '+hits+'</p>';}
  },1000);
};
<\/script>
</body>
</html>`;
const SIBER_SAVUNMA_HTML = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Siber Savunma Kalesi — Tech Games</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#090d16;color:#f1f5f9;font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:12px;user-select:none}
  .hud{width:100%;max-width:640px;display:flex;justify-content:space-between;align-items:center;padding:8px 14px;background:#0f1623;border:1px solid #1e293b;border-radius:10px;margin-bottom:10px;font-size:13px;font-weight:600}
  .hud b{color:#38bdf8}
  .wrap{position:relative;width:100%;max-width:640px;aspect-ratio:16/10;border:1px solid #1e293b;border-radius:12px;overflow:hidden;background:#05080f}
  canvas{display:block;width:100%;height:100%;cursor:pointer}
  .ov{position:absolute;inset:0;background:rgba(9,13,22,.86);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:12px;padding:20px}
  .ov.h{display:none}
  button{background:#38bdf8;color:#082f49;border:0;border-radius:8px;padding:10px 22px;font-size:14px;font-weight:700;cursor:pointer}
</style>
</head>
<body>
  <div class="hud">
    <span>Enerji: <b id="en">80</b></span>
    <span>Kule: <b id="tw">0</b></span>
    <span>Kale Canı: <b id="hp">10</b></span>
    <span>Skor: <b id="sc">0</b></span>
  </div>
  <div class="wrap">
    <canvas id="c" width="640" height="400"></canvas>
    <div id="ov" class="ov">
      <h2 id="tt">Siber Savunma Kalesi</h2>
      <p style="font-size:13px;color:#94a3b8;max-width:410px">Kırmızı veri korsanları sağdaki kaleye ulaşmadan önce 3 savunma hattından birine tıklayarak Lazer Kulesi yerleştirin (25 Enerji).</p>
      <button id="go" type="button">Savunmayı Başlat</button>
    </div>
  </div>
<script>
const c=document.getElementById('c'),ctx=c.getContext('2d'),ov=document.getElementById('ov'),tt=document.getElementById('tt');
const lanes=[95,200,305];
let energy=80,hp=10,score=0,towers=[],enemies=[],bolts=[],tick=0,running=false;
function sync(){document.getElementById('en').textContent=energy;document.getElementById('tw').textContent=towers.length;document.getElementById('hp').textContent=hp;document.getElementById('sc').textContent=score;}
function start(){energy=80;hp=10;score=0;towers=[];enemies=[];bolts=[];tick=0;running=true;ov.classList.add('h');sync();}
document.getElementById('go').onclick=start;
c.onclick=e=>{
  if(!running)return;
  const r=c.getBoundingClientRect();
  const x=(e.clientX-r.left)*(640/r.width),y=(e.clientY-r.top)*(400/r.height);
  let best=lanes[0],bd=999;
  lanes.forEach(ly=>{const d=Math.abs(y-ly);if(d<bd){bd=d;best=ly;}});
  if(energy>=25&&x>80&&x<560&&!towers.some(t=>t.y===best&&Math.abs(t.x-x)<34)){
    towers.push({x,y:best,cd:0});energy-=25;sync();
  }
};
function loop(){
  ctx.fillStyle='#05080f';ctx.fillRect(0,0,640,400);
  lanes.forEach(ly=>{ctx.strokeStyle='#1e293b';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,ly);ctx.lineTo(640,ly);ctx.stroke();});
  ctx.fillStyle='#0284c7';ctx.fillRect(610,40,20,320);
  if(running){
    tick++;
    if(tick%75===0)energy+=6;
    if(tick%85===0){
      const ly=lanes[Math.floor(Math.random()*lanes.length)];
      enemies.push({x:-16,y:ly,hp:2+Math.floor(score/120),sp:0.9+Math.min(1.6,score/350)});
    }
    towers.forEach(t=>{
      if(t.cd>0)t.cd--;
      if(t.cd===0&&enemies.some(en=>en.y===t.y&&en.x<t.x+200)){
        bolts.push({x:t.x,y:t.y,vx:-7});t.cd=34;
      }
      ctx.fillStyle='#38bdf8';ctx.beginPath();ctx.arc(t.x,t.y,13,0,Math.PI*2);ctx.fill();
    });
    for(let i=bolts.length-1;i>=0;i--){
      bolts[i].x+=bolts[i].vx;
      ctx.fillStyle='#34d399';ctx.fillRect(bolts[i].x-6,bolts[i].y-3,12,6);
      if(bolts[i].x<-20)bolts.splice(i,1);
    }
    for(let i=enemies.length-1;i>=0;i--){
      const en=enemies[i];en.x+=en.sp;
      ctx.fillStyle='#f43f5e';ctx.beginPath();ctx.arc(en.x,en.y,12,0,Math.PI*2);ctx.fill();
      for(let j=bolts.length-1;j>=0;j--){
        if(Math.abs(bolts[j].y-en.y)<12&&Math.abs(bolts[j].x-en.x)<14){
          bolts.splice(j,1);en.hp--;
          if(en.hp<=0){enemies.splice(i,1);score+=15;energy+=8;sync();break;}
        }
      }
      if(en&&en.x>610){enemies.splice(i,1);hp--;sync();if(hp<=0){running=false;tt.textContent='Kale Düştü · Skor: '+score;ov.classList.remove('h');}}
    }
    if(tick%25===0)sync();
  }
  requestAnimationFrame(loop);
}
loop();
<\/script>
</body>
</html>`;
const BUILTIN_TECH_GAMES = [
  {
    id: "builtin-yorunge-savunmasi",
    title: "Yörünge Savunması",
    description: "Asteroit dalgalarına karşı yörünge geminizi yönlendirin ve plazma atışlarıyla sektörleri koruyun.",
    genre: "Uzay",
    controlsHint: "W/A/S/D veya Ok Tuşları · Boşluk / Tıkla Ateş",
    codeHtml: YORUNGE_SAVUNMASI_HTML,
    isBuiltIn: true,
    aiGenerated: false,
    authorId: "techgames-studio",
    authorName: "Tech Games Stüdyo",
    downloads: 0,
    createdAt: 174e10
  },
  {
    id: "builtin-neon-blok-kirici",
    title: "Neon Blok Kırıcı",
    description: "Hızlı top fiziği, çok katmanlı enerji blokları ve anlık raket kontrolüyle klasik arcade deneyimi.",
    genre: "Arcade",
    controlsHint: "Fare veya Sol/Sağ Ok Tuşları",
    codeHtml: NEON_BLOK_KIRICI_HTML,
    isBuiltIn: true,
    aiGenerated: false,
    authorId: "techgames-studio",
    authorName: "Tech Games Stüdyo",
    downloads: 0,
    createdAt: 1740000001e3
  },
  {
    id: "builtin-reaktor-2048",
    title: "2048 Reaktör Matrisi",
    description: "Sayısal enerji hücrelerini birleştirerek 2048 çekirdek seviyesine ulaşmaya çalışan taktiksel bulmaca.",
    genre: "Bulmaca",
    controlsHint: "Ok Tuşları veya Yön Butonları",
    codeHtml: REAKTOR_2048_HTML,
    isBuiltIn: true,
    aiGenerated: false,
    authorId: "techgames-studio",
    authorName: "Tech Games Stüdyo",
    downloads: 0,
    createdAt: 1740000002e3
  },
  {
    id: "builtin-siber-yilan",
    title: "Siber Yılan Arena",
    description: "Kenar geçişli arena kuralları ve hızlanan veri düğümleriyle klasik yılan mücadelesi.",
    genre: "Arcade",
    controlsHint: "Ok Tuşları ile Yönlendirme",
    codeHtml: SIBER_YILAN_HTML,
    isBuiltIn: true,
    aiGenerated: false,
    authorId: "techgames-studio",
    authorName: "Tech Games Stüdyo",
    downloads: 0,
    createdAt: 1740000003e3
  },
  {
    id: "builtin-refleks-matrisi",
    title: "Refleks Hız Testi",
    description: "25 saniye içinde beliren hedefleri milisaniye hassasiyetinde yakalayarak tepki hızınızı ölçün.",
    genre: "Refleks",
    controlsHint: "Fare veya Dokunmatik Hedefleme",
    codeHtml: REFLEKS_MATRISI_HTML,
    isBuiltIn: true,
    aiGenerated: false,
    authorId: "techgames-studio",
    authorName: "Tech Games Stüdyo",
    downloads: 0,
    createdAt: 1740000004e3
  },
  {
    id: "builtin-siber-savunma-kalesi",
    title: "Siber Savunma Kalesi",
    description: "Üç savunma hattına lazer kuleleri yerleştirin, enerjinizi yönetin ve veri korsanlarını durdurun.",
    genre: "Strateji",
    controlsHint: "Hat Üzerine Tıkla ve Kule Kur",
    codeHtml: SIBER_SAVUNMA_HTML,
    isBuiltIn: true,
    aiGenerated: false,
    authorId: "techgames-studio",
    authorName: "Tech Games Stüdyo",
    downloads: 0,
    createdAt: 1740000005e3
  }
];
export {
  BUILTIN_TECH_GAMES
};
