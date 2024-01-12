// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { createHmac, randomInt } from 'crypto';
import { readFileSync } from 'fs';
import { Agent, RequestOptions } from 'https';
import { request } from 'https';
import { Writable, pipeline } from 'stream';
import { formatWithOptions } from 'util';
import { CloudFrontHeaders } from 'aws-lambda';
import { parse } from 'cookie';
import html from './error-page/template.html';
import { fetch } from './https';

export interface CookieSettings {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  nonce: string;
  [key: string]: string;
}

function getDefaultCookieSettings(props: {
  redirectPathAuthRefresh: string;
}): CookieSettings {
  // Defaults can be overridden by the user (CloudFormation Stack parameter) but should be solid enough for most purposes
  return {
    idToken: 'Path=/; Secure; SameSite=Lax',
    accessToken: 'Path=/; Secure; HttpOnly; SameSite=Lax',
    refreshToken: 'Path=/; Secure; HttpOnly; SameSite=Lax',
    nonce: 'Path=/; Secure; HttpOnly; SameSite=Lax',
  };
}

export interface HttpHeaders {
  [key: string]: string;
}

interface ConfigFromDisk {
  logLevel: keyof typeof LogLevel;
}

interface ConfigFromDiskWithHeaders extends ConfigFromDisk {
  httpHeaders: HttpHeaders;
}

interface ConfigFromDiskComplete extends ConfigFromDiskWithHeaders {
  userPoolArn: string;
  clientId: string;
  oauthScopes: string[];
  authEndpoint: string;
  accessTokenEndpoint: string;
  introspectEndpoint: string;
  pingEndSessionEndpoint: string;
  redirectPathSignIn: string;
  redirectPathSignOut: string;
  signOutUrl: string;
  redirectPathAuthRefresh: string;
  cookieSettings: CookieSettings;
  clientSecret: string;
  nonceSigningSecret: string;
  secretAllowedCharacters?: string;
  pkceLength?: number;
  nonceLength?: number;
  nonceMaxAge?: number;
  idTokenCookieName: string;
  staticContentPathPattern: string,
  staticContentRootObject: string
}

function isConfigWithHeaders(config: any): config is ConfigFromDiskComplete {
  return config.httpHeaders !== undefined;
}

function isCompleteConfig(config: any): config is ConfigFromDiskComplete {
  return true;
}

enum LogLevel {
  'none' = 0,
  'error' = 10,
  'warn' = 20,
  'info' = 30,
  'debug' = 40,
}

class Logger {
  constructor(private logLevel: LogLevel) { }

  private format(args: unknown[], depth = 10) {
    return args.map((arg) => formatWithOptions({ depth }, arg)).join(' ');
  }

  public info(...args: unknown[]) {
    if (this.logLevel >= LogLevel.info) {
      console.log(this.format(args));
    }
  }
  public warn(...args: unknown[]) {
    if (this.logLevel >= LogLevel.warn) {
      console.warn(this.format(args));
    }
  }
  public error(...args: unknown[]) {
    if (this.logLevel >= LogLevel.error) {
      console.error(this.format(args));
    }
  }
  public debug(...args: unknown[]) {
    if (this.logLevel >= LogLevel.debug) {
      console.trace(this.format(args));
    }
  }
}

export interface Config extends ConfigFromDisk {
  logger: Logger;
}

export interface ConfigWithHeaders extends Config, ConfigFromDiskWithHeaders {
  cloudFrontHeaders: CloudFrontHeaders;
}

export interface CompleteConfig
  extends ConfigWithHeaders,
  ConfigFromDiskComplete {
  cloudFrontHeaders: CloudFrontHeaders;
  secretAllowedCharacters: string;
  pkceLength: number;
  nonceLength: number;
  nonceMaxAge: number;
}

export function getConfig(): Config {
  const config = JSON.parse(
    readFileSync(`${__dirname}/configuration.json`).toString('utf8'),
  ) as ConfigFromDisk;
  return {
    logger: new Logger(LogLevel[config.logLevel]),
    ...config,
  };
}

export function getConfigWithHeaders(): ConfigWithHeaders {
  const config = getConfig();

  if (!isConfigWithHeaders(config)) {
    throw new Error('Incomplete config in configuration.json');
  }

  return {
    cloudFrontHeaders: asCloudFrontHeaders(config.httpHeaders),
    ...config,
  };
}

