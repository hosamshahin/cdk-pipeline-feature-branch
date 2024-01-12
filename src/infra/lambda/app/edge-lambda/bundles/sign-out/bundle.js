/*! For license information please see bundle.js.LICENSE.txt */
(()=>{"use strict";var e={6489:(e,t)=>{t.parse=function(e,t){if("string"!=typeof e)throw new TypeError("argument str must be a string");for(var n={},o=t||{},s=e.split(";"),a=o.decode||r,c=0;c<s.length;c++){var u=s[c],l=u.indexOf("=");if(!(l<0)){var d=u.substring(0,l).trim();if(null==n[d]){var p=u.substring(l+1,u.length).trim();'"'===p[0]&&(p=p.slice(1,-1)),n[d]=i(p,a)}}}return n},t.serialize=function(e,t,r){var i=r||{},s=i.encode||n;if("function"!=typeof s)throw new TypeError("option encode is invalid");if(!o.test(e))throw new TypeError("argument name is invalid");var a=s(t);if(a&&!o.test(a))throw new TypeError("argument val is invalid");var c=e+"="+a;if(null!=i.maxAge){var u=i.maxAge-0;if(isNaN(u)||!isFinite(u))throw new TypeError("option maxAge is invalid");c+="; Max-Age="+Math.floor(u)}if(i.domain){if(!o.test(i.domain))throw new TypeError("option domain is invalid");c+="; Domain="+i.domain}if(i.path){if(!o.test(i.path))throw new TypeError("option path is invalid");c+="; Path="+i.path}if(i.expires){if("function"!=typeof i.expires.toUTCString)throw new TypeError("option expires is invalid");c+="; Expires="+i.expires.toUTCString()}i.httpOnly&&(c+="; HttpOnly");i.secure&&(c+="; Secure");if(i.sameSite){switch("string"==typeof i.sameSite?i.sameSite.toLowerCase():i.sameSite){case!0:c+="; SameSite=Strict";break;case"lax":c+="; SameSite=Lax";break;case"strict":c+="; SameSite=Strict";break;case"none":c+="; SameSite=None";break;default:throw new TypeError("option sameSite is invalid")}}return c};var r=decodeURIComponent,n=encodeURIComponent,o=/^[\u0009\u0020-\u007e\u0080-\u00ff]+$/;function i(e,t){try{return t(e)}catch(t){return e}}},763:(e,t,r)=>{r.r(t),r.d(t,{default:()=>n});const n='<!DOCTYPE html> <html lang="en"> <head> <meta charset="utf-8"/> <meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no"/> <link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/4.4.1/css/bootstrap.min.css" integrity="sha384-Vkoo8x4CGsO3+Hhxv8T/Q5PaXtkKtu6ug5TOeNV6gBiFeWPGFN9MuhOf23Q9Ifjh" crossorigin="anonymous"/> <title>Authorization@Edge</title> <style>html{padding:0}body{display:flex;min-height:100%;margin:0;justify-content:center;align-items:flex-start}.message-card{flex-grow:1;max-width:600px;margin-top:2%}</style> </head> <body> <div class="card message-card"> <h5 class="card-header">Authorization@Edge</h5> <div class="card-body"> <h5 class="card-title">${title}</h5> <p> ${message} <a class="card-link" data-toggle="collapse" href="#details" role="button" aria-expanded="false" aria-controls="details"> ${expandText} </a> </p> <p class="collapse blockquote-footer" id="details"> ${details} [log region: ${region}] </p> <a href="${linkUri}" class="btn btn-primary" role="button">${linkText}</a> </div> </div> <script src="https://code.jquery.com/jquery-3.5.0.slim.min.js" integrity="sha384-/IFzzQmt1S744I+IQO4Mc1uphkxbXt1tEwjQ/qSw2p8pXWck09sLvqHmKDYYwReJ" crossorigin="anonymous"><\/script> <script src="https://stackpath.bootstrapcdn.com/bootstrap/4.4.1/js/bootstrap.min.js" integrity="sha384-wfSDF2E50Y2D1uUdj0O3uMBJnjuUD4Ih7YwaYd1iqfktj0Uod8GCExl3Og8ifwB6" crossorigin="anonymous"><\/script> </body> </html> '},4443:(e,t,r)=>{Object.defineProperty(t,"__esModule",{value:!0}),t.fetch=void 0;const n=r(5687),o=r(2781);t.fetch=async function(e,t,r){return new Promise(((s,a)=>{const c={signal:AbortSignal.timeout(4e3),...r??{}},u=(0,n.request)(e,c,(e=>(0,o.pipeline)([e,i((t=>s({status:e.statusCode,headers:e.headers,data:t})))],l)));function l(e){e&&(u.destroy(e),a(e))}u.on("error",l),u.end(t)}))};const i=e=>{const t=[];return new o.Writable({write:(e,r,n)=>{try{t.push(e),n()}catch(e){n(e)}},final:r=>{try{e(Buffer.concat(t)),r()}catch(e){r(e)}}})}},3249:function(e,t,r){var n=this&&this.__importDefault||function(e){return e&&e.__esModule?e:{default:e}};Object.defineProperty(t,"__esModule",{value:!0}),t.fetchUrl=t.ensureValidRedirectPath=t.generateSecret=t.RequiresConfirmationError=t.timestampInSeconds=t.sign=t.urlSafe=t.createErrorHtml=t.httpPostToIDPWithRetry=t.generateCookieHeaders=t.extractAndParseCookies=t.getCookieNames=t.asCloudFrontHeaders=t.getCompleteConfig=t.getConfigWithHeaders=t.getConfig=void 0;const o=r(6113),i=r(7147),s=r(5687),a=r(5687),c=r(2781),u=r(3837),l=r(6489),d=n(r(763)),p=r(4443);var g;!function(e){e[e.none=0]="none",e[e.error=10]="error",e[e.warn=20]="warn",e[e.info=30]="info",e[e.debug=40]="debug"}(g||(g={}));class f{constructor(e){this.logLevel=e}format(e,t=10){return e.map((e=>(0,u.formatWithOptions)({depth:t},e))).join(" ")}info(...e){this.logLevel>=g.info&&console.log(this.format(e))}warn(...e){this.logLevel>=g.warn&&console.warn(this.format(e))}error(...e){this.logLevel>=g.error&&console.error(this.format(e))}debug(...e){this.logLevel>=g.debug&&console.trace(this.format(e))}}function h(){const e=JSON.parse((0,i.readFileSync)(`${__dirname}/configuration.json`).toString("utf8"));return{logger:new f(g[e.logLevel]),...e}}function m(){const e=h();if(!function(e){return void 0!==e.httpHeaders}(e))throw new Error("Incomplete config in configuration.json");return{cloudFrontHeaders:y(e.httpHeaders),...e}}function y(e){return e?Object.entries(e).reduce(((e,[t,r])=>Object.assign(e,{[t.toLowerCase()]:[{key:t,value:r}]})),{}):{}}function k(e,t){const r=`idp.${e}`;return{lastUserKey:`${r}.LastAuthUser`,scopeKey:`${r}.tokenScopesString`,idTokenKey:`${r}.idToken`,idToken2Key:t,accessTokenKey:`${r}.accessToken`,refreshTokenKey:`${r}.refreshToken`}}function S(e){const t={};let r;return r=k(e.clientId,e.idTokenCookieName),Object.assign(t,{[r.scopeKey]:`${e.oauthScopes.join(" ")}; ${e.cookieSettings.accessToken}`}),t[r.accessTokenKey]=`${e.tokens.access}; ${e.cookieSettings.accessToken}`,e.tokens.id&&(t[r.idTokenKey]=`${e.tokens.id}; ${e.cookieSettings.idToken}`,t[r.idToken2Key]=`${e.tokens.id}; ${e.cookieSettings.idToken}`),e.tokens.refresh&&(t[r.refreshTokenKey]=`${e.tokens.refresh}; ${e.cookieSettings.refreshToken}`),"signOut"===e.event&&Object.keys(t).forEach((e=>t[e]=w(t[e]))),["spa-auth-edge-nonce","spa-auth-edge-nonce-hmac","spa-auth-edge-pkce"].forEach((r=>{t[r]=w(`;${e.cookieSettings.nonce}`)})),Object.entries({...t}).map((([e,t])=>({key:"set-cookie",value:`${e}=${t}`})))}function w(e=""){const t=e.split(";").map((e=>e.trim())).filter((e=>!e.toLowerCase().startsWith("max-age"))).filter((e=>!e.toLowerCase().startsWith("expires"))),r=`Expires=${new Date(0).toUTCString()}`,[,...n]=t;return["",...n,r].join("; ")}t.getConfig=h,t.getConfigWithHeaders=m,t.getCompleteConfig=function(){const e=m(),t=(e.redirectPathAuthRefresh,{idToken:"Path=/; Secure; SameSite=Lax",accessToken:"Path=/; Secure; HttpOnly; SameSite=Lax",refreshToken:"Path=/; Secure; HttpOnly; SameSite=Lax",nonce:"Path=/; Secure; HttpOnly; SameSite=Lax"}),r=e.cookieSettings?Object.fromEntries(Object.entries({...t,...e.cookieSettings}).map((([e,r])=>[e,r||t[e]]))):t;return{...{secretAllowedCharacters:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~",pkceLength:43,nonceLength:16,nonceMaxAge:r?.nonce&&parseInt((0,l.parse)(r.nonce.toLowerCase())["max-age"])||86400},...e,cookieSettings:r}},t.asCloudFrontHeaders=y,t.getCookieNames=k,t.extractAndParseCookies=function(e,t,r){const n=function(e){return e.cookie?e.cookie.reduce(((e,t)=>Object.assign(e,(0,l.parse)(t.value))),{}):{}}(e);if(!n)return{};let o;return o=k(t,r),{tokenUserName:n[o.lastUserKey],idToken:n[o.idTokenKey],idToken2:n[o.idToken2Key],accessToken:n[o.accessTokenKey],refreshToken:n[o.refreshTokenKey],scopes:n[o.scopeKey],nonce:n["spa-auth-edge-nonce"],nonceHmac:n["spa-auth-edge-nonce-hmac"],pkce:n["spa-auth-edge-pkce"]}},t.generateCookieHeaders={signIn:e=>S({...e,event:"signIn"}),refresh:e=>S({...e,event:"refresh"}),signOut:e=>S({...e,event:"signOut"})};const v=new s.Agent({keepAlive:!0});t.httpPostToIDPWithRetry=async function(e,t,r,n,o){let i=0;for(;;){++i;try{return await(0,p.fetch)(e,t,{agent:v,...r,method:o}).then((e=>{if(200!==e.status)throw new Error(`Status is ${e.status}, expected 200`);if(!e.headers["content-type"]?.startsWith("application/json"))throw new Error(`Content-Type is ${e.headers["content-type"]}, expected application/json`);return{...e,data:JSON.parse(e.data.toString())}}))}catch(t){if(n.debug(`HTTP ${o} to ${e} failed (attempt ${i}):`),n.debug(t),i>=5)throw n.error(`No success after ${i} attempts, seizing further attempts`),t;i>=2&&(n.debug(`Doing exponential backoff with jitter, before attempting HTTP ${o} again ...`),await new Promise((e=>setTimeout(e,25*(Math.pow(2,i)+Math.random()*i)))),n.debug(`Done waiting, will try HTTP ${o} again now`))}}},t.createErrorHtml=function(e){const t={...e,region:process.env.AWS_REGION};return d.default.replace(/\${([^}]*)}/g,((e,r)=>function(e){if("string"!=typeof e)return;return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;")}(t[r])??""))},t.urlSafe={stringify:e=>e.replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_"),parse:e=>e.replace(/-/g,"+").replace(/_/g,"/")},t.sign=function(e,r,n){const i=(0,o.createHmac)("sha256",r).update(e).digest("base64").slice(0,n);return t.urlSafe.stringify(i)},t.timestampInSeconds=function(){return Date.now()/1e3|0};class T extends Error{}t.RequiresConfirmationError=T,t.generateSecret=function(e,t){return[...new Array(t)].map((()=>e[(0,o.randomInt)(0,e.length)])).join("")},t.ensureValidRedirectPath=function(e){return"string"!=typeof e?"/":e.startsWith("/")?e:`/${e}`},t.fetchUrl=async function(e){return new Promise(((t,r)=>{const n=(0,a.request)(e,(e=>(0,c.pipeline)([e,b(t)],o)));function o(e){e&&(n.destroy(e),r(e))}n.on("error",o),n.end()}))};const b=e=>{const t=[];return new c.Writable({write:(e,r,n)=>{try{t.push(e),n()}catch(e){n(e)}},final:r=>{try{e(Buffer.concat(t)),r()}catch(e){r(e)}}})}},6113:e=>{e.exports=require("crypto")},7147:e=>{e.exports=require("fs")},5687:e=>{e.exports=require("https")},3477:e=>{e.exports=require("querystring")},2781:e=>{e.exports=require("stream")},3837:e=>{e.exports=require("util")}},t={};function r(n){var o=t[n];if(void 0!==o)return o.exports;var i=t[n]={exports:{}};return e[n].call(i.exports,i,i.exports,r),i.exports}r.d=(e,t)=>{for(var n in t)r.o(t,n)&&!r.o(e,n)&&Object.defineProperty(e,n,{enumerable:!0,get:t[n]})},r.o=(e,t)=>Object.prototype.hasOwnProperty.call(e,t),r.r=e=>{"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(e,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(e,"__esModule",{value:!0})};var n={};(()=>{var e=n;Object.defineProperty(e,"__esModule",{value:!0}),e.handler=void 0;const t=r(3477),o=r(3249);let i;e.handler=async e=>{i||(i=(0,o.getCompleteConfig)(),i.logger.debug("Configuration loaded:",i)),i.logger.debug("Event:",e);const r=e.Records[0].cf.request,n=r.headers.host[0].value,{accessToken:s}=(0,o.extractAndParseCookies)(r.headers,i.clientId,i.idTokenCookieName);if(!s){const e={body:(0,o.createErrorHtml)({title:"Signed out",message:"You are already signed out",linkUri:`https://${n}${i.redirectPathSignOut}`,linkText:"Proceed"}),status:"200",headers:{...i.cloudFrontHeaders,"content-type":[{key:"Content-Type",value:"text/html; charset=UTF-8"}]}};return i.logger.debug("Returning response:\n",e),e}const a={logout_uri:`https://${n}${i.redirectPathSignOut}`,client_id:i.clientId},c={status:"307",statusDescription:"Temporary Redirect",headers:{location:[{key:"location",value:`${i.pingEndSessionEndpoint}?${(0,t.stringify)(a)}`}],"set-cookie":o.generateCookieHeaders.signOut({tokens:{access:s},...i}),...i.cloudFrontHeaders}};return i.logger.debug("Returning response:\n",c),c}})();var o=exports;for(var i in n)o[i]=n[i];n.__esModule&&Object.defineProperty(o,"__esModule",{value:!0})})();