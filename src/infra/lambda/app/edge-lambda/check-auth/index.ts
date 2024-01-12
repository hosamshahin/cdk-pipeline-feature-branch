// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { createHash } from 'crypto';
import { stringify as stringifyQueryString } from 'querystring';
import { CloudFrontRequestHandler } from 'aws-lambda';
import * as common from '../shared/shared';
import * as jose from 'jose'

const CONFIG = common.getCompleteConfig();
CONFIG.logger.debug('Configuration loaded:', CONFIG);

export const handler: CloudFrontRequestHandler = async (event) => {
  CONFIG.logger.debug('Event:', event);
  const request = event.Records[0].cf.request;
  const domainName = request.headers.host[0].value;
  const requestedUri = `${request.uri}${request.querystring ? '?' + request.querystring : ''}`;
  try {

    const cookies = common.extractAndParseCookies(
      request.headers,
      CONFIG.clientId,
      CONFIG.idTokenCookieName,
    );
    CONFIG.logger.debug('Extracted cookies:', cookies);

    // If there's no ID token in your cookies, then you are not signed in yet
    if (!cookies.accessToken) {
      throw new Error('No access token present in cookies');
    }

    const headers: { 'Content-Type': string; Authorization?: string } = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    if (CONFIG.clientSecret) {
      const encodedSecret = Buffer.from(
        `${CONFIG.clientId}:${CONFIG.clientSecret}`,
      ).toString('base64');
      headers.Authorization = `Basic ${encodedSecret}`;
    }

    const body = stringifyQueryString({
      token: cookies.accessToken,
    });

    const accessTokenInfo: any = await common
      .httpPostToIDPWithRetry(
        CONFIG.introspectEndpoint,
        Buffer.from(body),
        { headers },
        CONFIG.logger,
        'POST',
      )
      .catch((err) => {
        throw new Error(`Failed to get access token info: ${err}`);
      });

    CONFIG.logger.debug(`accessTokenInfo: ${JSON.stringify(accessTokenInfo)}`);
    if (!accessTokenInfo.data.active) {
      CONFIG.logger.debug('Redirecting user to refresh path');
      return redirectToRefreshPath({ domainName, requestedUri });
    }

    // Return the request unaltered to allow access to the resource:
    request.headers["authorization-ltio"] = [{ "key": "authorization-ltio", "value": "Bearer " + cookies.idToken }];
    CONFIG.logger.debug('Access allowed:', request);

    // validate the idToken
    const url = `https://sso.google.com/pf/JWKS`;
    CONFIG.logger.debug(`Fetching JWKS for ${url}`);

    const jwks = (await common.fetchUrl(url)).toString();
    CONFIG.logger.debug(`Fetched JWKS: ${jwks}`);

    const JWKS = jose.createLocalJWKSet(JSON.parse(jwks))

    const { payload, protectedHeader } = await jose.jwtVerify(cookies.idToken!, JWKS, {
      issuer: 'https://sso.google.com',
      audience: CONFIG.clientId,
    })
    CONFIG.logger.debug(protectedHeader)
    CONFIG.logger.debug(payload)

    if (request.uri.includes(CONFIG.staticContentPathPattern) && !request.uri.includes('.')) {
      request.uri = CONFIG.staticContentRootObject;
    }

    return request;
  } catch (err) {
    CONFIG.logger.info('Access denied:', err);

    if (err instanceof jose.errors.JWTExpired) {
      CONFIG.logger.debug("It is ok to use expired idToken since we are using accessToken to maintain the session");
      CONFIG.logger.debug('Access allowed dispite the expired idToken:', request);
      return request;
    }

    CONFIG.logger.debug('Redirecting user to IDP to sign-in');
    return redirectToIDP({ domainName, requestedUri });
  }
};

