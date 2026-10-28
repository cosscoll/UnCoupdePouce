"""Render the existing vector logo; dev-only dependency: cairosvg. No new artwork."""
from pathlib import Path
from xml.etree import ElementTree as ET
import cairosvg

ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'site-vitrine/dist/assets/logo.svg'
OUTPUT=ROOT/'application/backend/static/icons'
OUTPUT.mkdir(parents=True,exist_ok=True)
NS='http://www.w3.org/2000/svg'
for name,size,height in [('icon-192.png',192,.72),('icon-512.png',512,.72),
                         ('maskable-512.png',512,.54),('apple-180.png',180,.72)]:
    svg=ET.Element('{'+NS+'}svg',{'width':str(size),'height':str(size),'viewBox':f'0 0 {size} {size}'})
    ET.SubElement(svg,'{'+NS+'}rect',{'width':str(size),'height':str(size),'fill':'#ffffff'})
    logo=ET.fromstring(SOURCE.read_bytes())
    h=size*height;w=h*158/176
    logo.attrib.update(x=str((size-w)/2),y=str((size-h)/2),width=str(w),height=str(h))
    svg.append(logo)
    cairosvg.svg2png(bytestring=ET.tostring(svg),write_to=str(OUTPUT/name))
