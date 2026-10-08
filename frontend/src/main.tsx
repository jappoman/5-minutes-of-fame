import React from "react";
import { createRoot } from "react-dom/client";
import { CognitoUserPool, CognitoUser, AuthenticationDetails } from "amazon-cognito-identity-js";
import IVSBroadcastClient from "amazon-ivs-web-broadcast";
import IVSPlayer from "amazon-ivs-player";
import "./style.css";
const API = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
const poolId = import.meta.env.VITE_COGNITO_POOL_ID;
const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
const pool = poolId && clientId ? new CognitoUserPool({UserPoolId:poolId,ClientId:clientId}):null;
type Stage={status:string;remainingSeconds:number|null;playbackUrl:string|null;speaker:{claims:Record<string,string>}|null};
type Profile={verified:boolean;queued:boolean;consumed:boolean;claims:Record<string,{verified:boolean;value:string}>};
function App(){
 const [stage,S]=React.useState<Stage>({status:"idle",remainingSeconds:null,playbackUrl:null,speaker:null});
 const [profile,P]=React.useState<Profile|null>(null);
 const [token,T]=React.useState("");
 const [email,E]=React.useState(""); const [password,W]=React.useState(""); const [code,C]=React.useState("");
 const [message,M]=React.useState("");const [show,H]=React.useState<string[]>([]);
 const [busy,B]=React.useState(false);
 const video=React.useRef<HTMLVideoElement>(null);const preview=React.useRef<HTMLVideoElement>(null);
 const stream=React.useRef<MediaStream|null>(null);
 const publisher=React.useRef<ReturnType<typeof IVSBroadcastClient.create>|null>(null);
 const api=React.useCallback(async(path:string,method="GET",data?:unknown,t=token)=>{
  const r=await fetch(API+path,{method,headers:{...(t?{authorization:"Bearer "+t}:{}),...(data?{"content-type":"application/json"}:{})},body:data?JSON.stringify(data):undefined});
  const result=await r.json();if(!r.ok)throw new Error(result.error||"Request failed");return result;
 },[token]);
 const refresh=React.useCallback(async()=>{if(!API)return;try{S(await api("/stage"));if(token)P(await api("/me"));}catch{/* Offline */}},[api,token]);
 React.useEffect(()=>{void refresh();const interval=setInterval(()=>void refresh(),3000);return()=>clearInterval(interval)},[refresh]);
 React.useEffect(()=>{pool?.getCurrentUser()?.getSession((err:Error|null,session:any)=>{if(!err&&session)T(session.getIdToken().getJwtToken())})},[]);
 React.useEffect(()=>{
  if(stage.status!=="live"||!stage.playbackUrl||!video.current||!IVSPlayer.isPlayerSupported)return;
  const p=IVSPlayer.create({ wasmWorker: "https://player.live-video.net/1.46.0/amazon-ivs-wasmworker.min.js", wasmBinary: "https://player.live-video.net/1.46.0/amazon-ivs-wasmworker.min.wasm" });p.attachHTMLVideoElement(video.current);p.load(stage.playbackUrl);p.play();
  return()=>p.delete();
 },[stage.status,stage.playbackUrl]);
 const run=async(f:()=>Promise<void>)=>{B(true);try{await f()}catch(e){M((e as Error).message)}finally{B(false)}};
 const signUp=()=>void run(async()=>{if(!pool)return;await new Promise<void>((resolve,reject)=>pool.signUp(email,password,[],[],e=>e?reject(e):resolve()));M("Check email for your code.")});
 const confirm=()=>void run(async()=>{if(!pool)return;await new Promise<void>((resolve,reject)=>new CognitoUser({Username:email,Pool:pool}).confirmRegistration(code,true,e=>e?reject(e):resolve()));M("Email confirmed. Sign in.")});
 const login=()=>void run(async()=>{if(!pool)return;await new Promise<void>((resolve,reject)=>new CognitoUser({Username:email,Pool:pool}).authenticateUser(new AuthenticationDetails({Username:email,Password:password}),{onSuccess:s=>{T(s.getIdToken().getJwtToken());resolve()},onFailure:reject}));M("Signed in.")});
 const modify=(path:string,method:string)=>void run(async()=>{await api(path,method);await refresh();M("Updated.")});
 const enableCamera=()=>void run(async()=>{stream.current=await navigator.mediaDevices.getUserMedia({video:true,audio:true});if(preview.current){preview.current.srcObject=stream.current;await preview.current.play()}M("Camera ready.")});
 const goLive=()=>void run(async()=>{
  if(!stream.current)throw new Error("Enable webcam and microphone first.");
  const c=await api("/go-live","POST",{show});
  const client=IVSBroadcastClient.create({streamConfig:IVSBroadcastClient.BASIC_LANDSCAPE,ingestEndpoint:c.ingestEndpoint});
  publisher.current=client;client.addVideoInputDevice(stream.current,"camera",{index:0});client.addAudioInputDevice(stream.current,"microphone");
  await client.startBroadcast(c.streamKey);
  M("You're live until "+new Date(c.endsAt).toLocaleTimeString());await refresh();
 });
 const stop=()=>void run(async()=>{publisher.current?.stopBroadcast();publisher.current=null;stream.current?.getTracks().forEach(t=>t.stop());await api("/stop","POST");await refresh()});
 React.useEffect(()=>{if(publisher.current&&stage.status!=="live"){publisher.current.stopBroadcast();publisher.current=null;stream.current?.getTracks().forEach(t=>t.stop())}},[stage.status]);
 return <main><header><b className="brand">5<span>MIN</span></b><small>ONE WORLDWIDE STAGE</small></header>
 <section className="hero"><p>ONE LIFE. ONE CHANCE.</p><h1>Everybody gets<br/><em>five minutes.</em></h1><h3>No followers. No algorithm. No second chances.</h3></section>
 <section className="stage"><div className="top"><b>{stage.status==="live"?"● LIVE WORLDWIDE":"STAGE IS QUIET"}</b><b>{stage.remainingSeconds===null?"05:00":Math.floor(stage.remainingSeconds/60)+":"+String(stage.remainingSeconds%60).padStart(2,"0")}</b></div>
 {stage.status==="live"?<video ref={video} controls playsInline autoPlay className="screen"/>:<div className="screen"><span>05:00</span><p>The stage is waiting for someone.</p></div>}
 <div className="bottom">{Object.entries(stage.speaker?.claims??{}).map(([k,v])=><p key={k}>{k}: {v}</p>)}<small>FIVE MINUTES. ONCE IN A LIFETIME.</small></div></section>
 <section className="panel"><h2>Take your one shot</h2>{!pool?<p>Authentication not configured in this deployment.</p>:!token?<div className="form"><input type="email" placeholder="Email" value={email} onChange={e=>E(e.target.value)}/><input type="password" placeholder="Password" value={password} onChange={e=>W(e.target.value)}/><div className="actions"><button disabled={busy} onClick={signUp}>Register</button><button disabled={busy} onClick={login}>Sign in</button></div><input placeholder="Email confirmation code" value={code} onChange={e=>C(e.target.value)}/><button disabled={busy} onClick={confirm}>Confirm email</button></div>:<><button onClick={()=>{pool.getCurrentUser()?.signOut();T("");P(null)}}>Sign out</button>
 {profile&&<><p>Identity: <b>{profile.verified?"Verified":"Not verified"}</b> | Lifetime turn: <b>{profile.consumed?"Consumed":"Available"}</b></p>
 {!profile.verified?<p>Identity verification is not yet integrated. Email verification alone does not unlock broadcasting.</p>:profile.consumed?<p>You may keep watching, but your turn is over.</p>:<><div className="actions"><button disabled={busy||profile.queued} onClick={()=>modify("/queue","POST")}>Join queue</button><button disabled={busy||!profile.queued} onClick={()=>modify("/queue","DELETE")}>Leave queue</button></div>
 {profile.queued&&<><h3>Choose your public information</h3><p>Unchecked fields stay private. Only verified details can be displayed.</p>{Object.entries(profile.claims).filter(([,v])=>v.verified).map(([k,v])=><label key={k} className="claim"><input type="checkbox" checked={show.includes(k)} onChange={e=>H(e.target.checked?[...show,k]:show.filter(x=>x!==k))}/>{k}: {v.value}</label>)}
 <video className="preview" ref={preview} muted playsInline/><div className="actions"><button disabled={busy} onClick={enableCamera}>Enable webcam</button><button disabled={busy||stage.status==="live"} onClick={goLive}>Start my five minutes</button></div></>}</>}</>}</>}
 {publisher.current&&<button onClick={stop}>Stop now</button>}{message&&<p role="status" className="notice">{message}</p>}</section>
 <footer>© 5 Minutes of Fame. One chance for everyone.</footer></main>
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><App/></React.StrictMode>);