export function getCompleteConfig(): CompleteConfig {
  const config = getConfigWithHeaders();

  if (!isCompleteConfig(config)) {
    throw new Error('Incomplete config in configuration.json');
  }

  // Derive cookie settings by merging the defaults with the explicitly provided values
  const defaultCookieSettings = getDefaultCookieSettings({
    redirectPathAuthRefresh: config.redirectPathAuthRefresh,
  });
  const cookieSettings = config.cookieSettings
    ? (Object.fromEntries(
      Object.entries({
        ...defaultCookieSettings,
        ...config.cookieSettings,
      }).map(([k, v]) => [
        k,
        v || defaultCookieSettings[k as keyof CookieSettings],
      ]),
    ) as CookieSettings)
    : defaultCookieSettings;

  // Defaults for nonce and PKCE
  const defaults = {
    secretAllowedCharacters:
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~',
    pkceLength: 43, // Should be between 43 and 128 - per spec
    nonceLength: 16,
    nonceMaxAge:
      (cookieSettings?.nonce &&
        parseInt(parse(cookieSettings.nonce.toLowerCase())['max-age'])) ||
      60 * 60 * 24,
  };

  return {
    ...defaults,
    ...config,
    cookieSettings,
  };
}


type Cookies = { [key: string]: string };

function extractCookiesFromHeaders(headers: CloudFrontHeaders) {
  // Cookies are present in the HTTP header "Cookie" that may be present multiple times.
  // This utility function parses occurrences  of that header and splits out all the cookies and their values
  // A simple object is returned that allows easy access by cookie name: e.g. cookies["nonce"]
  if (!headers.cookie) {
    return {};
  }
  const cookies = headers.cookie.reduce(
    (reduced, header) => Object.assign(reduced, parse(header.value)),
    {} as Cookies,
  );

  return cookies;
}

export function asCloudFrontHeaders(headers: HttpHeaders): CloudFrontHeaders {
  if (!headers) return {};
  // Turn a regular key-value object into the explicit format expected by CloudFront
  return Object.entries(headers).reduce(
    (reduced, [key, value]) =>
      Object.assign(reduced, {
        [key.toLowerCase()]: [
          {
            key,
            value,
          },
        ],
      }),
    {} as CloudFrontHeaders,
  );
}

export function getCookieNames(clientId: string, idTokenCookieName: string) {
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

export function extractAndParseCookies(
  headers: CloudFrontHeaders,
  clientId: string,
  idTokenCookieName: string,
) {
  const cookies = extractCookiesFromHeaders(headers);
  if (!cookies) {
    return {};
  }

  let cookieNames: { [name: string]: string };

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

interface GenerateCookieHeadersParam {
  clientId: string;
  oauthScopes: string[];
  cookieSettings: CookieSettings;
  idTokenCookieName: string;
  tokens: {
    id?: string;
    access: string;
    refresh?: string;
  };
}

export const generateCookieHeaders = {
  signIn: (
    param: GenerateCookieHeadersParam & {
      tokens: { id: string; access: string; refresh: string };
    },
  ) => _generateCookieHeaders({ ...param, event: 'signIn' }),
  refresh: (
    param: GenerateCookieHeadersParam & {
      tokens: { access: string };
    },
  ) => _generateCookieHeaders({ ...param, event: 'refresh' }),
  signOut: (param: GenerateCookieHeadersParam) =>
    _generateCookieHeaders({ ...param, event: 'signOut' }),
};

function _generateCookieHeaders(
  param: GenerateCookieHeadersParam & {
    event: 'signIn' | 'signOut' | 'refresh';
  },
) {
  /**
   * Generate cookie headers for the following scenario's:
   *  - signIn: called from Parse Auth lambda, when receiving fresh JWTs from IDP
   *  - sign out: called from Sign Out Lambda, when the user visits the sign out URL
   *  - refresh: called from Refresh Auth lambda, when receiving fresh ID and Access JWTs from IDP
   *
   *   Note that there are other places besides this helper function where cookies can be set (search codebase for "set-cookie")
   */

  const cookies: Cookies = {};
  let cookieNames: ReturnType<typeof getCookieNames>;

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
    Object.keys(cookies).forEach(
      (key) => (cookies[key] = expireCookie(cookies[key])),
    );
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

function expireCookie(cookie: string = '') {
  const cookieParts = cookie
    .split(';')
    .map((part) => part.trim())
    .filter((part) => !part.toLowerCase().startsWith('max-age'))
    .filter((part) => !part.toLowerCase().startsWith('expires'));
  const expires = `Expires=${new Date(0).toUTCString()}`;
  const [, ...settings] = cookieParts; // first part is the cookie value, which we'll clear
  return ['', ...settings, expires].join('; ');
}

function decodeToken(jwt: string) {
  const tokenBody = jwt.split('.')[1];
  const decodableTokenBody = tokenBody.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(decodableTokenBody, 'base64').toString());
}

const AGENT = new Agent({ keepAlive: true });

export async function httpPostToIDPWithRetry(
  url: string,
  data: Buffer,
  options: RequestOptions,
  logger: Logger,
  method: 'POST' | 'GET',
) {
  let attempts = 0;
  while (true) {
    ++attempts;
    try {
      return await fetch(url, data, {
        agent: AGENT,
        ...options,
        method,
      }).then((res) => {
        if (res.status !== 200) {
          throw new Error(`Status is ${res.status}, expected 200`);
        }
        if (!res.headers['content-type']?.startsWith('application/json')) {
          throw new Error(
            `Content-Type is ${res.headers['content-type']}, expected application/json`,
          );
        }
        return {
          ...res,
          data: JSON.parse(res.data.toString()),
        };
      });
    } catch (err) {
      logger.debug(`HTTP ${method} to ${url} failed (attempt ${attempts}):`);
      logger.debug(err);
      if (attempts >= 5) {
        // Try 5 times at most
        logger.error(
          `No success after ${attempts} attempts, seizing further attempts`,
        );
        throw err;
      }
      if (attempts >= 2) {
        // After attempting twice immediately, do some exponential backoff with jitter
        logger.debug(
          `Doing exponential backoff with jitter, before attempting HTTP ${method} again ...`,
        );
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            25 * (Math.pow(2, attempts) + Math.random() * attempts),
          ),
        );
        logger.debug(`Done waiting, will try HTTP ${method} again now`);
      }
    }
  }
}

