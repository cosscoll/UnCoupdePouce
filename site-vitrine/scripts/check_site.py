from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import json, re, gzip, xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1];DIST=ROOT/'dist'; errors=[];results=[]
class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True);self.nodes=[];self.ids=[];self.h1=0;self.lang=None;self.text=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs);self.nodes.append((tag,a))
        if 'id' in a:self.ids.append(a['id'])
        if tag=='h1':self.h1+=1
        if tag=='html':self.lang=a.get('lang')
    def handle_data(self,data):self.text.append(data)
pages={}
for f in DIST.rglob('*.html'):
    p=Page();p.feed(f.read_text());pages[f.resolve()]=p
for f,p in pages.items():
    label=str(f.relative_to(DIST));checks=0
    def check(ok,msg):
        global checks
        checks+=1
        if not ok:errors.append(f'{label}: {msg}')
    check(p.h1==1,'un seul H1 requis');check(p.lang in ['fr','en'],'langue manquante');check(len(p.ids)==len(set(p.ids)),'identifiants en double')
    check(any(t=='title' for t,a in p.nodes),'title absent')
    check(any(t=='meta' and a.get('name')=='description' and len(a.get('content',''))>45 for t,a in p.nodes),'description absente')
    check(any(t=='meta' and a.get('name')=='viewport' for t,a in p.nodes),'viewport absent')
    check(any(t=='meta' and a.get('name')=='robots' and 'noindex' in a.get('content','') for t,a in p.nodes),'protection indexation absente')
    check(any(t=='main' for t,a in p.nodes),'main absent')
    for tag,a in p.nodes:
        if tag=='img':check('alt' in a,'image sans alt');check('width' in a and 'height' in a,'dimensions image manquantes')
        if tag=='button':check(a.get('type') in ['button','submit'],'type de bouton absent')
        if tag=='label':check(a.get('for') in p.ids,'label sans contrôle')
        for attr in ['aria-controls','aria-labelledby']:
            if attr in a:
                for target in a[attr].split():check(target in p.ids,f'{attr} cible absente {target}')
        for attr in ['href','src']:
            u=a.get(attr)
            if not u:continue
            parts=urlsplit(u)
            if parts.scheme or parts.netloc:continue
            dest=((f.parent/unquote(parts.path)) if parts.path else f).resolve()
            if dest.is_dir():dest=dest/'index.html'
            check(dest.is_relative_to(DIST.resolve()),f'chemin hors dist {u}')
            check(dest.is_file(),f'ressource absente {u}')
            if parts.fragment and dest in pages:check(unquote(parts.fragment) in pages[dest].ids,f'ancre absente {u}')
    results.append({'page':label,'checks':checks,'h1':p.h1,'lang':p.lang})
if not (DIST/'assets/social.png').is_file():errors.append('Image Open Graph absente')
css=(DIST/'assets/style.css').read_text()
for ref in re.findall(r'url\([\"\']?([^\)\"\']+)',css):
    if not (DIST/'assets'/ref).is_file():errors.append('CSS ressource absente : '+ref)
for p in (DIST/'assets').glob('*.svg'):
    try:ET.parse(p)
    except ET.ParseError as e:errors.append(str(e))
for p in (DIST/'assets').glob('*.js'):
    text=p.read_text()
    for forbidden in ['innerHTML','eval(','new Function(','localStorage','sessionStorage','fetch(','XMLHttpRequest','sendBeacon']:
        if forbidden in text:errors.append(p.name+' utilise '+forbidden)
def luminance(c):
    v=[int(c[i:i+2],16)/255 for i in [1,3,5]]
    v=[x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in v]
    return .2126*v[0]+.7152*v[1]+.0722*v[2]
contrasts=[]
for fg,bg in [('#171a2a','#f5f0ea'),('#555867','#f5f0ea'),('#505dc1','#f5f0ea'),('#171a2a','#ff791d'),('#ffffff','#505dc1'),('#555867','#f0eff8'),('#b5bdfb','#171a2a'),('#d2d3df','#171a2a')]:
    l1,l2=sorted([luminance(fg),luminance(bg)],reverse=True);ratio=(l1+.05)/(l2+.05)
    contrasts.append({'foreground':fg,'background':bg,'ratio':round(ratio,2)})
    if ratio<4.5:errors.append(f'Contraste insuffisant {fg}/{bg}: {ratio:.2f}')
files=[{'file':str(p.relative_to(DIST)),'bytes':p.stat().st_size,'gzip_bytes':len(gzip.compress(p.read_bytes(),mtime=0))} for p in DIST.rglob('*') if p.is_file()]
report={'status':'PASS' if not errors else 'FAIL','pages':results,'contrasts':contrasts,'assets':files,'errors':errors,'limitations':['Pas de navigateur de test disponible : rendu responsive et interactions DOM non vérifiés en navigateur.','Aucune mesure Lighthouse, Core Web Vitals terrain, test lecteur d’écran ou audit WCAG exhaustif.','Contrastes mesurés sur les principales paires déclarées, pas un inventaire de styles calculés.']}
(ROOT/'docs/qa-static.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({'status':report['status'],'pages':results,'contrast_pairs':len(contrasts),'total_bytes':sum(x['bytes'] for x in files),'errors':errors},ensure_ascii=False,indent=2))
raise SystemExit(1 if errors else 0)
