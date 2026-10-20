//fonts.adobe.com sends no CORS headers, so its pages have to be fetched through a proxy.
//When running locally (node server.js), the local server's /proxy route is used.
//When hosted elsewhere, point HOSTED_PROXY_URL at your own proxy (the url is appended, encoded),
//e.g. the Cloudflare Worker in proxy/cloudflare-worker.js: "https://<name>.<subdomain>.workers.dev/?url="
var IS_LOCAL = ["localhost", "127.0.0.1", "[::1]"].indexOf(location.hostname) != -1;
var HOSTED_PROXY_URL = "https://typerip-proxy.kaat.workers.dev/?url=";
var PROXY_URL = IS_LOCAL ? "/proxy?url=" : HOSTED_PROXY_URL;

//"unicode=AAAAAQAAAAEAAAAB&features=ALL" (apparently) requests the entire font set from the server :)
//The server only checks that ec_token is present (it returns 403 without it), not its value.
var FONT_URL_QUERY = "?unicode=AAAAAQAAAAEAAAAB&features=ALL&v=3&ec_token=3bb2a6e53c9684ffdc9a9bf71d5b2a620e68abb153386c46ebe547292f11a96176a59ec4f0c7aacfef2663c08018dc100eedf850c284fb72392ba910777487b32ba21c08cc8c33d00bda49e7e2cc90baff01835518dde43e2e8d5ebf7b76545fc2687ab10bc2b0911a141f3cf7f04f3cac438a135f";

//Adobe's font server picks the file format from the last path segment of the font URL.
//Only OTF can be processed (renamed/repaired); WOFF and WOFF2 already carry proper names.
var FONT_FORMATS = {
    otf: {urlPath: "a", extension: "otf"},
    woff2: {urlPath: "l", extension: "woff2"},
    woff: {urlPath: "d", extension: "woff"}
};

var FAMILY_JSON_MARKER = '{"family":{"slug":"';
var COLLECTION_JSON_MARKER = '{"fontpack":{"all_valid_slugs":';
var FALLBACK_SAMPLE_TEXT = "The quick brown fox jumps over the lazy dog";

