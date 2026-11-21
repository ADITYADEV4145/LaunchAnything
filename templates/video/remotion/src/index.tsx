import React from 'react';
import { AbsoluteFill, Composition, Img, OffthreadVideo, Sequence, interpolate, registerRoot, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

type Scene = {src:string; text:string; duration:number};
type Props = {scenes:Scene[]; name:string; logo?:string};
const defaults: Props = {scenes:Array.from({length:6}, () => ({src:'capture.png',text:'Your product in action',duration:5})),name:'Product'};
function Shot({scene, end, name, logo}: {scene:Scene; end:boolean; name:string; logo?:string}) {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const progress = Math.min(1, frame / Math.max(1,scene.duration * fps - 1));
  const transform = `scale(${interpolate(progress,[0,1],[1,1.08])}) translateX(${interpolate(progress,[0,1],[-1,1])}%)`;
  const style = {width:'100%',height:'100%',objectFit:'contain' as const,transform};
  return <AbsoluteFill style={{background:'#101725',color:'white',fontFamily:'sans-serif'}}>
    {/\.(mp4|webm)$/i.test(scene.src) ? <OffthreadVideo muted src={staticFile(scene.src)} style={style}/> : <Img src={staticFile(scene.src)} style={style}/>}
    <div style={{position:'absolute',bottom:70,left:35,right:35,textAlign:'center',fontSize:36,fontWeight:700}}><span style={{background:'#101725e8',padding:'10px 18px',boxDecorationBreak:'clone'}}>{scene.text}</span></div>
    {end && <div style={{position:'absolute',top:'12%',left:30,right:30,textAlign:'center',fontSize:48,fontWeight:800,textShadow:'0 2px 8px black'}}>{logo && <Img src={staticFile(logo)} style={{width:90,height:90,objectFit:'contain'}}/>}<div>{name}</div></div>}
  </AbsoluteFill>;
}
function Video(props:Props) {
  let elapsed = 0;
  return <AbsoluteFill>{props.scenes.map((scene,i) => {
    const start = Math.round(elapsed * 12); elapsed += scene.duration;
    const durationInFrames = Math.round(elapsed * 12) - start;
    return <Sequence key={i} from={start} durationInFrames={durationInFrames}><Shot scene={scene} end={i === props.scenes.length-1} name={props.name} logo={props.logo}/></Sequence>;
  })}</AbsoluteFill>;
}
function Root() {
  return <>{[['Demo',1280,720],['Short',720,1280],['Square',720,720]].map(([id,width,height]) => <Composition key={id} id={String(id)} component={Video} width={Number(width)} height={Number(height)} fps={12} durationInFrames={360} defaultProps={defaults} calculateMetadata={({props}) => ({durationInFrames:Math.round(props.scenes.reduce((n,s) => n+s.duration,0)*12)})}/>)}</>;
}
registerRoot(Root);