function redirectToIDP({
  domainName,
  requestedUri,
}: {
  domainName: string;
  requestedUri: string;
}) {
  // Generate new state which involves a signed nonce
  // This way we can check later whether the sign-in redirect was done by us (it should, to prevent CSRF attacks)
  const nonce = generateNonce();
  const state = {
    nonce,
    nonceHmac: common.sign(
      nonce,
      CONFIG.nonceSigningSecret,
      CONFIG.nonceLength,
    ),
    ...generatePkceVerifier(),
  };
  CONFIG.logger.debug('Using new state\n', state);

  const loginQueryString = stringifyQueryString({
    redirect_uri: `https://${domainName}${CONFIG.redirectPathSignIn}`,
    response_type: 'code',
    client_id: CONFIG.clientId,
    state:
      // Encode the state variable as base64 to avoid a bug in Cognito hosted UI when using multiple identity providers
      // Cognito decodes the URL, causing a malformed link due to the JSON string, and results in an empty 400 response from Cognito.
      common.urlSafe.stringify(
        Buffer.from(
          JSON.stringify({ nonce: state.nonce, requestedUri }),
        ).toString('base64'),
      ),
    scope: CONFIG.oauthScopes.join(' '),
    code_challenge_method: 'S256',
    code_challenge: state.pkceHash,
  });

  // Return redirect to Cognito Hosted UI for sign-in
  const response = {
    status: '307',
    statusDescription: 'Temporary Redirect',
    headers: {
      'location': [
        {
          key: 'location',
          value: `${CONFIG.authEndpoint}?${loginQueryString}`,
        },
      ],
      'set-cookie': [
        ...getNonceCookies({ nonce, ...CONFIG }),
        {
          key: 'set-cookie',
          value: `spa-auth-edge-pkce=${encodeURIComponent(state.pkce)}; ${CONFIG.cookieSettings.nonce
            }`,
        },
      ],
      ...CONFIG.cloudFrontHeaders,
    },
  };
  CONFIG.logger.debug('Returning response:\n', response);
  return response;
}

function redirectToRefreshPath({
  domainName,
  requestedUri,
}: {
  domainName: string;
  requestedUri: string;
}) {
  const nonce = generateNonce();
  const response = {
    status: '307',
    statusDescription: 'Temporary Redirect',
    headers: {
      'location': [
        {
          key: 'location',
          value: `https://${domainName}${CONFIG.redirectPathAuthRefresh
            }?${stringifyQueryString({ requestedUri, nonce })}`,
        },
      ],
      'set-cookie': getNonceCookies({ nonce, ...CONFIG }),
      ...CONFIG.cloudFrontHeaders,
    },
  };
  CONFIG.logger.debug('Returning response:\n', response);
  return response;
}

function showContactAdminErrorPage({
  err,
  domainName,
}: {
  err: unknown;
  domainName: string;
}) {
  const response = {
    body: common.createErrorHtml({
      title: 'Not Authorized',
      message:
        'You are not authorized for this site. Please contact the admin.',
      expandText: 'Click for details',
      details: `${err}`,
      linkUri: `https://${domainName}${CONFIG.signOutUrl}`,
      linkText: 'Try again',
    }),
    status: '200',
    headers: {
      ...CONFIG.cloudFrontHeaders,
      'content-type': [
        {
          key: 'Content-Type',
          value: 'text/html; charset=UTF-8',
        },
      ],
    },
  };
  CONFIG.logger.debug('Returning response:\n', response);
  return response;
}

function getNonceCookies({
  nonce,
  nonceLength,
  nonceSigningSecret,
  cookieSettings,
}: {
  nonce: string;
  nonceLength: number;
  nonceSigningSecret: string;
  cookieSettings: {
    nonce: string;
  };
}) {
  return [
    {
      key: 'set-cookie',
      value: `spa-auth-edge-nonce=${encodeURIComponent(nonce)}; ${cookieSettings.nonce
        }`,
    },
    {
      key: 'set-cookie',
      value: `spa-auth-edge-nonce-hmac=${encodeURIComponent(
        common.sign(nonce, nonceSigningSecret, nonceLength),
      )}; ${cookieSettings.nonce}`,
    },
  ];
}

function generatePkceVerifier() {
  const pkce = common.generateSecret(
    CONFIG.secretAllowedCharacters,
    CONFIG.pkceLength,
  );
  const verifier = {
    pkce,
    pkceHash: common.urlSafe.stringify(
      createHash('sha256').update(pkce, 'utf8').digest('base64'),
    ),
  };
  CONFIG.logger.debug('Generated PKCE verifier:\n', verifier);
  return verifier;
}

function generateNonce() {
  const randomString = common.generateSecret(
    CONFIG.secretAllowedCharacters,
    CONFIG.nonceLength,
  );
  const nonce = `${common.timestampInSeconds()}T${randomString}`;
  CONFIG.logger.debug('Generated new nonce:', nonce);
  return nonce;
}