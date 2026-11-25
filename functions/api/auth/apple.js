import { beginOAuth } from "../../_lib/oauth.js";
export async function onRequestGet({ request, env }) { return beginOAuth(request, env, "apple"); }

