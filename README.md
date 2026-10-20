# TypeRip
The Adobe Font ripper.
## [Get It Here](https://kaatcodes.github.io/typerip/)

### How to use it
  1. Enter an Adobe Fonts [font family](https://fonts.adobe.com/fonts) or [font collection](https://fonts.adobe.com/collections) URL into the address bar, then press enter.
  2. Browse the available fonts under this family, using the download button to save them to your machine.
  3. That's it.

### Running it locally
Adobe Fonts pages can't be read directly from a browser, so TypeRip needs a proxy. The included `server.js` (Node 18+, no dependencies) serves the app and acts as that proxy.
  * Windows: double-click `TypeRip.vbs` (or a desktop shortcut to it). It starts the server in the background and opens TypeRip in your browser.
  * Anywhere: run `node server.js`, then open http://localhost:8787/
  * The server shuts down by itself after 30 minutes of inactivity. If nothing happens when you launch it, run `node server.js` in a terminal to see the error.

### Hosting it (e.g. GitHub Pages)
GitHub Pages can only serve static files, so a hosted TypeRip needs its proxy somewhere else. `proxy/cloudflare-worker.js` is a dependency-free proxy for Cloudflare Workers (free plan: 100,000 requests/day). It only fetches `fonts.adobe.com/fonts/...` and `/collections/...` pages, and caches them for an hour.
  1. Create a free account at https://dash.cloudflare.com/sign-up
  2. In the dashboard sidebar, open **Workers & Pages** (may be under **Compute**), click **Create**, and choose the **Hello World** Worker template.
  3. Give it a name (e.g. `typerip-proxy`) and click **Deploy**.
  4. Click **Edit code**, replace everything in the editor with the contents of `proxy/cloudflare-worker.js`, and click **Deploy** again.
  5. Test it by opening `https://<name>.<your-subdomain>.workers.dev/?url=https://fonts.adobe.com/fonts/proxima-nova`. You should see a page of HTML, not an error.
  6. In `js/typerip.js`, set `HOSTED_PROXY_URL` to `"https://<name>.<your-subdomain>.workers.dev/?url="`, then push to GitHub and enable Pages (repo **Settings → Pages → Deploy from a branch**).
  7. Optional: in the worker, change `ALLOWED_ORIGINS` from `["*"]` to your Pages address (e.g. `["https://yourname.github.io"]`) so other websites can't use your proxy. Localhost always stays allowed.

### Terms
* Do not use any downloaded fonts for anything other than testing purposes. Think of it like a try-before-you-buy system. This tool merely saves a copy of what Adobe makes publicly available through their website, but this does not give you the legal right to use the fonts as if you have purchased a license. If you want to publish any work using these fonts, you _must_ purchase a license through adobe.

### Whats new?

October 21, 2026:
* TypeRip works again! The free CORS proxy it relied on (allorigins.win) went down, which caused the "Network Error" when looking up a font. It now uses its own small proxy on Cloudflare Workers (`proxy/cloudflare-worker.js`).
* TypeRip can now run on your own computer without any proxy service: on Windows, double-click `TypeRip.vbs`; anywhere, run `node server.js`. See "Running it locally" below.
* "Download All" no longer hangs forever when one font fails. The other fonts still download, and the failed ones are listed.
* Fonts are now saved as `.otf`, since they're OpenType (CFF) fonts, not TrueType. This should help with OS compatibility.
* New "Format" option: download fonts as OTF (for desktop apps), WOFF2 (for websites) or WOFF (for older browsers). WOFF2 and WOFF come straight from Adobe, already properly named.
* Clearer error messages. URLs with extra bits (`?ref=...`, `#...`, or no `https://`) now work.

May 5, 2021:
* Typerip can now rip the entire available character set from any font. Big thanks to everyone that reported bugs and collected information on this issue.
* Added the option to download fonts without processing. This is useful if your download hangs and/or crashes your browser. Downloading the fonts without processing will always work, but you will have to edit the fonts manually to change their names and ensure compatibility with your OS.

May 3, 2021:
* Added the ability to read font collection URLs and download their contents as you would with a font family.
* Added a "Download All" button to font families and collections, downloading a single zip of all the contents of the font pack.
* Fonts now download as a ZIP archive.
* Switched to a more consistent CORS proxy.

March 22, 2020:
* Cosmetic fixes
* Removed all references to "TypeKit", as Adobe has renamed the service to "Adobe Fonts"

March 9, 2020:
* Fixed a bug in OpenType.js that would fail to re-encode some fonts.

Oct 21, 2019:
* Rewrote entire application from scratch
* New, cleaner and simpler user interface
* Fonts are automatically repaired and renamed correctly

### Screenshot
![Screenshot #1](https://i.imgur.com/5cyZTJ4.png)

### License
typerip.js is released under the WTFPL (http://www.wtfpl.net/)
