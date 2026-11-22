import React from 'react';
import { AbsoluteFill, Composition, Img, OffthreadVideo, Sequence, interpolate, registerRoot, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

type Layout = {plate:string;caption:string;src:string;bare?:boolean;accent?:string;highlight?:{x:number;y:number;width:number;height:number};frame:{x:number;y:number;width:number;height:number;kind:string;detail?:{x:number;y:number;width:number;height:number;fraction:number}}};
type Scene = {src:string;text:string;duration:number;role?:string;card?:boolean;layouts:Record<string,Layout>};
type Props = {scenes:Scene[];endCards:Record<string,string>;endCardSeconds:number};
const defaults:Props={scenes:[],endCards:{},endCardSeconds:3};
function Shot({scene}:{scene:Scene}) {
  const frame=useCurrentFrame();
  const {fps,width,height}=useVideoConfig();
  const layout=scene.layouts[`${width}x${height}`];
  const src=layout.src;
  const progress=Math.min(1,frame/Math.max(1,scene.duration*fps-1));
  const opacity=interpolate(frame,[0,3,Math.max(4,scene.duration*fps-3),Math.max(5,scene.duration*fps)],[0,1,1,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  const style={position:'absolute' as const,left:layout.bare?'0%':'2%',top:layout.bare?'0%':'2%',width:layout.bare?'100%':'96%',height:layout.bare?'100%':'96%',objectFit:'contain' as const,transform:`scale(${layout.bare?1:1+progress*.015})`,transformOrigin:'50% 0%'};
  return <AbsoluteFill>
    <Img src={staticFile(layout.plate)} style={{width,height}}/>
    {layout.frame.detail && <div style={{position:'absolute',left:layout.frame.detail.x,top:layout.frame.detail.y,width:layout.frame.detail.width,height:layout.frame.detail.height,overflow:'hidden'}}>{/\.(mp4|webm)$/i.test(src)?<OffthreadVideo muted src={staticFile(src)} style={{width:'100%',height:layout.frame.detail.height/layout.frame.detail.fraction}}/>:<Img src={staticFile(src)} style={{width:'100%',height:layout.frame.detail.height/layout.frame.detail.fraction}}/>}</div>}
    {!scene.card && <div style={{position:'absolute',left:layout.frame.x,top:layout.frame.y,width:layout.frame.width,height:layout.frame.height,overflow:'hidden',background:layout.frame.kind==='terminal'?'#111b30':'white'}}>
      {/\.(mp4|webm)$/i.test(src)?<OffthreadVideo muted src={staticFile(src)} style={style}/>:<Img src={staticFile(src)} style={style}/>}
    </div>}
    <Img src={staticFile(layout.caption)} style={{position:'absolute',width,height,opacity:layout.bare?1:opacity}}/>
    {layout.highlight && <div style={{position:'absolute',...{left:layout.highlight.x,top:layout.highlight.y,width:layout.highlight.width,height:layout.highlight.height},border:`4px solid ${layout.accent??'#77e5b3'}`,borderRadius:9,boxShadow:`0 0 20px ${layout.accent??'#77e5b3'}88`,opacity:.55+.45*Math.sin(frame/fps*Math.PI*2)}}/>}
  </AbsoluteFill>;
}
function Video(props:Props) {
  const {width,height}=useVideoConfig();
  let elapsed=0;
  return <AbsoluteFill>{props.scenes.map((scene,i)=>{
    const start=Math.round(elapsed*12);elapsed+=scene.duration;
    return <Sequence key={i} from={start} durationInFrames={Math.round(elapsed*12)-start}><Shot scene={scene}/></Sequence>;
  })}<Sequence from={Math.round(elapsed*12)} durationInFrames={Math.round(props.endCardSeconds*12)}><Img src={staticFile(props.endCards[`${width}x${height}`])} style={{width,height}}/></Sequence></AbsoluteFill>;
}
function Root() {
  return <>{[['Demo',1280,720],['Short',720,1280],['Square',720,720]].map(([id,width,height])=><Composition key={id} id={String(id)} component={Video} width={Number(width)} height={Number(height)} fps={12} durationInFrames={360} defaultProps={defaults} calculateMetadata={({props})=>({durationInFrames:Math.round((props.scenes.reduce((n,s)=>n+s.duration,0)+props.endCardSeconds)*12)})}/>)}</>;
}
registerRoot(Root);
