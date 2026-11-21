import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launchDir } from '../core/launch-dir.js';

export interface Branding { name: string; tagline: string; homepage: string }
export interface Frame { x:number; y:number; width:number; height:number; radius:number; kind:'browser'|'phone'|'terminal'; detail?:{x:number;y:number;width:number;height:number;fraction:number} }
export async function branding(cwd: string): Promise<Branding> {
  let product: Record<string, unknown> = {};
  let pkg: Record<string, unknown> = {};
  try { product = JSON.parse(await readFile(launchDir(cwd).product,'utf8')); } catch { /* Product metadata is optional. */ }
  try { pkg = JSON.parse(await readFile(join(cwd,'package.json'),'utf8')); } catch { /* Not every product is a Node project. */ }
  return {name:String(product.name ?? 'Product'),tagline:String(product.description ?? product.oneLiner ?? ''),homepage:String(product.homepage ?? product.url ?? pkg.homepage ?? '').replace(/^https?:\/\//,'').replace(/\/$/,'')};
}
const xml = (s: string) => s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function wrapText(text: string, limit: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  for (const word of words) {
    for (let i=0; i<word.length; i+=limit) {
      const part = word.slice(i,i+limit);
      if (lines.length && `${lines.at(-1)} ${part}`.length <= limit) lines[lines.length-1] += ` ${part}`;
      else lines.push(part);
    }
  }
  return lines;
}
function text(lines: string[], x:number, y:number, size:number, color='#f5f7ff', weight=700) {
  return `<text x="${x}" y="${y}" text-anchor="middle" fill="${color}" font-family="DejaVu Sans, sans-serif" font-size="${size}" font-weight="${weight}">${lines.map((line,i)=>`<tspan x="${x}" dy="${i ? size*1.22 : 0}">${xml(line)}</tspan>`).join('')}</text>`;
}
function svg(width:number,height:number,body:string) { return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`; }
function backdrop(width:number,height:number) {
  return `<defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#111b39"/><stop offset=".55" stop-color="#26335d"/><stop offset="1" stop-color="#405a70"/></linearGradient><radialGradient id="glow"><stop stop-color="#7e9bb9" stop-opacity=".27"/><stop offset="1" stop-color="#7e9bb9" stop-opacity="0"/></radialGradient></defs><rect width="${width}" height="${height}" fill="url(#bg)"/><ellipse cx="${width*.85}" cy="${height*.18}" rx="${width*.7}" ry="${height*.8}" fill="url(#glow)"/><path d="M0 ${height*.82} Q ${width*.5} ${height*.6} ${width} ${height*.88}" fill="none" stroke="#d0e0ff" stroke-opacity=".07" stroke-width="1"/>`;
}
export function frameLayout(width:number,height:number,sourceWidth:number,sourceHeight:number,terminal=false): Frame {
  const vertical = height > width;
  const phone = sourceHeight/sourceWidth > 1.5;
  if (phone && !vertical) {
    const h=Math.round(height*(width>height?.76:.62)/2)*2,w=Math.round(h*sourceWidth/sourceHeight/2)*2;
    const detailWidth=Math.round(width*.43/2)*2;
    const detailHeight=Math.round(Math.min(height*.55,detailWidth*.77)/2)*2;
    return {x:Math.round(width*.77-w/2),y:Math.round(height*.12),width:w,height:h,radius:24,kind:'phone',detail:{x:Math.round(width*.08),y:Math.round(height*.19),width:detailWidth,height:detailHeight,fraction:detailHeight/detailWidth*sourceWidth/sourceHeight}};
  }
  const availableWidth = width * (phone ? .68 : .87);
  const availableHeight = height * (vertical ? .49 : .57);
  const scale = Math.min(availableWidth/sourceWidth,availableHeight/sourceHeight);
  const w = Math.round(sourceWidth*scale/2)*2;
  const h = Math.round(sourceHeight*scale/2)*2;
  const top = vertical ? height*.18 : height*.14;
  return {x:Math.round((width-w)/2),y:Math.round(top+(availableHeight-h)/2),width:w,height:h,radius:phone?24:8,kind:phone?'phone':terminal?'terminal':'browser'};
}
export async function sceneAssets(dir:string,key:string,width:number,height:number,frame:Frame,brand:Branding,caption:string,index:number,count:number) {
  const vertical=height>width;
  const header=vertical?height*.075:height*.06;
  const chrome=frame.kind==='browser'?32:frame.kind==='phone'?14:0;
  const border=frame.kind==='phone'?12:2;
  const x=frame.x-border,y=frame.y-chrome-border,w=frame.width+border*2,h=frame.height+chrome+border*2;
  const shell=`${[24,15,7].map((offset,i)=>`<rect x="${x}" y="${y+offset}" width="${w}" height="${h}" rx="${frame.radius+border}" fill="#030919" opacity="${.08+i*.04}"/>`).join('')}<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${frame.radius+border}" fill="${frame.kind==='phone'?'#0b1224':'#e9edf6'}"/>${frame.kind==='browser'?`<circle cx="${x+17}" cy="${y+17}" r="4" fill="#f08086"/><circle cx="${x+32}" cy="${y+17}" r="4" fill="#e8c278"/><circle cx="${x+47}" cy="${y+17}" r="4" fill="#6fc7b1"/>${text([brand.homepage||brand.name],x+w/2,y+21,11,'#516078',400)}`:''}`;
  const detail=frame.detail;
  const detailShell=detail?`<rect x="${detail.x-3}" y="${detail.y+10}" width="${detail.width+6}" height="${detail.height+6}" rx="12" fill="#030919" opacity=".3"/><rect x="${detail.x-3}" y="${detail.y-3}" width="${detail.width+6}" height="${detail.height+6}" rx="12" fill="#a8bfd3"/>`:'';
  const plate=svg(width,height,`${backdrop(width,height)}${text([brand.name.toUpperCase()],width/2,header,Math.round(width*.018)+8,'#d5e0f4',700)}${shell}${detailShell}${text([`${String(index+1).padStart(2,'0')}  /  ${String(count).padStart(2,'0')}`],width/2,height*.96,14,'#aabedc',400)}`);
  const size=Math.round(height*.055);
  const captionWidth=detail && width>height?width*.49:width*.84;
  const lines=wrapText(caption,Math.max(12,Math.floor(captionWidth/(size*.62))));
  const fitSize=Math.min(size,Math.floor(height*(vertical?.20:.16)/(Math.max(1,lines.length)*1.22)));
  const captionSvg=svg(width,height,`${text(lines,detail && width>height?detail.x+detail.width/2:width/2,height*(vertical?.735:.81),fitSize)}`);
  const platePath=join(dir,`${key}-plate.svg`),captionPath=join(dir,`${key}-caption.svg`);
  await writeFile(platePath,plate); await writeFile(captionPath,captionSvg);
  return {platePath,captionPath};
}
export async function endAsset(dir:string,key:string,width:number,height:number,brand:Branding,logo?:string) {
  const vertical=height>width;
  const badge=Math.round(Math.min(width,height)*.17);
  const badgeY=height*(vertical?.25:.19);
  const initials=brand.name.split(/\s+/).map(w=>w[0]).join('').slice(0,2).toUpperCase();
  const logoImage=logo ? `<image x="${(width-badge)/2}" y="${badgeY}" width="${badge}" height="${badge}" xlink:href="data:image/${logo.endsWith('.svg')?'svg+xml':logo.split('.').pop()};base64,${(await readFile(logo)).toString('base64')}"/>` : `<rect x="${(width-badge)/2}" y="${badgeY}" width="${badge}" height="${badge}" rx="${badge*.26}" fill="#b9d5df"/>${text([initials],width/2,badgeY+badge*.66,badge*.44,'#182744')}`;
  const nameSize=Math.min(height*.085,width*.8/Math.max(1,brand.name.length*.64));
  const titleY=height*(vertical?.49:.53);
  const tagSize=Math.round(Math.min(width,height)*.035);
  const tagline=wrapText(brand.tagline,Math.floor(width*.77/(tagSize*.58)));
  const path=join(dir,`${key}-end.svg`);
  await writeFile(path,svg(width,height,`${backdrop(width,height)}${logoImage}${text([brand.name],width/2,titleY,nameSize)}${text(tagline,width/2,titleY+height*.075,tagSize,'#c5d4e9',400)}${brand.homepage?`<rect x="${width*.25}" y="${height*.83}" width="${width*.5}" height="${height*.063}" rx="${height*.0315}" fill="#dce8fa" fill-opacity=".1"/>${text([brand.homepage],width/2,height*.87,Math.min(24,width*.42/Math.max(1,brand.homepage.length*.6)),'#d9ebff',400)}`:''}`));
  return path;
}
