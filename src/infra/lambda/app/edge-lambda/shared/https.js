"use strict";
// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetch = void 0;
const https_1 = require("https");
const stream_1 = require("stream");
const DEFAULT_REQUEST_TIMEOUT = 4000; // 4 seconds
async function fetch(uri, data, options) {
    return new Promise((resolve, reject) => {
        const requestOptions = {
            signal: AbortSignal.timeout(DEFAULT_REQUEST_TIMEOUT),
            ...(options ?? {}),
        };
        const req = (0, https_1.request)(uri, requestOptions, (res) => (0, stream_1.pipeline)([
            res,
            collectBuffer((data) => resolve({ status: res.statusCode, headers: res.headers, data })),
        ], done));
        function done(error) {
            if (!error)
                return;
            req.destroy(error);
            reject(error);
        }
        req.on('error', done);
        req.end(data);
    });
}
exports.fetch = fetch;
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
