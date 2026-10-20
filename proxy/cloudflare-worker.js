// TypeRip proxy for Cloudflare Workers (free plan, no dependencies).
// fonts.adobe.com sends no CORS headers, so a hosted TypeRip fetches its pages through this.
//
// Usage:  https://<your-worker>.workers.dev/?url=https%3A%2F%2Ffonts.adobe.com%2Ffonts%2Fproxima-nova
//
// Paste this whole file into the Cloudflare dashboard editor (see README, "Hosting it").

// Sites allowed to use this proxy from a browser, e.g. ["https://yourname.github.io"].
// "*" allows any site. Localhost is always allowed so the local version can use it too.
const ALLOWED_ORIGINS = ["*"];

// How long Adobe pages are cached at Cloudflare, to stay well inside the free request limits.
const CACHE_SECONDS = 60 * 60;

export default {
    async fetch(request, env, ctx) {
        const origin = request.headers.get("Origin");
        const corsHeaders = getCorsHeaders(origin);

        if (request.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: corsHeaders });
        }
        if (request.method !== "GET") {
            return textResponse(405, "Method not allowed", corsHeaders);
        }
        if (origin && !corsHeaders["Access-Control-Allow-Origin"]) {
            return textResponse(403, "This site is not allowed to use this proxy.", corsHeaders);
        }

        const param = new URL(request.url).searchParams.get("url");
        if (!param) {
            return textResponse(200, "TypeRip proxy is running. Usage: ?url=https://fonts.adobe.com/fonts/<family>", corsHeaders);
        }

        let target;
        try {
            target = new URL(param);
        } catch (e) {
            return textResponse(400, "Invalid url parameter.", corsHeaders);
        }
        if (!isAllowedTarget(target)) {
            return textResponse(403, "Only fonts.adobe.com/fonts/... and /collections/... URLs can be fetched.", corsHeaders);
        }
        // Drop ?query and #hash so equivalent URLs share one cache entry.
        const targetUrl = "https://fonts.adobe.com" + target.pathname;

        const cache = typeof caches !== "undefined" ? caches.default : null;
        const cacheKey = new Request(targetUrl);
        let upstream = cache ? await cache.match(cacheKey) : null;

        if (!upstream) {
            try {
                const fetched = await fetch(targetUrl, {
                    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36" }
                });
                upstream = new Response(await fetched.text(), {
                    status: fetched.status,
                    headers: {
                        "Content-Type": "text/html; charset=utf-8",
                        "Cache-Control": "public, max-age=" + CACHE_SECONDS
                    }
                });
            } catch (e) {
                return textResponse(502, "Could not reach fonts.adobe.com: " + e.message, corsHeaders);
            }
            if (cache && upstream.status === 200) {
                ctx.waitUntil(cache.put(cacheKey, upstream.clone()));
            }
        }

        return new Response(upstream.body, {
            status: upstream.status,
            headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" }
        });
    }
};

// Only Adobe Fonts family and collection pages may be proxied.
function isAllowedTarget(target) {
    return target.protocol === "https:" &&
           target.hostname === "fonts.adobe.com" &&
           (target.pathname.startsWith("/fonts/") || target.pathname.startsWith("/collections/"));
}

function getCorsHeaders(origin) {
    const headers = {
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin"
    };
    const isLocal = origin && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    if (ALLOWED_ORIGINS.includes("*")) {
        headers["Access-Control-Allow-Origin"] = "*";
    } else if (origin && (isLocal || ALLOWED_ORIGINS.includes(origin))) {
        headers["Access-Control-Allow-Origin"] = origin;
    }
    return headers;
}

function textResponse(status, text, corsHeaders) {
    return new Response(text, {
        status: status,
        headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" }
    });
}
