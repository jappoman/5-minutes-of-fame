import React from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

const API = import.meta.env.VITE_API_URL as string | undefined;
type Stage = { status: "idle" | "live"; remainingSeconds?: number; speaker?: { displayName?: string; claims?: Record<string, string> } };
function App() {
  const [stage, setStage] = React.useState<Stage>({ status: "idle" });
  React.useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (!API) return;
      try {
        const response = await fetch(API.replace(/\/$/, "") + "/stage");
        if (!response.ok) return;
        const data = await response.json() as Stage;
        if (active) setStage(data);
      } catch { /* API not configured */ }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 10000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);
  return <main>
    <header><a className="brand" href="/">5<span>MIN</span></a><div className="status"><i/> THE WORLD'S ONLY STAGE</div></header>
    <section className="hero"><p className="eyebrow">ONE LIFE. ONE CHANCE.</p><h1>Everybody gets<br/><em>five minutes.</em></h1><p className="sub">One worldwide stage. No followers. No algorithm. No second chances.</p></section>
    <section className="stage"><div className="top"><strong><i/> {stage.status === "live" ? "LIVE WORLDWIDE" : "STAGE IS QUIET"}</strong><span>5:00 MAXIMUM</span></div>
      <div className="screen">{stage.status === "live" ? <><p>Broadcast in progress</p><strong>{stage.speaker?.displayName ?? "Anonymous"}</strong></> : <><span className="five">05:00</span><p>No one is on stage right now.</p><small>The next moment belongs to someone else.</small></>}</div>
      <div className="bottom"><div><strong>{stage.status === "live" ? "Someone's moment" : "The world is waiting"}</strong><p>Five minutes. Once in a lifetime.</p></div><span>ONE STAGE / EVERYONE</span></div></section>
    <section className="footer"><div><p className="eyebrow">YOUR ONE SHOT</p><h2>What would you do with five minutes?</h2><p>This experiment is being built. Identity verification and live broadcasting are not yet available.</p></div><button disabled>Join the stage · Coming soon</button></section>
    <footer>© {new Date().getFullYear()} 5 Minutes of Fame <span>THE INTERNET NEVER FORGETS. YOU ONLY GET ONE TURN.</span></footer>
  </main>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><App/></React.StrictMode>);
