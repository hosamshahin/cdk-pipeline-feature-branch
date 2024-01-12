"use strict";
// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchUrl = exports.ensureValidRedirectPath = exports.generateSecret = exports.RequiresConfirmationError = exports.timestampInSeconds = exports.sign = exports.urlSafe = exports.createErrorHtml = exports.httpPostToIDPWithRetry = exports.generateCookieHeaders = exports.extractAndParseCookies = exports.getCookieNames = exports.asCloudFrontHeaders = exports.getCompleteConfig = exports.getConfigWithHeaders = exports.getConfig = void 0;
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const https_1 = require("https");
const https_2 = require("https");
const stream_1 = require("stream");
const util_1 = require("util");
const cookie_1 = require("cookie");
const template_html_1 = __importDefault(require("./error-page/template.html"));
const https_3 = require("./https");
function getDefaultCookieSettings(props) {
    // Defaults can be overridden by the user (CloudFormation Stack parameter) but should be solid enough for most purposes
    return {
        idToken: 'Path=/; Secure; SameSite=Lax',
        accessToken: 'Path=/; Secure; HttpOnly; SameSite=Lax',
        refreshToken: 'Path=/; Secure; HttpOnly; SameSite=Lax',
        nonce: 'Path=/; Secure; HttpOnly; SameSite=Lax',
    };
}
function isConfigWithHeaders(config) {
    return config.httpHeaders !== undefined;
}
function isCompleteConfig(config) {
    return true;
}
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["none"] = 0] = "none";
    LogLevel[LogLevel["error"] = 10] = "error";
    LogLevel[LogLevel["warn"] = 20] = "warn";
    LogLevel[LogLevel["info"] = 30] = "info";
    LogLevel[LogLevel["debug"] = 40] = "debug";
})(LogLevel || (LogLevel = {}));
class Logger {
    constructor(logLevel) {
        this.logLevel = logLevel;
    }
    format(args, depth = 10) {
        return args.map((arg) => (0, util_1.formatWithOptions)({ depth }, arg)).join(' ');
    }
    info(...args) {
        if (this.logLevel >= LogLevel.info) {
            console.log(this.format(args));
        }
    }
    warn(...args) {
        if (this.logLevel >= LogLevel.warn) {
            console.warn(this.format(args));
        }
    }
    error(...args) {
        if (this.logLevel >= LogLevel.error) {
            console.error(this.format(args));
        }
    }
    debug(...args) {
        if (this.logLevel >= LogLevel.debug) {
            console.trace(this.format(args));
        }
    }
}
function getConfig() {
    const config = JSON.parse((0, fs_1.readFileSync)(`${__dirname}/configuration.json`).toString('utf8'));
    return {
        logger: new Logger(LogLevel[config.logLevel]),
        ...config,
    };
}
exports.getConfig = getConfig;
function getConfigWithHeaders() {
    const config = getConfig();
    if (!isConfigWithHeaders(config)) {
        throw new Error('Incomplete config in configuration.json');
    }
    return {
        cloudFrontHeaders: asCloudFrontHeaders(config.httpHeaders),
        ...config,
    };
}
exports.getConfigWithHeaders = getConfigWithHeaders;
function getCompleteConfig() {
    const config = getConfigWithHeaders();
    if (!isCompleteConfig(config)) {
        throw new Error('Incomplete config in configuration.json');
    }
    // Derive cookie settings by merging the defaults with the explicitly provided values
    const defaultCookieSettings = getDefaultCookieSettings({
        redirectPathAuthRefresh: config.redirectPathAuthRefresh,
    });
    const cookieSettings = config.cookieSettings
        ? Object.fromEntries(Object.entries({
            ...defaultCookieSettings,
            ...config.cookieSettings,
        }).map(([k, v]) => [
            k,
            v || defaultCookieSettings[k],
        ]))
        : defaultCookieSettings;
    // Defaults for nonce and PKCE
    const defaults = {
        secretAllowedCharacters: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~',
        pkceLength: 43,
        nonceLength: 16,
        nonceMaxAge: (cookieSettings?.nonce &&
            parseInt((0, cookie_1.parse)(cookieSettings.nonce.toLowerCase())['max-age'])) ||
            60 * 60 * 24,
    };
    return {
        ...defaults,
        ...config,
        cookieSettings,
    };
}
exports.getCompleteConfig = getCompleteConfig;
function extractCookiesFromHeaders(headers) {
    // Cookies are present in the HTTP header "Cookie" that may be present multiple times.
    // This utility function parses occurrences  of that header and splits out all the cookies and their values
    // A simple object is returned that allows easy access by cookie name: e.g. cookies["nonce"]
    if (!headers.cookie) {
        return {};
    }
    const cookies = headers.cookie.reduce((reduced, header) => Object.assign(reduced, (0, cookie_1.parse)(header.value)), {});
    return cookies;
}
function asCloudFrontHeaders(headers) {
    if (!headers)
        return {};
    // Turn a regular key-value object into the explicit format expected by CloudFront
    return Object.entries(headers).reduce((reduced, [key, value]) => Object.assign(reduced, {
        [key.toLowerCase()]: [
            {
                key,
                value,
            },
        ],
    }), {});
}
exports.asCloudFrontHeaders = asCloudFrontHeaders;
function getCookieNames(clientId, idTokenCookieName) {
    const keyPrefix = `idp.${clientId}`;
    return {
        lastUserKey: `${keyPrefix}.LastAuthUser`,
        scopeKey: `${keyPrefix}.tokenScopesString`,
        idTokenKey: `${keyPrefix}.idToken`,
        idToken2Key: idTokenCookieName,
        accessTokenKey: `${keyPrefix}.accessToken`,
        refreshTokenKey: `${keyPrefix}.refreshToken`,
    };
}
exports.getCookieNames = getCookieNames;
function extractAndParseCookies(headers, clientId, idTokenCookieName) {
    const cookies = extractCookiesFromHeaders(headers);
    if (!cookies) {
        return {};
    }
    let cookieNames;
    cookieNames = getCookieNames(clientId, idTokenCookieName);
    return {
        tokenUserName: cookies[cookieNames.lastUserKey],
        idToken: cookies[cookieNames.idTokenKey],
        idToken2: cookies[cookieNames.idToken2Key],
        accessToken: cookies[cookieNames.accessTokenKey],
        refreshToken: cookies[cookieNames.refreshTokenKey],
        scopes: cookies[cookieNames.scopeKey],
        nonce: cookies['spa-auth-edge-nonce'],
        nonceHmac: cookies['spa-auth-edge-nonce-hmac'],
        pkce: cookies['spa-auth-edge-pkce'],
    };
}
exports.extractAndParseCookies = extractAndParseCookies;
exports.generateCookieHeaders = {
    signIn: (param) => _generateCookieHeaders({ ...param, event: 'signIn' }),
    refresh: (param) => _generateCookieHeaders({ ...param, event: 'refresh' }),
    signOut: (param) => _generateCookieHeaders({ ...param, event: 'signOut' }),
};
function _generateCookieHeaders(param) {
    /**
     * Generate cookie headers for the following scenario's:
     *  - signIn: called from Parse Auth lambda, when receiving fresh JWTs from IDP
     *  - sign out: called from Sign Out Lambda, when the user visits the sign out URL
     *  - refresh: called from Refresh Auth lambda, when receiving fresh ID and Access JWTs from IDP
     *
     *   Note that there are other places besides this helper function where cookies can be set (search codebase for "set-cookie")
     */
    const cookies = {};
    let cookieNames;
    cookieNames = getCookieNames(param.clientId, param.idTokenCookieName);
    // Construct object with the cookies
    Object.assign(cookies, {
        [cookieNames.scopeKey]: `${param.oauthScopes.join(' ')}; ${param.cookieSettings.accessToken}`,
    });
    // Set JWTs in the cookies
    cookies[cookieNames.accessTokenKey] = `${param.tokens.access}; ${param.cookieSettings.accessToken}`;
    if (param.tokens.id) {
        cookies[cookieNames.idTokenKey] = `${param.tokens.id}; ${param.cookieSettings.idToken}`;
        cookies[cookieNames.idToken2Key] = `${param.tokens.id}; ${param.cookieSettings.idToken}`;
    }
    if (param.tokens.refresh) {
        cookies[cookieNames.refreshTokenKey] = `${param.tokens.refresh}; ${param.cookieSettings.refreshToken}`;
    }
    if (param.event === 'signOut') {
        // Expire all cookies
        Object.keys(cookies).forEach((key) => (cookies[key] = expireCookie(cookies[key])));
    }
    // Always expire nonce, nonceHmac and pkce - this is valid in all scenario's:
    // * event === 'newTokens' --> you just signed in and used your nonce and pkce successfully, don't need them no more
    // * event === 'refreshFailed' --> you are signed in already, why do you still have a nonce?
    // * event === 'signOut' --> clear ALL cookies anyway
    [
        'spa-auth-edge-nonce',
        'spa-auth-edge-nonce-hmac',
        'spa-auth-edge-pkce',
    ].forEach((key) => {
        cookies[key] = expireCookie(`;${param.cookieSettings.nonce}`);
    });
    // Return cookie object in format of CloudFront headers
    return Object.entries({
        ...cookies,
    }).map(([k, v]) => ({ key: 'set-cookie', value: `${k}=${v}` }));
}
function expireCookie(cookie = '') {
    const cookieParts = cookie
        .split(';')
        .map((part) => part.trim())
        .filter((part) => !part.toLowerCase().startsWith('max-age'))
        .filter((part) => !part.toLowerCase().startsWith('expires'));
    const expires = `Expires=${new Date(0).toUTCString()}`;
    const [, ...settings] = cookieParts; // first part is the cookie value, which we'll clear
    return ['', ...settings, expires].join('; ');
}
function decodeToken(jwt) {
    const tokenBody = jwt.split('.')[1];
    const decodableTokenBody = tokenBody.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(decodableTokenBody, 'base64').toString());
}
const AGENT = new https_1.Agent({ keepAlive: true });
async function httpPostToIDPWithRetry(url, data, options, logger, method) {
    let attempts = 0;
    while (true) {
        ++attempts;
        try {
            return await (0, https_3.fetch)(url, data, {
                agent: AGENT,
                ...options,
                method,
            }).then((res) => {
                if (res.status !== 200) {
                    throw new Error(`Status is ${res.status}, expected 200`);
                }
                if (!res.headers['content-type']?.startsWith('application/json')) {
                    throw new Error(`Content-Type is ${res.headers['content-type']}, expected application/json`);
                }
                return {
                    ...res,
                    data: JSON.parse(res.data.toString()),
                };
            });
        }
        catch (err) {
            logger.debug(`HTTP ${method} to ${url} failed (attempt ${attempts}):`);
            logger.debug(err);
            if (attempts >= 5) {
                // Try 5 times at most
                logger.error(`No success after ${attempts} attempts, seizing further attempts`);
                throw err;
            }
            if (attempts >= 2) {
                // After attempting twice immediately, do some exponential backoff with jitter
                logger.debug(`Doing exponential backoff with jitter, before attempting HTTP ${method} again ...`);
                await new Promise((resolve) => setTimeout(resolve, 25 * (Math.pow(2, attempts) + Math.random() * attempts)));
                logger.debug(`Done waiting, will try HTTP ${method} again now`);
            }
        }
    }
}
exports.httpPostToIDPWithRetry = httpPostToIDPWithRetry;
function createErrorHtml(props) {
    const params = { ...props, region: process.env.AWS_REGION };
    return template_html_1.default.replace(/\${([^}]*)}/g, (_, v) => escapeHtml(params[v]) ?? '');
}
exports.createErrorHtml = createErrorHtml;
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') {
        return undefined;
    }
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
exports.urlSafe = {
    /*
          Functions to translate base64-encoded strings, so they can be used:
          - in URL's without needing additional encoding
          - in OAuth2 PKCE verifier
          - in cookies (to be on the safe side, as = + / are in fact valid characters in cookies)
  
          stringify:
              use this on a base64-encoded string to translate = + / into replacement characters
  
          parse:
              use this on a string that was previously urlSafe.stringify'ed to return it to
              its prior pure-base64 form. Note that trailing = are not added, but NodeJS does not care
      */
    stringify: (b64encodedString) => b64encodedString.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_'),
    parse: (b64encodedString) => b64encodedString.replace(/-/g, '+').replace(/_/g, '/'),
};
function sign(stringToSign, secret, signatureLength) {
    const digest = (0, crypto_1.createHmac)('sha256', secret)
        .update(stringToSign)
        .digest('base64')
        .slice(0, signatureLength);
    const signature = exports.urlSafe.stringify(digest);
    return signature;
}
exports.sign = sign;
function timestampInSeconds() {
    return (Date.now() / 1000) | 0;
}
exports.timestampInSeconds = timestampInSeconds;
class RequiresConfirmationError extends Error {
}
exports.RequiresConfirmationError = RequiresConfirmationError;
function generateSecret(allowedCharacters, secretLength) {
    return [...new Array(secretLength)]
        .map(() => allowedCharacters[(0, crypto_1.randomInt)(0, allowedCharacters.length)])
        .join('');
}
exports.generateSecret = generateSecret;
function ensureValidRedirectPath(path) {
    if (typeof path !== 'string')
        return '/';
    return path.startsWith('/') ? path : `/${path}`;
}
exports.ensureValidRedirectPath = ensureValidRedirectPath;
async function fetchUrl(uri) {
    return new Promise((resolve, reject) => {
        const req = (0, https_2.request)(uri, (res) => (0, stream_1.pipeline)([res, collectBuffer(resolve)], done));
        function done(error) {
            if (!error)
                return;
            req.destroy(error);
            reject(error);
        }
        req.on('error', done);
        req.end();
    });
}
exports.fetchUrl = fetchUrl;
const collectBuffer = (callback) => {
    const chunks = [];
    return new stream_1.Writable({
        write: (chunk, _encoding, done) => {
            try {
                chunks.push(chunk);
                done();
            }
            catch (err) {
                done(err);
            }
        },
        final: (done) => {
            try {
                callback(Buffer.concat(chunks));
                done();
            }
            catch (err) {
                done(err);
            }
        },
    });
};
