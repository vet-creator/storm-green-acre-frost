import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { previewPathPrefix } from "@/lib/preview-path-prefix";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const frame = useRef<HTMLIFrameElement>(null);
  const [src, setSrc] = useState("citadel.html");
  useEffect(() => {
    const prefix = previewPathPrefix(window.location.hostname, window.location.pathname);
    if (prefix) setSrc(`${prefix}/citadel.html`);
    const el = frame.current;
    if (!el) return;
    const focus = () => el.contentWindow?.focus();
    el.addEventListener("load", focus);
    return () => el.removeEventListener("load", focus);
  }, []);
  return (
    <main className="citadel-host">
      <iframe
        ref={frame}
        className="citadel-frame"
        title="Abyssal Castle"
        src={src}
        allow="autoplay"
      />
    </main>
  );
}
