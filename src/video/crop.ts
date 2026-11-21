import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export interface ContentBox { x:number; y:number; width:number; height:number }
const exec = promisify(execFile);

export function contentBounds(pixels:Uint8Array,width:number,height:number,sourceWidth=width,sourceHeight=height):ContentBox|undefined {
  const frameSize=width*height*3;
  if (width<2 || height<2 || !Number.isInteger(pixels.length/frameSize)) throw new Error('Invalid RGB capture dimensions');
  let left=width,top=height,right=-1,bottom=-1;
  for (let offset=0;offset<pixels.length;offset+=frameSize) {
    const corners=[0,(width-1)*3,(height-1)*width*3,(height*width-1)*3].map(i=>Array.from(pixels.slice(offset+i,offset+i+3)));
    const background=[0,1,2].map(channel=>corners.map(c=>c[channel]).sort((a,b)=>a-b)[1]);
    if (corners.filter(c=>c.every((v,i)=>Math.abs(v-background[i])<28)).length<3) return;
    const bands:{left:number;right:number;top:number;bottom:number;count:number}[]=[];
    for (let y=0;y<height;y++) {
      let band=bands.at(-1);
      for (let x=0;x<width;x++) {
        const i=offset+(y*width+x)*3;
        if ([0,1,2].some(channel=>Math.abs(pixels[i+channel]-background[channel])>36)) {
          if (!band || y-band.bottom>Math.max(3,width*.06)) { band={left:width,right:-1,top:y,bottom:y,count:0};bands.push(band); }
          band.left=Math.min(band.left,x);band.right=Math.max(band.right,x);band.bottom=y;band.count++;
        }
      }
    }
    const largest=Math.max(0,...bands.map(b=>b.count));
    for (const band of bands) {
      const corner=(band.top>height*.8 || band.bottom<height*.1) && (band.left<width*.15 || band.right>width*.85);
      if (corner && band.right-band.left<width*.15 && band.count<largest*.2) continue;
      left=Math.min(left,band.left);right=Math.max(right,band.right);top=Math.min(top,band.top);bottom=Math.max(bottom,band.bottom);
    }
  }
  if (right<left) return;
  const paddingX=Math.max(3,Math.ceil((right-left+1)*.035));
  const paddingY=Math.max(3,Math.ceil((bottom-top+1)*.035));
  const x=Math.max(0,Math.floor((left-paddingX)*sourceWidth/width/2)*2);
  const y=Math.max(0,Math.floor((top-paddingY)*sourceHeight/height/2)*2);
  const endX=Math.min(Math.floor(sourceWidth/2)*2,Math.ceil((right+paddingX+1)*sourceWidth/width/2)*2);
  const endY=Math.min(Math.floor(sourceHeight/2)*2,Math.ceil((bottom+paddingY+1)*sourceHeight/height/2)*2);
  if ((endX-x)*(endY-y)>sourceWidth*sourceHeight*.94) return;
  return {x,y,width:endX-x,height:endY-y};
}

export async function detectContent(path:string,width:number,height:number) {
  const sampleWidth=Math.min(480,width),sampleHeight=Math.max(2,Math.round(height*sampleWidth/width));
  const video=/\.(mp4|webm)$/i.test(path);
  const {stdout}=await exec('ffmpeg',['-v','error','-threads','1','-i',path,'-vf',`${video?'fps=1,':''}scale=${sampleWidth}:${sampleHeight}`,'-frames:v',video?'4':'1','-pix_fmt','rgb24','-threads','1','-f','rawvideo','pipe:1'],{encoding:'buffer',maxBuffer:32*1024*1024,timeout:30000});
  return contentBounds(stdout,sampleWidth,sampleHeight,width,height);
}