export function createErrorHtml(props: {
  title: string;
  message: string;
  expandText?: string;
  details?: string;
  linkUri: string;
  linkText: string;
}) {
  const params = { ...props, region: process.env.AWS_REGION };
  return html.replace(
    /\${([^}]*)}/g,
    (_: any, v: keyof typeof params) => escapeHtml(params[v]) ?? '',
  );
}

function escapeHtml(unsafe: unknown) {
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

export const urlSafe = {
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
  stringify: (b64encodedString: string) =>
    b64encodedString.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_'),
  parse: (b64encodedString: string) =>
    b64encodedString.replace(/-/g, '+').replace(/_/g, '/'),
};

export function sign(
  stringToSign: string,
  secret: string,
  signatureLength: number,
) {
  const digest = createHmac('sha256', secret)
    .update(stringToSign)
    .digest('base64')
    .slice(0, signatureLength);
  const signature = urlSafe.stringify(digest);
  return signature;
}

export function timestampInSeconds() {
  return (Date.now() / 1000) | 0;
}

export class RequiresConfirmationError extends Error { }

export function generateSecret(
  allowedCharacters: string,
  secretLength: number,
) {
  return [...new Array(secretLength)]
    .map(() => allowedCharacters[randomInt(0, allowedCharacters.length)])
    .join('');
}

export function ensureValidRedirectPath(path: unknown) {
  if (typeof path !== 'string') return '/';
  return path.startsWith('/') ? path : `/${path}`;
}

export async function fetchUrl(uri: string) {
  return new Promise<Buffer>((resolve, reject) => {
    const req = request(uri, (res) =>
      pipeline([res, collectBuffer(resolve)], done),
    );

    function done(error?: Error | null) {
      if (!error) return;
      req.destroy(error);
      reject(error);
    }

    req.on('error', done);

    req.end();
  });
}

const collectBuffer = (callback: (collectedBuffer: Buffer) => void) => {
  const chunks = [] as Buffer[];
  return new Writable({
    write: (chunk, _encoding, done) => {
      try {
        chunks.push(chunk);
        done();
      } catch (err) {
        done(err as Error);
      }
    },
    final: (done) => {
      try {
        callback(Buffer.concat(chunks));
        done();
      } catch (err) {
        done(err as Error);
      }
    },
  });
};