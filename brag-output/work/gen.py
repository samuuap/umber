# Genera composition-long/index.html: el vídeo largo de Umber (92 s).
# Frases de la música (110 BPM, 8 compases = 17,45 s): 8.74 · 26.19 · 43.65 · 61.10 · 78.56
import json, pathlib, html

ROOT = pathlib.Path(__file__).resolve().parent.parent
data = json.loads((ROOT / "work/data.json").read_text(encoding="utf-8"))
data2 = json.loads((ROOT / "work/data2.json").read_text(encoding="utf-8"))

LEAF = '<svg viewBox="0 0 24 24" fill="none"><path d="M5 19c0-9 6-14 15-14 0 9-5 15-14 15m-1-1 8-8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
CURSOR = '<svg viewBox="0 0 24 24"><path d="M4 2l15 11-6.5 1.2L16 21l-3 1.4-3.4-6.9L4 20z" fill="#16130f" stroke="#f3eee5" stroke-width="1.4" stroke-linejoin="round"/></svg>'
e = html.escape

# Muro de carteles de la apertura y rejilla del explorador: los más conocidos del corpus
wall = "".join(f'<img src="assets/img/grid-{i}.jpg" alt="" />' for i in range(1, 19))
grid_items = data["popular"][:12]
grid = "".join(
    f'<li class="pc" id="g{i}"><div class="pc-img"><img src="assets/img/grid-{i}.jpg" alt="" /></div>'
    f'<p class="pc-t">{e(it["title"])}</p><p class="pc-m">{it["year"]} · Película</p></li>'
    for i, it in enumerate(grid_items, 1)
)
similar = "".join(
    f'<li class="pc" id="sm{i}"><div class="pc-img"><img src="assets/img/sim-{i}.jpg" alt="" /></div>'
    f'<p class="pc-t">{e(it["title"])}</p><p class="pc-m">{it["year"]} · Película</p></li>'
    for i, it in enumerate(data2["Cadena perpetua"]["similar"], 1)
)

# El título del día: «El lobo de Wall Street», con L, O, S y T
TITLE = "EL LOBO DE WALL STREET"
PICK = "LOST"
tiles, k = [], 0
for word in TITLE.split(" "):
    cells = []
    for ch in word:
        k += 1
        cls = "tile rev" if ch in PICK else "tile"
        cells.append(f'<span class="{cls}" id="tile{k}"><b>{ch}</b></span>')
    tiles.append(f'<span class="tword">{"".join(cells)}</span>')
board = "".join(tiles)
NTILES = k
hidden_ids = [i + 1 for i, ch in enumerate(TITLE.replace(" ", "")) if ch not in PICK]
reveal_ids = [i + 1 for i, ch in enumerate(TITLE.replace(" ", "")) if ch in PICK]
ROWS = ["QWERTYUIOP", "ASDFGHJKLÑ", "ZXCVBNM"]
keyboard = "".join(
    '<div class="krow">' + "".join(f'<span class="key" id="key-{c}">{c}</span>' for c in row) + "</div>" for row in ROWS
)

# Sonido: teclas repartidas por cada tramo que se escribe
KEYS = ["001", "005", "009", "013", "017", "021", "025", "029", "002", "006", "010", "014"]
audio, track = [], 11
def sfx(t, file, vol, dur=0.5):
    global track
    audio.append(f'<audio id="a{track}" data-start="{t:.2f}" data-duration="{dur}" data-track-index="{track}" data-volume="{vol}" src="assets/sfx/{file}"></audio>')
    track += 1
def typing(start, dur, n):
    for i in range(n):
        sfx(start + dur * i / n, f"keypress-{KEYS[(i * 5 + int(start * 3)) % len(KEYS)]}.wav", 0.2 if i % 2 else 0.25, 0.3)

typing(9.75, 2.1, 8)       # el cuadro de la portada
sfx(12.55, "click_003.ogg", 0.55)
sfx(20.2, "drop_001.ogg", 0.45)
typing(26.3, 0.5, 3)       # «¿Y otra?»
sfx(28.4, "drop_001.ogg", 0.4)
sfx(35.47, "card-slide-1.ogg", 0.35)
sfx(40.38, "click_003.ogg", 0.5)
sfx(41.0, "impactSoft_medium_001.ogg", 0.4)
typing(62.2, 0.75, 4)      # «Seven»
sfx(63.29, "click_003.ogg", 0.5)
typing(65.0, 0.9, 5)       # «El silencio»
sfx(66.56, "click_003.ogg", 0.5)
sfx(66.75, "bong_001.ogg", 0.55)
for i, t in enumerate([71.2, 71.47, 71.74, 72.01]):  # las cuatro letras
    sfx(t, f"keypress-{KEYS[i]}.wav", 0.25, 0.3)
sfx(72.56, "select_008.ogg", 0.4)
typing(74.2, 2.0, 9)       # escribir el título
sfx(76.38, "click_003.ogg", 0.5)
sfx(76.6, "bong_001.ogg", 0.55)
sfx(80.75, "impactSoft_medium_001.ogg", 0.4)
sfx(87.29, "impactBell_heavy_000.ogg", 0.4, 2.5)

shaw = data2["Cadena perpetua"]

