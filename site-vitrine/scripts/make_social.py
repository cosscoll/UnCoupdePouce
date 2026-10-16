from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
import xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1];A=ROOT/'dist/assets'
def text_paths(text,x,y,size,font,color):
 f=TTFont(A/'fonts'/font);glyphs=f.getGlyphSet();cmap=f.getBestCmap();scale=size/f['head'].unitsPerEm;parts=[]
 for c in text:
  name=cmap.get(ord(c),'space');pen=SVGPathPen(glyphs);glyphs[name].draw(pen)
  parts.append(f'<path d="{pen.getCommands()}" transform="translate({x:.2f},{y}) scale({scale:.5f},{-scale:.5f})" fill="{color}"/>');x+=f['hmtx'][name][0]*scale
 return ''.join(parts)
def inner_svg(path,x,y,w,h):
 root=ET.fromstring(path.read_text());root.set('x',str(x));root.set('y',str(y));root.set('width',str(w));root.set('height',str(h));return ET.tostring(root,encoding='unicode')
s='<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#F5F0EA"/><rect x="661" y="50" width="510" height="530" rx="230" fill="#E9E8F4"/>'
s+=inner_svg(A/'house.svg',635,40,550,550)
s+=text_paths('UN COUP DE POUCE',65,70,17,'montserrat-700.woff2','#171A2A')
s+=text_paths('LE BON PROJET.',65,225,90,'anton.woff2','#171A2A')
s+=text_paths('LE BON PRO.',65,330,90,'anton.woff2','#171A2A')
s+=text_paths('LE DÉCLIC.',65,435,90,'anton.woff2','#505DC1')
s+=text_paths('Sans commission sur les travaux.',65,505,21,'montserrat-600.woff2','#171A2A')
s+=text_paths('PROJET FRANÇAIS EN PRÉPARATION',65,582,13,'montserrat-400.woff2','#555867')
s+='</svg>';(A/'social.svg').write_text(s)
