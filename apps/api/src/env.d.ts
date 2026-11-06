// Types the Worker env from the bindings declared in alchemy.run.ts, so adding a binding there is
// the only step. `Env` is what handlers receive; `Cloudflare.Env` types `cloudflare:workers`.
import type { ApiEnv } from "../alchemy.run.ts";

declare global {
	interface Env extends ApiEnv {}
	namespace Cloudflare {
		interface Env extends ApiEnv {}
	}
}