var TypeRip = {
    handleRequest: function(url_, callback_){
        let url;
        try {
            url = this.normalizeUrl(url_);
        }catch(e){
            callback_("error", e.message)
            return
        }

        let request = url.indexOf("fonts.adobe.com/collections/") != -1 ? this.getFontCollection(url) : this.getFontFamily(url);
        request.then(
            result => callback_("success", result),
            error => callback_("error", error.message)
        )
    },

    //Accepts "fonts.adobe.com/fonts/x", "http://...", URLs with ?query or #hash, and returns a clean https URL.
    normalizeUrl: function(url_) {
        url_ = url_.trim();
        if(!/^https?:\/\//i.test(url_)){
            url_ = "https://" + url_;
        }

        let parsed;
        try {
            parsed = new URL(url_);
        }catch(e){
            throw new Error("That doesn't look like a URL. Paste an Adobe Fonts family or collection URL, e.g. https://fonts.adobe.com/fonts/proxima-nova")
        }
        if(parsed.hostname != "fonts.adobe.com"){
            throw new Error("Only fonts.adobe.com URLs are supported, e.g. https://fonts.adobe.com/fonts/proxima-nova")
        }
        return "https://fonts.adobe.com" + parsed.pathname;
    },

    //Fetch an Adobe Fonts page through the proxy and parse the JSON blob embedded in it, which starts with marker_.
    fetchPageJson: function(url_, marker_) {
        return axios.get(PROXY_URL + encodeURIComponent(url_), {responseType: 'text'})
        .catch(error => {
            throw new Error(this.describeFetchError(error))
        })
        .then(response => {
            let html = String(response.data);

            //search for the first part of the json
            let json_start = html.indexOf(marker_);
            if(json_start == -1) {
                throw new Error("Couldn't find any font data on that page. Make sure it's an Adobe Fonts font family or collection page. If it is, Adobe may have changed their page format.")
            }

            //find the end of the script tag the json lives in
            let json_end = html.indexOf('</script>', json_start);
            if(json_end == -1) {
                throw new Error("The font data on that page was cut off. Adobe may have changed their page format.")
            }

            try {
                return JSON.parse(html.substring(json_start, json_end));
            }catch(e){
                throw new Error("The font data on that page couldn't be read. Adobe may have changed their page format.")
            }
        })
    },

    describeFetchError: function(error_) {
        if(error_.response){
            if(error_.response.status == 404){
                return "Adobe Fonts says that page doesn't exist (404). Check the URL."
            }
            return "Request failed (" + error_.response.status + "): " + String(error_.response.data).substring(0, 200)
        }
        if(IS_LOCAL){
            return "Can't reach the local TypeRip server. It shuts down after 30 idle minutes - reopen TypeRip from its shortcut."
        }
        return "Can't reach the CORS proxy (" + PROXY_URL + "). It may be down."
    },

    getSampleText: function(json_, language_) {
        let samples = json_.textSampleData && json_.textSampleData.textSamples;
        if(samples && samples[language_] && samples[language_]["list"]){
            return samples[language_]["list"];
        }
        return FALLBACK_SAMPLE_TEXT;
    },

    getFontUrl: function(webId_, fvd_, format_) {
        return "https://use.typekit.net/pf/tk/" + webId_ + "/" + fvd_ + "/" + FONT_FORMATS[format_ || "otf"].urlPath + FONT_URL_QUERY;
    },

    getFontCollection: function(url_){
        return this.fetchPageJson(url_, COLLECTION_JSON_MARKER).then(json => {
            let variations = json.fontpack.font_variations;
            let fontCollection = {
                name: json.fontpack.name,
                designers: [],
                fonts: []
            }

            //find the default language of the first font in this collection, and grab its sample text
            fontCollection.defaultLanguage = variations.length > 0 ? variations[0].default_language : "en";
            fontCollection.sampleText = this.getSampleText(json, fontCollection.defaultLanguage);

            //Find the contributor who curated this collection:
            fontCollection.designers.push({
                "name": json.fontpack.contributor_credit,
                "url": url_
            })

            //populate subfonts
            for (let i = 0; i < variations.length; i++) {
                fontCollection.fonts.push({
                    url: this.getFontUrl(variations[i].opaque_id, variations[i].fvd),
                    webId: variations[i].opaque_id,
                    fvd: variations[i].fvd,
                    name: variations[i].full_display_name,
                    style: variations[i].variation_name,
                    familyName: variations[i].family.name,
                    familyUrl: "https://fonts.adobe.com/fonts/" + variations[i].family.slug
                });
            }
            return fontCollection
        })
    },

    getFontFamily: function(url_) {
        return this.fetchPageJson(url_, FAMILY_JSON_MARKER).then(json => {
            let fontFamily = {
                name: json.family.name,
                slug: json.family.slug,
                foundryName: json.family.foundry.name,
                designers: [],
                fonts: []
            }

            //find the default language of this font, and grab its sample text
            fontFamily.defaultLanguage = json.family.display_font.default_language;
            fontFamily.sampleText = this.getSampleText(json, fontFamily.defaultLanguage);

            //designers
            for(let i = 0; i < json.family.designers.length; i++) {
                let designer = {}
                designer["name"] = json.family.designers[i].name

                if(json.designer_info && json.designer_info[json.family.designers[i].slug] != null){
                    designer["url"] = "https://fonts.adobe.com" + json.designer_info[json.family.designers[i].slug].url
                }

                fontFamily.designers.push(designer)
            }

            //populate subfonts
            for (let i = 0; i < json.family.fonts.length; i++) {
                fontFamily.fonts.push({
                    url: this.getFontUrl(json.family.fonts[i].family.web_id, json.family.fonts[i].font.web.fvd),
                    webId: json.family.fonts[i].family.web_id,
                    fvd: json.family.fonts[i].font.web.fvd,
                    name: json.family.fonts[i].name,
                    style: json.family.fonts[i].variation_name,
                    familyName: fontFamily.name,
                    familyUrl: "https://fonts.adobe.com/fonts/" + json.family.slug
                });
            }
            return fontFamily
        })
    },

    //Download, repair and zip one font or an array of fonts, in format_ ("otf", "woff2" or "woff"). Resolves with {failed: [messages]}.
    //Fonts that fail are left out of the zip instead of stalling the whole download.
    downloadFonts: function(fonts_, zipFileName_, rawDownload_, format_){
        format_ = format_ || "otf";
        let fontList = Array.isArray(fonts_) ? fonts_ : [fonts_];
        if(!Array.isArray(fonts_)){
            zipFileName_ = fonts_.name;
        }
        if(format_ != "otf"){
            zipFileName_ += " (" + format_.toUpperCase() + ")";
        }

        return Promise.allSettled(fontList.map(font => this.getAndRepairFont(font, rawDownload_, format_)))
        .then(results => {
            let zip = new JSZip();
            let failed = [];

            results.forEach((result, i) => {
                if(result.status == "fulfilled"){
                    zip.file(this.safeFileName(fontList[i].name) + "." + result.value.extension, result.value.data);
                }else{
                    failed.push(fontList[i].name + ": " + result.reason.message);
                }
            });

            if(failed.length == fontList.length){
                return {failed: failed}
            }
            return zip.generateAsync({type:"blob"}).then(content => {
                saveAs(content, this.safeFileName(zipFileName_) + ".zip");
                return {failed: failed}
            })
        })
    },

    safeFileName: function(name_) {
        return String(name_).replace(/[\\\/:*?"<>|]/g, "-");
    },

    //Download a font file as-is. With no extension_ given, it's picked from the file signature.
    downloadFontFile: function(url_, extension_) {
        return axios.get(url_, {responseType: 'arraybuffer'})
        .then(response => ({data: response.data, extension: extension_ || this.getFontExtension(response.data)}))
        .catch(error => {
            if(error.response && error.response.status == 403){
                throw new Error("Adobe's font server refused the download (403). Adobe may have changed how font downloads are authorized.")
            }
            throw new Error("Download failed (" + error.message + ")")
        });
    },

    //Adobe serves both CFF (OTTO) and TrueType fonts; pick the extension from the file signature.
    getFontExtension: function(arrayBuffer_) {
        let bytes = new Uint8Array(arrayBuffer_, 0, 4);
        let signature = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
        if(signature == "true" || (bytes[0] == 0 && bytes[1] == 1 && bytes[2] == 0 && bytes[3] == 0)){
            return "ttf";
        }
        return "otf";
    },

    //Resolves with {data: ArrayBuffer, extension: "otf" | "ttf" | "woff2" | "woff"}.
    getAndRepairFont: function(font_, rawDownload_, format_) {
        if(format_ && format_ != "otf"){
            return this.downloadFontFile(this.getFontUrl(font_.webId, font_.fvd, format_), FONT_FORMATS[format_].extension);
        }
        if(rawDownload_){
            return this.downloadFontFile(font_.url, null);
        }

        return new Promise((resolve, reject) => {
            opentype.load(font_.url, (error_, fontData_) => {
                if (error_) {
                    reject(new Error("Font failed to load (" + error_ + "). Try \"Download without processing\"."))
                    return
                }
                try {
                    resolve({data: this.rebuildFont(font_, fontData_), extension: "otf"})
                }catch(e){
                    reject(new Error("Font failed to process (" + e.message + "). Try \"Download without processing\"."))
                }
            })
        })
    },

    //Rebuild the font with OpenType.js, which repairs encoding issues and renames it properly. Returns an ArrayBuffer (CFF/OTF).
    rebuildFont: function(font_, fontData_) {
        //Rebuild the glyph data structure. This repairs any encoding issues.
        let rebuiltGlyphs = []

        //for every glyph in the parsed font data:
        for(let i = 0; i < fontData_.glyphs.length; i++) {
            //Create a structure to hold the new glyph data
            let glyphData = {};

            let glyphFields = ['name', 'unicode', 'unicodes', 'path', 'index', 'advanceWidth', 'leftSideBearing']

            glyphFields.forEach(field => {
                if(fontData_.glyphs.glyphs[i][field] != null) {
                    glyphData[field] = fontData_.glyphs.glyphs[i][field]
                }
            });

            //HOTFIX #1     If the advanceWidth of a glyph is NaN, opentype will crash.
            //SOLUTION:     Ensure advanceWidth has non-NaN AND non-0 value
            if(glyphData.advanceWidth == null || isNaN(glyphData.advanceWidth)){
                let newAdvanceWidth = Math.floor(fontData_.glyphs.glyphs[i].getBoundingBox().x2);
                if(newAdvanceWidth == 0){
                    newAdvanceWidth = fontData_.glyphs.glyphs[0].getBoundingBox().x2;
                }
                glyphData.advanceWidth = newAdvanceWidth;
            }

            //Rebuild the new glyph.
            let rebuiltGlyph = new opentype.Glyph(glyphData);

            //HOTFIX #2:    If fields with a value of 0 are used in the constructor, opentype will simply not set them in the object.
            //SOLUTION:     Manually go through every 0 field that should have been set in the constructor, and set it. ( https://github.com/opentypejs/opentype.js/issues/375 )
            glyphFields.forEach(field => {
                if(glyphData[field] != null && glyphData[field] == 0) {
                    rebuiltGlyph[field] = 0
                }
            })

            //push the rebuilt glyph to an array.
            rebuiltGlyphs.push(rebuiltGlyph)
        }

        //create a structure of font data with fields from the parsed font.
        let newFontData = {
            familyName: font_.familyName,
            styleName: font_.style,
            glyphs: rebuiltGlyphs
        }

        //extract as much available data out of the existing font data and copy it over to the new font:
        let optionalFontDataFields = ['defaultWidthX', 'nominalWidthX', 'unitsPerEm', 'ascender', 'descender' ]
        optionalFontDataFields.forEach(field => {
            if(fontData_[field] != null) {
                newFontData[field] = fontData_[field]
            }
        });

        return new opentype.Font(newFontData).toArrayBuffer();
    }
}