page = f"""<!doctype html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=1920, height=1080" />
<title>Umber — el recorrido</title>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
@font-face {{ font-family: "Instrument Serif"; src: url("assets/fonts/instrument.woff2") format("woff2"); font-weight: 400; font-style: normal; }}
@font-face {{ font-family: "Instrument Serif"; src: url("assets/fonts/instrument-italic.woff2") format("woff2"); font-weight: 400; font-style: italic; }}
@font-face {{ font-family: "Newsreader"; src: url("assets/fonts/newsreader.woff2") format("woff2"); font-weight: 400; font-style: normal; }}
@font-face {{ font-family: "Archivo"; src: url("assets/fonts/archivo.woff2") format("woff2"); font-weight: 400 700; font-style: normal; }}
@font-face {{ font-family: "Archivo Narrow"; src: url("assets/fonts/archivo-narrow.woff2") format("woff2"); font-weight: 600 700; font-style: normal; }}
:root {{ --base:#f3eee5; --surface:#ebe4d8; --raised:#e2d9ca; --line:#cfc6b8; --rule:#8a8073; --ink:#16130f; --muted:#5e564c; --accent:#b8321c; --night:#14110e; --night-ink:#ede6da; --night-muted:#a39a8d; --night-accent:#e8664c; }}
* {{ box-sizing: border-box; }}
body {{ margin:0; background:var(--base); color:var(--ink); font-family:"Archivo",sans-serif; -webkit-font-smoothing:antialiased; }}
#root {{ position:relative; width:100%; height:100%; overflow:hidden; background:var(--base); }}
.clip {{ position:absolute; inset:0; overflow:hidden; }}
.stage {{ position:absolute; inset:0; }}
.grain {{ position:absolute; inset:0; z-index:60; pointer-events:none; background-image:url("assets/img/grain.svg"); background-size:260px; opacity:.05; }}
.eyebrow {{ font-family:"Archivo Narrow",sans-serif; font-weight:700; text-transform:uppercase; letter-spacing:.16em; font-size:22px; color:var(--muted); margin:0; }}
.red {{ color:var(--accent); }}
.display {{ font-family:"Instrument Serif",serif; font-weight:400; letter-spacing:-.03em; margin:0; }}
.display em, .lead em {{ font-style:italic; }}
.mask {{ display:block; overflow:hidden; padding-bottom:.08em; }}
.mask > span {{ display:block; }}
.lead {{ font-size:32px; line-height:1.5; color:var(--muted); margin:0; }}
.btn {{ white-space:nowrap; display:inline-flex; align-items:center; gap:16px; background:var(--accent); color:var(--base); font-family:"Archivo Narrow",sans-serif; font-weight:700; letter-spacing:.12em; text-transform:uppercase; font-size:22px; padding:20px 30px; }}
.btn2 {{ display:inline-flex; align-items:center; gap:14px; border:2px solid var(--ink); color:var(--ink); font-family:"Archivo Narrow",sans-serif; font-weight:700; letter-spacing:.12em; text-transform:uppercase; font-size:22px; padding:18px 28px; }}
.new {{ border:1px solid var(--rule); color:var(--ink); padding:3px 10px; font-size:15px; letter-spacing:.18em; margin-left:12px; }}
.cursor {{ position:absolute; left:0; top:0; width:40px; height:40px; z-index:55; opacity:0; }}
.field-label {{ font-family:"Archivo Narrow",sans-serif; font-weight:700; text-transform:uppercase; letter-spacing:.14em; font-size:18px; color:var(--muted); margin:0; }}

/* 0 · Apertura */
#s0 .stage {{ display:flex; flex-direction:column; justify-content:center; padding:0 180px; }}
#s0 h1 {{ font-size:256px; line-height:.92; margin-top:44px; }}
#wall {{ position:absolute; left:-60px; right:-60px; top:-120px; display:grid; grid-template-columns:repeat(6,1fr); gap:28px; }}
#wall img {{ width:100%; aspect-ratio:2/3; object-fit:cover; border-radius:3px; display:block; filter:saturate(.85); }}
#wall-veil {{ position:absolute; inset:0; background:rgba(20,17,14,.74); }}
#wall-text {{ position:absolute; inset:0; display:flex; flex-direction:column; justify-content:center; padding:0 180px; color:var(--night-ink); }}
#wall-text .num {{ font-family:"Instrument Serif",serif; font-size:250px; line-height:1; letter-spacing:-.03em; }}
#wall-text .lead {{ color:var(--night-ink); font-size:44px; max-width:1100px; margin-top:20px; font-family:"Newsreader",serif; }}

/* 1 · Chat */
.side {{ position:absolute; left:160px; top:170px; width:280px; }}
.side .act {{ position:absolute; top:0; left:0; width:280px; }}
.side .act .t {{ font-family:"Instrument Serif",serif; font-size:44px; line-height:1.05; letter-spacing:-.02em; margin-top:16px; }}
.side .act .t em {{ font-style:italic; }}
.composer {{ width:1180px; background:var(--surface); border-top:6px solid var(--ink); border-bottom:2px solid var(--rule); }}
.tabs {{ display:flex; align-items:flex-end; gap:34px; padding:30px 40px 0; font-size:26px; }}
.tabs .lbl {{ color:var(--muted); padding-bottom:12px; }}
.tab {{ padding-bottom:12px; border-bottom:4px solid transparent; color:var(--muted); }}
.tab.on {{ color:var(--ink); border-color:var(--accent); }}
.field {{ font-family:"Newsreader",serif; font-size:46px; line-height:1.5; padding:28px 40px 40px; min-height:180px; }}
.caret {{ display:inline-block; width:3px; height:1.05em; background:var(--accent); vertical-align:-.16em; margin-left:4px; }}
.bar {{ display:flex; align-items:center; justify-content:space-between; border-top:1px solid var(--line); padding:22px 40px; }}
.bar p {{ margin:0; color:var(--muted); font-size:22px; }}
#composer-wrap {{ position:absolute; left:600px; top:330px; }}
.script-window {{ position:absolute; top:0; bottom:0; left:600px; width:1180px; overflow:hidden; }}
.script {{ position:absolute; left:0; right:0; top:150px; }}
.msg {{ padding:40px 0; border-top:1px solid var(--line); }}
.msg:first-child {{ border-top:0; }}
.who {{ display:flex; align-items:center; gap:14px; }}
.who svg {{ width:26px; height:26px; color:var(--accent); }}
.say {{ font-family:"Newsreader",serif; font-size:44px; line-height:1.5; margin:16px 0 0; }}
.say strong {{ color:var(--accent); font-weight:400; font-family:"Instrument Serif",serif; font-size:1.12em; }}
.thinkwrap {{ position:relative; }}
.thinking {{ color:var(--muted); font-style:italic; position:absolute; top:0; left:0; }}
.card {{ display:grid; grid-template-columns:220px 1fr; gap:40px; border:1px solid var(--line); background:rgba(235,228,216,.7); padding:32px; margin-top:36px; }}
.card img {{ width:220px; height:330px; object-fit:cover; border-radius:3px; display:block; }}
.card h3 {{ font-family:"Instrument Serif",serif; font-weight:400; font-size:68px; line-height:1; letter-spacing:-.02em; margin:14px 0 0; }}
.card h3 span {{ font-family:"Archivo",sans-serif; font-size:26px; letter-spacing:0; color:var(--muted); margin-left:14px; }}
.card .meta {{ color:var(--muted); font-size:24px; margin:14px 0 0; }}
.card .gen {{ color:var(--muted); font-size:21px; margin:4px 0 0; }}
.card .where {{ border-top:1px solid var(--line); margin-top:26px; padding-top:20px; }}
.plat {{ display:flex; font-size:26px; padding:0; margin:10px 0 0; }}
.plat li {{ list-style:none; }}
.plat li + li::before {{ content:"·"; color:var(--accent); margin:0 18px; }}

/* 2 · Explorar */
.page {{ position:absolute; left:0; right:0; top:0; padding:0 160px; }}
.ex-head {{ display:flex; justify-content:space-between; align-items:flex-end; padding-top:110px; padding-bottom:56px; }}
.ex-head h2 {{ font-size:220px; line-height:.9; margin-top:30px; }}
.ex-head .lead {{ max-width:620px; font-size:28px; padding-bottom:20px; }}
.ex-head .lead u {{ color:var(--ink); text-decoration-color:var(--accent); text-underline-offset:6px; }}
.ex-bar {{ display:flex; justify-content:space-between; align-items:flex-end; border-top:1px solid var(--line); border-bottom:1px solid var(--line); padding:26px 0; }}
.ex-tabs {{ display:flex; gap:34px; font-size:26px; }}
.ex-tabs span {{ padding-bottom:10px; border-bottom:4px solid transparent; color:var(--muted); }}
.ex-tabs span.on {{ color:var(--ink); border-color:var(--accent); }}
.ex-form {{ display:flex; gap:36px; align-items:flex-end; }}
.ex-form .f {{ display:flex; flex-direction:column; gap:8px; }}
.ex-form .in {{ border-bottom:2px solid var(--rule); font-size:24px; padding:8px 0; width:340px; color:var(--muted); }}
.ex-form .sel {{ width:220px; }}
.ex-count {{ margin:30px 0 0; font-size:22px; color:var(--muted); }}
.ex-count b {{ color:var(--ink); font-weight:400; }}
.pgrid {{ list-style:none; padding:0; margin:30px 0 0; display:grid; grid-template-columns:repeat(6,1fr); gap:50px 34px; }}
.pc-img {{ aspect-ratio:2/3; overflow:hidden; border-radius:3px; box-shadow:0 0 0 1px rgba(22,19,15,.1); background:var(--surface); }}
.pc-img img {{ width:100%; height:100%; object-fit:cover; display:block; filter:saturate(.9); }}
.pc-t {{ font-family:"Newsreader",serif; font-size:24px; line-height:1.3; margin:16px 0 0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }}
.pc-m {{ font-size:17px; color:var(--muted); margin:4px 0 0; }}
#detail .bd {{ position:absolute; left:0; right:0; top:0; height:760px; overflow:hidden; }}
#detail .bd img {{ width:100%; height:100%; object-fit:cover; object-position:top; opacity:.5; filter:sepia(.18) saturate(.8) contrast(1.02); }}
#detail .bd .f1 {{ position:absolute; inset:0; background:linear-gradient(to top, var(--base), rgba(243,238,229,.7) 50%, rgba(243,238,229,.2)); }}
#detail .bd .f2 {{ position:absolute; inset:0; background:linear-gradient(to right, rgba(243,238,229,.85), transparent 60%); }}
.dt {{ display:grid; grid-template-columns:380px 1fr; gap:110px; padding-top:150px; }}
.dt-poster {{ width:380px; height:570px; border-radius:3px; overflow:hidden; box-shadow:0 0 0 8px var(--base); }}
.dt-poster img {{ width:100%; height:100%; object-fit:cover; display:block; }}
.dt h2 {{ font-size:124px; line-height:.98; letter-spacing:-.035em; margin:22px 0 0; }}
.dt .other {{ font-family:"Instrument Serif",serif; font-style:italic; font-size:44px; color:var(--muted); margin:10px 0 0; }}
.facts {{ display:flex; gap:70px; border-top:1px solid var(--line); border-bottom:1px solid var(--line); padding:24px 0; margin-top:36px; }}
.facts dd {{ font-family:"Newsreader",serif; font-size:30px; margin:8px 0 0; }}
.facts dt {{ margin:0; }}
.dt .syn {{ font-family:"Newsreader",serif; font-size:31px; line-height:1.6; max-width:1060px; margin:34px 0 0; color:rgba(22,19,15,.9); }}
.chips {{ display:flex; gap:12px; margin-top:26px; }}
.chip {{ border:1px solid var(--rule); padding:8px 18px; font-size:20px; }}
.dt .plat {{ font-family:"Newsreader",serif; font-size:30px; }}
.dt-actions {{ display:flex; gap:18px; margin-top:34px; }}
.more {{ border-top:1px solid var(--line); margin-top:120px; padding-top:70px; }}
.more h3 {{ font-size:110px; line-height:1; margin:20px 0 0; }}

/* 3 · Otoño */
#s3 .stage {{ display:grid; grid-template-columns:minmax(0,1fr) 700px; align-items:center; gap:80px; padding:0 160px; }}
#s3 h2 {{ font-size:176px; line-height:.95; margin-top:36px; }}
#s3 .lead {{ max-width:780px; margin-top:36px; }}
.acts-row {{ display:flex; align-items:center; gap:40px; margin-top:50px; }}
.link-quiet {{ font-size:24px; color:var(--muted); white-space:nowrap; }}
.stair {{ position:relative; height:820px; }}
.stair img {{ position:absolute; width:300px; aspect-ratio:2/3; object-fit:cover; border-radius:3px; box-shadow:0 0 0 7px var(--base); filter:sepia(.18) saturate(.85) contrast(1.02); }}
#au1 {{ left:0; top:120px; }} #au2 {{ left:190px; top:20px; z-index:2; width:320px; }} #au3 {{ left:400px; top:200px; }}

/* 4 · Juegos */
.g-head {{ display:flex; justify-content:space-between; align-items:flex-end; padding:100px 160px 40px; border-bottom:1px solid var(--line); margin:0 0 0; }}
.g-head h2 {{ font-size:176px; line-height:.92; margin-top:30px; }}
.g-head .lead {{ max-width:600px; font-size:26px; padding-bottom:14px; }}
.pg {{ display:grid; grid-template-columns:420px 1fr; gap:130px; padding:56px 160px 0 260px; }}
.pframe {{ width:420px; height:630px; position:relative; overflow:hidden; border-radius:3px; box-shadow:0 0 0 7px var(--base), 0 0 0 8px var(--line); background:var(--surface); }}
.pframe img {{ position:absolute; inset:-40px; width:calc(100% + 80px); height:calc(100% + 80px); object-fit:cover; }}
.bars {{ display:flex; gap:10px; margin-top:24px; width:420px; }}
.bars i {{ flex:1; height:6px; background:var(--line); display:block; }}
.guess {{ max-width:860px; }}
.gfield {{ border-bottom:2px solid var(--rule); font-family:"Newsreader",serif; font-size:42px; padding:14px 0; margin-top:14px; min-height:84px; }}
.gfield .ph {{ color:var(--muted); opacity:.7; }}
.opts {{ border:1px solid var(--line); background:var(--surface); margin-top:10px; }}
.opts p {{ margin:0; padding:16px 24px; font-family:"Newsreader",serif; font-size:30px; }}
.opts p span {{ color:var(--muted); font-family:"Archivo",sans-serif; font-size:20px; margin-left:12px; }}
.gl {{ border-top:1px solid var(--line); margin-top:30px; }}
.gl p {{ margin:0; padding:18px 0; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; font-size:26px; }}
.gl .x {{ color:var(--muted); }}
.gl .ok {{ color:var(--accent); }}
.verdict {{ font-family:"Instrument Serif",serif; font-size:72px; line-height:1; color:var(--accent); margin:34px 0 0; }}
.leaf {{ position:absolute; width:44px; height:44px; color:var(--accent); z-index:5; }}
.tg {{ padding:36px 160px 0; display:flex; flex-direction:column; align-items:center; }}
.tg .sub {{ font-size:22px; color:var(--muted); align-self:stretch; display:flex; justify-content:space-between; }}
.board {{ display:flex; flex-wrap:wrap; justify-content:center; gap:22px 40px; margin-top:44px; }}
.tword {{ display:inline-flex; gap:8px; }}
.tile {{ width:80px; height:90px; border:2px solid rgba(138,128,115,.45); border-radius:3px; display:inline-flex; align-items:center; justify-content:center; font-weight:600; font-size:44px; position:relative; }}
.tile b {{ font-weight:600; opacity:0; }}
.picks {{ display:flex; gap:14px; margin-top:16px; justify-content:center; }}
.pick {{ width:70px; height:70px; border:2px dashed rgba(138,128,115,.7); border-radius:3px; display:flex; align-items:center; justify-content:center; font-size:32px; font-weight:600; }}
.kb {{ display:grid; gap:8px; margin-top:22px; width:900px; }}
.krow {{ display:flex; gap:10px; justify-content:center; }}
.key {{ width:72px; height:56px; background:var(--raised); border-radius:4px; display:flex; align-items:center; justify-content:center; font-weight:600; font-size:24px; }}
.tstatus {{ font-size:26px; color:var(--muted); margin-top:16px; min-height:36px; text-align:center; }}

.short .g-head {{ padding-top:64px; padding-bottom:30px; }}
.short .g-head h2 {{ font-size:150px; }}
/* 5 · Cierre */
#night {{ position:absolute; inset:0; background:var(--night); z-index:40; opacity:0; }}
#s5 {{ z-index:45; }}
#s5 .stage {{ color:var(--night-ink); }}
.prog {{ position:absolute; left:160px; right:160px; top:150px; }}
.prog .eyebrow {{ color:var(--night-accent); }}
.prog ol {{ list-style:none; padding:0; margin:36px 0 0; }}
.prog li {{ display:grid; grid-template-columns:110px 1fr auto; align-items:baseline; border-top:1px solid #39322a; padding:22px 0; }}
.prog li:last-child {{ border-bottom:1px solid #39322a; }}
.prog .n {{ font-family:"Archivo Narrow",sans-serif; font-weight:700; color:var(--night-muted); font-size:22px; letter-spacing:.1em; }}
.prog .t {{ font-family:"Instrument Serif",serif; font-size:64px; line-height:1; letter-spacing:-.02em; }}
.prog .d {{ color:var(--night-muted); font-size:24px; }}
#brand {{ position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; }}
.wordmark {{ font-family:"Instrument Serif",serif; font-size:300px; line-height:1; letter-spacing:-.03em; display:flex; align-items:baseline; }}
.dot {{ display:block; width:46px; height:46px; border-radius:50%; background:var(--night-accent); margin-left:18px; }}
#brand .eyebrow {{ color:var(--night-muted); font-size:26px; margin-top:40px; letter-spacing:.3em; }}
#brand .foot {{ color:var(--night-muted); font-size:26px; margin-top:26px; font-family:"Newsreader",serif; }}
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-width="1920" data-height="1080" data-duration="92">

<!-- 0 · Apertura: el titular y el corpus -->
<section id="s0" class="clip" data-start="0" data-duration="4.9" data-track-index="1">
  <div class="stage" id="s0-stage">
    <p class="eyebrow red mask"><span id="s0-eyebrow">Tu cinéfilo de confianza</span></p>
    <h1 class="display"><span class="mask"><span id="s0-l1">¿Qué te apetece</span></span><span class="mask"><span id="s0-l2">ver <em>hoy</em>?</span></span></h1>
  </div>
</section>
<section id="s0b" class="clip" data-start="4.6" data-duration="4.4" data-track-index="2" style="background:#14110e">
  <div class="stage" id="s0b-stage">
    <div id="wall">{wall}</div>
    <div id="wall-veil"></div>
    <div id="wall-text">
      <p class="eyebrow" style="color:#e8664c" id="wt-eye">El catálogo</p>
      <p class="num" id="wt-num">0</p>
      <p class="lead" id="wt-lead">películas y series que conoce Umber, de las más conocidas a las que menos.</p>
    </div>
  </div>
</section>

<!-- 1 · El chat: tres actos y «otra» -->
<section id="s1" class="clip" data-start="8.74" data-duration="26.2" data-track-index="3">
  <div class="stage" id="s1-stage">
    <div class="side">
      <div class="act" id="act1"><p class="eyebrow red">Acto I</p><p class="t">Cuéntale cómo <em>estás</em></p></div>
      <div class="act" id="act2"><p class="eyebrow red">Acto II</p><p class="t">Te pregunta lo <em>justo</em></p></div>
      <div class="act" id="act3"><p class="eyebrow red">Acto III</p><p class="t">Te recomienda <em>una</em></p></div>
      <div class="act" id="act4"><p class="eyebrow red">¿Otra?</p><p class="t">Pídesela, y saca <em>otra</em></p></div>
    </div>
    <div id="composer-wrap">
      <div class="composer">
        <div class="tabs"><span class="lbl">Busco</span><span class="tab on">una película</span><span class="tab">una serie</span></div>
        <div class="field"><span id="typed"></span><span class="caret" id="caret"></span></div>
        <div class="bar"><p>Con una cuenta gratis: dos recomendaciones al día.</p><span class="btn" id="btn">Pedir recomendación <span>→</span></span></div>
      </div>
    </div>
    <div class="script-window" id="sw">
      <div class="script" id="script">
        <div class="msg" id="m1"><p class="eyebrow">Tú</p><p class="say">Hoy no tengo el día y me apetece algo que abrace…</p></div>
        <div class="msg" id="m2"><p class="eyebrow red who">{LEAF}Umber</p>
          <div class="thinkwrap"><p class="say thinking" id="m2-think">Pensando…</p><p class="say" id="m2-say">¿Te apetece algo que te acompañe en el bajón, o algo que te saque de él?</p></div></div>
        <div class="msg" id="m3"><p class="eyebrow">Tú</p><p class="say">Que me saque de él.</p></div>
        <div class="msg" id="m4"><p class="eyebrow red who">{LEAF}Umber</p>
          <p class="say">Te propongo <strong>Intocable</strong>: una amistad improbable que te va a sacar más de una carcajada.</p>
          <article class="card" id="card1"><img src="assets/img/intocable.jpg" alt="" /><div>
            <p class="eyebrow">Película</p><h3>Intocable<span>2011</span></h3>
            <p class="meta">Dirección: Éric Toledano, Olivier Nakache</p><p class="gen">Drama · Comedia</p>
            <div class="where"><p class="eyebrow">Dónde verla</p><ul class="plat"><li>Amazon Prime Video</li><li>Acontra Plus</li></ul></div></div></article></div>
        <div class="msg" id="m5"><p class="eyebrow">Tú</p><p class="say" id="m5-say"><span id="otra"></span></p></div>
        <div class="msg" id="m6"><p class="eyebrow red who">{LEAF}Umber</p>
          <p class="say">Entonces, <strong>Pequeña Miss Sunshine</strong>: una familia de inadaptados, una furgoneta oxidada y tres días de viaje.</p>
          <article class="card" id="card2"><img src="assets/img/sunshine.jpg" alt="" /><div>
            <p class="eyebrow">Película</p><h3>Pequeña Miss Sunshine<span>2006</span></h3>
            <p class="meta">Dirección: Valerie Faris, Jonathan Dayton</p><p class="gen">Comedia · Drama</p>
            <div class="where"><p class="eyebrow">Dónde verla</p><ul class="plat"><li>Disney Plus</li></ul></div></div></article></div>
      </div>
    </div>
  </div>
</section>

<!-- 2 · Explorar, la ficha y «Más como esta» -->
<section id="s2" class="clip" data-start="34.85" data-duration="17.7" data-track-index="4">
  <div class="stage" id="s2-stage">
    <div class="page" id="ex-page">
      <div class="ex-head">
        <div><p class="eyebrow red" id="ex-eye">El catálogo</p><h2 class="display mask"><span id="ex-h">Explorar</span></h2></div>
        <p class="lead" id="ex-lead">Las películas y series que conoce Umber, de las más conocidas a las que menos. Si no sabes qué buscar, <u>pregúntale a él</u>.</p>
      </div>
      <div class="ex-bar" id="ex-bar">
        <div class="ex-tabs"><span class="on">Todo</span><span>Películas</span><span>Series</span></div>
        <div class="ex-form">
          <div class="f"><span class="field-label">Buscar</span><span class="in">Título o director</span></div>
          <div class="f"><span class="field-label">Género</span><span class="in sel">Todos</span></div>
          <div class="f"><span class="field-label">Orden</span><span class="in sel">Más conocidas</span></div>
          <span class="btn2">Buscar</span>
        </div>
      </div>
      <p class="ex-count" id="ex-count"><b>16.035 títulos</b> · página 1 de 446</p>
      <ul class="pgrid">{grid}</ul>
    </div>
    <div id="detail">
      <div class="bd" id="bd"><img src="assets/img/shawshank-bd.jpg" alt="" /><div class="f1"></div><div class="f2"></div></div>
      <div class="page" id="dt-page">
        <div class="dt">
          <div><div class="dt-poster" id="dt-poster"><img src="assets/img/shawshank.jpg" alt="" /></div></div>
          <div id="dt-text">
            <p class="eyebrow red">Película</p>
            <h2 class="display">Cadena perpetua</h2>
            <p class="other">The Shawshank Redemption</p>
            <dl class="facts">
              <div><dt class="field-label">Año</dt><dd>1994</dd></div>
              <div><dt class="field-label">Duración</dt><dd>2 h 23 min</dd></div>
              <div><dt class="field-label">Dirección</dt><dd>Frank Darabont</dd></div>
            </dl>
            <p class="syn">{e(shaw["synopsis"])}</p>
            <div class="chips"><span class="chip">Drama</span><span class="chip">Crimen</span></div>
            <div style="margin-top:34px"><p class="field-label">Dónde verla</p><ul class="plat"><li>Amazon Prime Video</li><li>HBO Max</li><li>Movistar Plus+ Ficción Total</li></ul></div>
            <div class="dt-actions"><span class="btn2">Guardar</span><span class="btn">Pedirle a Umber algo parecido <span>→</span></span></div>
          </div>
        </div>
        <div class="more" id="more">
          <p class="eyebrow red">Si te gusta esta</p>
          <h3 class="display">Más como <em>esta</em></h3>
          <ul class="pgrid">{similar}</ul>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- 3 · La especialidad de otoño -->
<section id="s3" class="clip" data-start="52.3" data-duration="8.9" data-track-index="5">
  <div class="stage" id="s3-stage">
    <div>
      <p class="eyebrow red" id="s3-eye">Especialidad <span class="new">Nuevo</span></p>
      <h2 class="display"><span class="mask"><span id="s3-h">El Umber de <em>otoño</em></span></span></h2>
      <p class="lead" id="s3-lead">Un Umber que solo recomienda cine y series de otoño: luz baja, lluvia, vuelta a las clases, cosechas. Y Halloween, cuando la película va de eso.</p>
      <div class="acts-row" id="s3-acts"><span class="btn">Una película de otoño <span>→</span></span><span class="link-quiet">Una serie de otoño</span><span class="link-quiet">Lo más otoñal del catálogo</span></div>
    </div>
    <div class="stair"><img id="au1" src="assets/img/autumn-3.jpg" alt="" /><img id="au2" src="assets/img/autumn-1.jpg" alt="" /><img id="au3" src="assets/img/autumn-2.jpg" alt="" /></div>
  </div>
</section>

<!-- 4a · El cartel del día (N.º 3, ya jugado) -->
<section id="s4" class="clip" data-start="61.0" data-duration="9.0" data-track-index="6">
  <div class="stage" id="s4-stage">
    <div class="g-head">
      <div><p class="eyebrow red" id="g1-eye">Juegos · N.º 3</p><h2 class="display mask"><span id="g1-h">El cartel <em>del día</em></span></h2></div>
      <p class="lead" id="g1-lead">Un cartel sin título y muy desenfocado. Con cada intento, o si pasas, se ve un poco más. Tienes seis.</p>
    </div>
    <div class="pg">
      <div><div class="pframe" id="pframe"><img id="lambs" src="assets/img/lambs.jpg" alt="" /></div>
        <div class="bars"><i id="pb1"></i><i id="pb2"></i><i></i><i></i><i></i><i></i></div></div>
      <div class="guess">
        <p class="field-label" style="position:relative"><span id="att1">Intento 1 de 6</span><span id="att2" style="position:absolute;left:0;top:0">Intento 2 de 6</span></p>
        <div class="gfield"><span id="gtyped1"></span><span id="gtyped2"></span></div>
        <div class="opts" id="opt1"><p>Seven<span>1995</span></p></div>
        <div class="opts" id="opt2"><p>El silencio de los corderos<span>1991</span></p></div>
        <div class="gl"><p id="gl1"><span>Seven</span><span class="x">✕ No es esta</span></p><p id="gl2"><span>El silencio de los corderos</span><span class="ok">✓ ¡Es esta!</span></p></div>
        <p class="verdict" id="verdict1">¡Acertaste en el segundo!</p>
      </div>
    </div>
    <div id="leaves"></div>
  </div>
</section>

<!-- 4b · El título del día (N.º 4, ya jugado) -->
<section id="s4b" class="clip short" data-start="69.8" data-duration="11.0" data-track-index="7">
  <div class="stage" id="s4b-stage">
    <div class="g-head">
      <div><p class="eyebrow red" id="g2-eye">Juegos · N.º 4</p><h2 class="display mask"><span id="g2-h">El título <em>del día</em></span></h2></div>
      <p class="lead" id="g2-lead">Elige cuatro letras, dos vocales como mucho, y mira dónde salen. Si no sacas el título, cada fallo trae una pista.</p>
    </div>
    <div class="tg">
      <div class="board" id="board">{board}</div>
      <p class="field-label" style="margin-top:30px" id="pick-label">Elige 4 letras, 2 vocales como mucho</p>
      <div class="picks"><span class="pick" id="pk1"><b>L</b></span><span class="pick" id="pk2"><b>O</b></span><span class="pick" id="pk3"><b>S</b></span><span class="pick" id="pk4"><b>T</b></span></div>
      <div class="tstatus" style="position:relative"><span id="ts1">¡Están las cuatro! Ahora, escribe el título.</span><span id="ts2" style="position:absolute;left:0;right:0;top:0;color:#b8321c">¡Con cuatro letras te ha bastado!</span></div>
      <div class="kb" id="kb">{keyboard}</div>
    </div>
  </div>
</section>

<div id="night"></div>

<!-- 5 · El programa y la marca -->
<section id="s5" class="clip" data-start="80.4" data-duration="11.6" data-track-index="8">
  <div class="stage">
    <div class="prog" id="prog">
      <p class="eyebrow">Programa</p>
      <ol>
        <li id="p1"><span class="n">01</span><span class="t">El chat</span><span class="d">Te recomienda una, con el porqué y dónde verla</span></li>
        <li id="p2"><span class="n">02</span><span class="t">Explorar</span><span class="d">16.035 películas y series, y más como cada una</span></li>
        <li id="p3"><span class="n">03</span><span class="t">El Umber de otoño</span><span class="d">Solo cine y series de otoño</span></li>
        <li id="p4"><span class="n">04</span><span class="t">El cartel del día</span><span class="d">Cada vez menos desenfocado</span></li>
        <li id="p5"><span class="n">05</span><span class="t">El título del día</span><span class="d">Cuatro letras y unas pistas</span></li>
      </ol>
    </div>
    <div id="brand">
      <div class="wordmark"><span id="mark-word">Umber</span><span class="dot" id="mark-dot"></span></div>
      <p class="eyebrow" id="tag">Tu cinéfilo de confianza</p>
      <p class="foot" id="foot">Con una cuenta gratis: dos recomendaciones al día.</p>
    </div>
  </div>
</section>

<div class="cursor" id="cursor">{CURSOR}</div>
<div class="grain"></div>

<audio id="music" data-start="0" data-duration="92" data-track-index="10" data-volume="0.32" src="assets/music/bed-long.mp3"></audio>
{chr(10).join(audio)}
</div>

<script>
const HIDDEN = {json.dumps(hidden_ids)};
const REVEAL = {json.dumps(reveal_ids)};
const NTILES = {NTILES};
document.fonts.ready.then(() => {{
  const tl = gsap.timeline({{ paused: true }});
  const E = "expo.out", S = "power3.inOut";
  const typeInto = (id, text, start, dur) => {{
    const p = {{ n: 0 }};
    tl.fromTo(p, {{ n: 0 }}, {{ n: text.length, duration: dur, ease: "none",
      onUpdate: () => {{ document.getElementById(id).textContent = text.slice(0, Math.round(p.n)); }} }}, start);
  }};
  const fadeUp = (sel, t, d = 0.9, y = 30) => tl.fromTo(sel, {{ opacity: 0, y }}, {{ opacity: 1, y: 0, duration: d, ease: E }}, t);
  const maskUp = (sel, t, d = 1.1) => tl.fromTo(sel, {{ yPercent: 105 }}, {{ yPercent: 0, duration: d, ease: E }}, t);
  // Un único cursor: cada tramo lo lleva de un sitio a otro

  // 0 · Apertura
  tl.fromTo("#s0-stage", {{ scale: 1.035 }}, {{ scale: 1, duration: 4.9, ease: "none" }}, 0);
  maskUp("#s0-eyebrow", 0.3, 0.9);
  maskUp("#s0-l1", 0.5); maskUp("#s0-l2", 0.68);
  tl.to("#s0-stage", {{ opacity: 0, duration: 0.4, ease: "power2.in" }}, 4.25);
  // El muro de carteles y la cifra del corpus
  tl.fromTo("#s0b-stage", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.6, ease: "power2.out" }}, 4.62);
  tl.fromTo("#wall", {{ y: 0 }}, {{ y: -260, duration: 4.4, ease: "none" }}, 4.6);
  fadeUp("#wt-eye", 4.9, 0.8, 16);
  const num = {{ v: 0 }};
  tl.fromTo(num, {{ v: 0 }}, {{ v: 16035, duration: 1.6, ease: "power3.out",
    onUpdate: () => {{ document.getElementById("wt-num").textContent = Math.round(num.v).toLocaleString("es-ES").replace(/,/g, "."); }} }}, 5.0);
  fadeUp("#wt-num", 5.0, 0.8, 20);
  fadeUp("#wt-lead", 5.5, 0.9, 20);
  tl.to("#s0b-stage", {{ opacity: 0, duration: 0.45, ease: "power2.in" }}, 8.25);

  // 1 · El chat. beat-locked: 8.74 (frase)
  tl.fromTo("#s1-stage", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.6 }}, 8.8);
  const acts = ["#act1", "#act2", "#act3", "#act4"];
  tl.fromTo("#act1", {{ opacity: 0, x: -24 }}, {{ opacity: 1, x: 0, duration: 0.9, ease: E }}, 8.95);
  [[14.73, 1], [19.66, 2], [26.19, 3]].forEach(([t, i]) => {{
    tl.to(acts[i - 1], {{ opacity: 0, x: 24, duration: 0.4, ease: "power2.in" }}, t - 0.45);
    tl.fromTo(acts[i], {{ opacity: 0, x: -24 }}, {{ opacity: 1, x: 0, duration: 0.9, ease: E }}, t);
  }});
  fadeUp("#composer-wrap", 9.05, 0.9, 40);
  typeInto("typed", "Hoy no tengo el día y me apetece algo que abrace…", 9.75, 2.1);
  tl.to("#caret", {{ opacity: 0, duration: 0.1 }}, 12.0);
  tl.fromTo("#cursor", {{ x: 1700, y: 1000, opacity: 0 }}, {{ x: 1555, y: 752, opacity: 1, duration: 0.8, ease: S, immediateRender: false }}, 11.6);
  tl.to("#btn", {{ scale: 0.97, duration: 0.08 }}, 12.55);
  tl.to("#btn", {{ scale: 1, backgroundColor: "#9a2914", duration: 0.25 }}, 12.63);
  tl.to("#composer-wrap", {{ opacity: 0, y: -30, duration: 0.4, ease: "power2.in" }}, 12.75);
  tl.to("#cursor", {{ opacity: 0, duration: 0.3 }}, 12.75);
  // El guion: cada mensaje en su tiempo; el guion sube para dejar sitio
  fadeUp("#m1", 13.11);
  fadeUp("#m2", 13.64, 0.8);
  tl.fromTo("#m2-think", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.25 }}, 13.7);
  tl.to("#m2-think", {{ opacity: 0.4, duration: 0.25, ease: "sine.inOut" }}, 13.95);
  tl.to("#m2-think", {{ opacity: 1, duration: 0.25, ease: "sine.inOut" }}, 14.2);
  tl.to("#m2-think", {{ opacity: 0, duration: 0.05 }}, 14.68);
  tl.fromTo("#m2-say", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.6 }}, 14.73); // beat-locked: 14.73
  fadeUp("#m3", 17.47, 0.8); // beat-locked: 17.47
  const top = (id) => document.getElementById(id).offsetTop;
  tl.to("#script", {{ y: -top("m3"), duration: 1.3, ease: S }}, 18.7);
  tl.to(["#m1", "#m2"], {{ opacity: 0, duration: 0.6 }}, 18.6);
  fadeUp("#m4", 19.66, 0.8); // beat-locked: 19.66
  fadeUp("#card1", 20.2, 1.0, 40);
  tl.to("#script", {{ y: -top("m5"), duration: 1.3, ease: S }}, 25.65);
  tl.to(["#m3", "#m4"], {{ opacity: 0, duration: 0.6 }}, 25.6);
  fadeUp("#m5", 26.19, 0.6); // beat-locked: 26.19 (frase)
  typeInto("otra", "¿Y otra?", 26.3, 0.5);
  fadeUp("#m6", 27.3, 0.8); // beat-locked: 27.30
  fadeUp("#card2", 27.85, 1.0, 40);
  tl.to("#s1-stage", {{ opacity: 0, duration: 0.45, ease: "power2.in" }}, 34.35);

  // 2 · Explorar
  tl.fromTo("#s2-stage", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.5 }}, 34.9);
  fadeUp("#ex-eye", 34.95, 0.8, 16);
  maskUp("#ex-h", 35.05, 1.1);
  fadeUp("#ex-lead", 35.3, 0.9, 20);
  fadeUp("#ex-bar", 35.47, 0.9, 20);
  fadeUp("#ex-count", 35.8, 0.8, 12);
  tl.to("#ex-page", {{ y: -470, duration: 1.4, ease: S }}, 36.55);
  // beat-grid: los carteles llegan en dos filas, 37.11 y 37.65
  for (let i = 1; i <= 12; i++) fadeUp("#g" + i, (i <= 6 ? 37.11 : 37.65) + ((i - 1) % 6) * 0.06, 0.9, 40);
  // El cursor va a «Cadena perpetua» y la abre
  tl.fromTo("#cursor", {{ x: 1600, y: 1040, opacity: 0 }}, {{ x: 760, y: 820, opacity: 1, duration: 1.1, ease: S, immediateRender: false }}, 39.1);
  tl.to("#g9 .pc-img", {{ y: -10, duration: 0.5, ease: E }}, 39.95);
  tl.to("#g9 .pc-t", {{ color: "#b8321c", duration: 0.3 }}, 39.95);
  tl.to("#cursor", {{ scale: 0.88, duration: 0.08 }}, 40.38);
  tl.to("#cursor", {{ scale: 1, opacity: 0, duration: 0.3 }}, 40.46);
  tl.to("#ex-page", {{ opacity: 0, duration: 0.45, ease: "power2.in" }}, 40.55);
  tl.set("#detail", {{ opacity: 0 }}, 0);
  tl.to("#detail", {{ opacity: 1, duration: 0.6, ease: "power2.out" }}, 41.0);
  tl.fromTo("#bd img", {{ scale: 1.08 }}, {{ scale: 1, duration: 6, ease: "power2.out" }}, 41.0);
  tl.fromTo("#dt-poster", {{ y: 60, scale: 0.94 }}, {{ y: 0, scale: 1, duration: 1.1, ease: E }}, 41.0);
  fadeUp("#dt-text", 41.47, 1.0, 30);
  tl.to("#dt-page", {{ y: -top("more") + 230, duration: 1.6, ease: S }}, 46.37);
  tl.to("#bd", {{ y: -500, duration: 1.6, ease: S }}, 46.37);
  for (let i = 1; i <= 6; i++) fadeUp("#sm" + i, 47.47 + (i - 1) * 0.12, 0.9, 40);
  tl.to("#s2-stage", {{ opacity: 0, duration: 0.45, ease: "power2.in" }}, 51.85);

  // 3 · Otoño
  tl.fromTo("#s3-stage", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.4 }}, 52.37);
  fadeUp("#s3-eye", 52.4, 0.8, 16);
  maskUp("#s3-h", 52.55, 1.1);
  fadeUp("#s3-lead", 53.1, 0.9, 20);
  fadeUp("#s3-acts", 53.6, 0.9, 20);
  [["#au1", 52.9], ["#au2", 53.11], ["#au3", 53.32]].forEach(([s, t]) => fadeUp(s, t, 1.2, 70));
  tl.fromTo(".stair", {{ y: 0 }}, {{ y: -30, duration: 8.5, ease: "none" }}, 52.4);
  tl.to("#s3-stage", {{ opacity: 0, duration: 0.45, ease: "power2.in" }}, 60.6);

  // 4a · El cartel del día. beat-locked: 61.10 (frase)
  tl.fromTo("#s4-stage", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.4 }}, 61.1);
  fadeUp("#g1-eye", 61.1, 0.8, 16);
  maskUp("#g1-h", 61.2, 1.0);
  fadeUp("#g1-lead", 61.45, 0.8, 16);
  tl.set("#lambs", {{ filter: "blur(38px)" }}, 0);
  tl.set(["#opt1", "#opt2", "#gl1", "#gl2", "#verdict1"], {{ opacity: 0 }}, 0);
  tl.set("#pb1", {{ backgroundColor: "#16130f" }}, 61.1);
  typeInto("gtyped1", "Seven", 62.2, 0.75);
  tl.set(["#att2", "#ts1", "#ts2"], {{ opacity: 0 }}, 0);
  tl.to("#opt1", {{ opacity: 1, duration: 0.25 }}, 62.75);
  tl.to("#opt1", {{ opacity: 0, duration: 0.2 }}, 63.29);
  tl.to("#gtyped1", {{ opacity: 0, duration: 0.05 }}, 63.3);
  fadeUp("#gl1", 63.29, 0.6, 12);
  tl.to("#pb1", {{ backgroundColor: "#8a8073", duration: 0.3 }}, 63.29);
  tl.set("#pb2", {{ backgroundColor: "#16130f" }}, 63.4);
  tl.to("#att1", {{ opacity: 0, duration: 0.1 }}, 63.4);
  tl.to("#att2", {{ opacity: 1, duration: 0.1 }}, 63.4);
  tl.to("#lambs", {{ filter: "blur(24px)", duration: 0.8, ease: S }}, 64.38); // beat-locked: 64.38
  typeInto("gtyped2", "El silencio", 65.0, 0.9);
  tl.to("#gtyped2", {{ opacity: 0, duration: 0.1 }}, 66.56);
  tl.to("#opt2", {{ opacity: 1, duration: 0.25 }}, 65.75);
  tl.to("#opt2", {{ opacity: 0, duration: 0.2 }}, 66.56);
  fadeUp("#gl2", 66.56, 0.6, 12); // beat-locked: 66.56
  tl.to("#pb2", {{ backgroundColor: "#b8321c", duration: 0.3 }}, 66.56);
  tl.to("#lambs", {{ filter: "blur(0px)", duration: 1.0, ease: S }}, 66.56);
  tl.fromTo("#pframe", {{ boxShadow: "0 0 0 7px #f3eee5, 0 0 0 8px #cfc6b8" }}, {{ boxShadow: "0 0 0 7px #f3eee5, 0 0 0 10px #b8321c", duration: 0.6, ease: "power2.out" }}, 66.6);
  fadeUp("#verdict1", 67.65, 0.9, 20);
  // Las hojas del acierto, con posiciones fijas
  const leaves = document.getElementById("leaves");
  const seeds = [[-250,-120,-40],[250,-160,30],[-280,40,-80],[290,-20,60],[-150,-200,10],[150,-210,-30],[-300,-60,40],[320,-100,-60]];
  seeds.forEach(([dx, dy, rot], i) => {{
    const el = document.createElement("div"); el.className = "leaf"; el.innerHTML = {json.dumps(LEAF)};
    el.style.left = "450px"; el.style.top = "560px"; el.style.opacity = "0"; leaves.appendChild(el);
    tl.fromTo(el, {{ x: 0, y: 0, rotation: 0, opacity: 0, scale: 0.6 }}, {{ x: dx, y: dy, rotation: rot, opacity: 1, scale: 1, duration: 0.9, ease: "power3.out" }}, 66.7 + i * 0.03);
    tl.to(el, {{ y: dy + 160, opacity: 0, duration: 1.0, ease: "power1.in" }}, 67.7 + i * 0.03);
  }});
  tl.to("#s4-stage", {{ opacity: 0, duration: 0.45, ease: "power2.in" }}, 69.3);

  // 4b · El título del día
  tl.fromTo("#s4b-stage", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.4 }}, 69.83);
  fadeUp("#g2-eye", 69.83, 0.8, 16);
  maskUp("#g2-h", 69.93, 1.0);
  fadeUp("#g2-lead", 70.2, 0.8, 16);
  fadeUp("#board", 70.2, 0.9, 20);
  ["L", "O", "S", "T"].forEach((c, i) => {{
    const t = 71.2 + i * 0.27;
    tl.set("#pk" + (i + 1), {{ borderStyle: "solid", borderColor: "#16130f" }}, t);
    tl.fromTo("#pk" + (i + 1) + " b", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.1 }}, t);
    tl.fromTo("#pk" + (i + 1), {{ scale: 0.85 }}, {{ scale: 1, duration: 0.25, ease: "back.out(2)" }}, t);
    tl.to("#key-" + c, {{ backgroundColor: "#16130f", color: "#f3eee5", duration: 0.15 }}, t);
  }});
  // «Destapar»: las casillas con esas letras se dan la vuelta, una tras otra
  REVEAL.forEach((n, i) => {{
    const t = 72.56 + i * 0.05;
    tl.fromTo("#tile" + n, {{ rotationX: 0 }}, {{ rotationX: 360, duration: 0.55, ease: "power2.out" }}, t);
    tl.to("#tile" + n, {{ backgroundColor: "#e2d9ca", borderColor: "rgba(184,50,28,.45)", color: "#b8321c", duration: 0.2 }}, t + 0.25);
    tl.to("#tile" + n + " b", {{ opacity: 1, duration: 0.2 }}, t + 0.25);
  }});
  ["L", "O", "S", "T"].forEach((c, i) => {{
    tl.to("#pk" + (i + 1), {{ borderColor: "#b8321c", color: "#b8321c", duration: 0.3 }}, 73.2);
    tl.to("#key-" + c, {{ backgroundColor: "#e2d9ca", color: "#b8321c", boxShadow: "inset 0 0 0 2px #b8321c", duration: 0.3 }}, 73.2);
  }});
  fadeUp("#ts1", 73.2, 0.6, 10);
  // Se escribe lo que falta
  HIDDEN.forEach((n, i) => {{
    const t = 74.2 + i * (2.0 / HIDDEN.length);
    tl.to("#tile" + n, {{ borderColor: "rgba(22,19,15,.75)", duration: 0.1 }}, t);
    tl.to("#tile" + n + " b", {{ opacity: 1, duration: 0.08 }}, t);
    tl.fromTo("#tile" + n, {{ scale: 0.9 }}, {{ scale: 1, duration: 0.18, ease: "back.out(2)" }}, t);
  }});
  // beat-locked: 76.38 — acertado: todas en rojo, en cascada
  for (let n = 1; n <= NTILES; n++) {{
    const t = 76.38 + (n - 1) * 0.04;
    tl.to("#tile" + n, {{ backgroundColor: "#b8321c", borderColor: "#b8321c", color: "#f3eee5", duration: 0.3, ease: "power2.out" }}, t);
    tl.fromTo("#tile" + n, {{ y: 0 }}, {{ y: -12, duration: 0.18, ease: "power2.out", yoyo: true, repeat: 1 }}, t);
  }}
  tl.to("#ts1", {{ opacity: 0, duration: 0.2 }}, 77.2);
  fadeUp("#ts2", 77.3, 0.6, 10);
  tl.to("#s4b-stage", {{ opacity: 0, duration: 0.4, ease: "power2.in" }}, 80.0);

  // 5 · Programa y marca. beat-locked: 80.75 y 87.29
  tl.to("#night", {{ opacity: 1, duration: 0.6, ease: S }}, 80.1);
  fadeUp("#prog .eyebrow", 80.75, 0.8, 12);
  ["#p1", "#p2", "#p3", "#p4", "#p5"].forEach((s, i) => fadeUp(s, 81.29 + i * 0.545, 0.9, 24));
  tl.to("#prog", {{ opacity: 0, y: -30, duration: 0.5, ease: "power2.in" }}, 86.6);
  tl.fromTo("#mark-word", {{ opacity: 0, y: 40, scale: 1.04 }}, {{ opacity: 1, y: 0, scale: 1, duration: 1.2, ease: E }}, 87.0);
  tl.fromTo("#mark-dot", {{ scale: 0 }}, {{ scale: 1, duration: 0.7, ease: "back.out(2)" }}, 87.29);
  fadeUp("#tag", 87.65, 0.9, 16);
  fadeUp("#foot", 88.2, 0.9, 16);
  tl.to("#brand", {{ opacity: 0, duration: 1.2, ease: "power2.in" }}, 90.6);

  window.__timelines["main"] = tl;
}});
</script>
</body>
</html>
"""
(ROOT / "composition-long/index.html").write_text(page, encoding="utf-8")
print("ok", len(page), "bytes,", len(audio), "sfx")
