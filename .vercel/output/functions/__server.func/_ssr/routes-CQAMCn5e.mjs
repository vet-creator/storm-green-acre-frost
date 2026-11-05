import { i as __toESM } from "../_runtime.mjs";
import { K as require_react, b as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as previewPathPrefix } from "./router-DmakiSsr.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-CQAMCn5e.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function Home() {
	const frame = (0, import_react.useRef)(null);
	const [src, setSrc] = (0, import_react.useState)("citadel.html");
	(0, import_react.useEffect)(() => {
		const prefix = previewPathPrefix(window.location.hostname, window.location.pathname);
		if (prefix) setSrc(`${prefix}/citadel.html`);
		const el = frame.current;
		if (!el) return;
		const focus = () => el.contentWindow?.focus();
		el.addEventListener("load", focus);
		return () => el.removeEventListener("load", focus);
	}, []);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
		className: "citadel-host",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("iframe", {
			ref: frame,
			className: "citadel-frame",
			title: "Abyssal Castle",
			src,
			allow: "autoplay"
		})
	});
}
//#endregion
export { Home as component };
