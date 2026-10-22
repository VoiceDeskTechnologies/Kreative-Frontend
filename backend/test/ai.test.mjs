import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../dist/app.js";
import { loadConfig } from "../dist/config/env.js";

const requestBody = {
  conversation: [
    {
      role: "user",
      content: "Make the vocal smoother and leave the drums alone.",
    },
  ],
  project: {
    selectedTrackId: "vocal-1",
    masterVolume: 0,
    tracks: [
      {
        id: "vocal-1",
        name: "Lead Vocal",
        volume: 0,
        pan: 0,
        mute: false,
        solo: false,
        inserts: Array(10).fill(null),
        stats: { peakDb: -3, truePeakDb: -2.8, rmsDb: -18, crest: 15, clips: 0, duration: 120 },
        fx: { compOn: false, eqBands: [] },
      },
      {
        id: "drums-1",
        name: "Drums",
        volume: -2,
        pan: 0,
        mute: false,
        solo: false,
        inserts: Array(10).fill(null),
        stats: { peakDb: -2, truePeakDb: -1.8, rmsDb: -14, crest: 10, clips: 0, duration: 120 },
        fx: { compOn: false, eqBands: [] },
      },
    ],
  },
};

test("AI status is explicit when no provider is configured", async () => {
  const app = buildApp(loadConfig({ NODE_ENV: "test" }));
  try {
    const status = await app.inject({ method: "GET", url: "/ai/status" });
    assert.deepEqual(status.json(), {
      available: false,
      provider: null,
      sendsAudio: false,
      requiresConsent: true,
    });
    const response = await app.inject({
      method: "POST",
      url: "/ai/chat",
      payload: requestBody,
    });
    assert.equal(response.statusCode, 503);
    assert.equal(response.json().code, "AI_NOT_CONFIGURED");
  } finally {
    await app.close();
  }
});

test("AI mix plans are validated before being returned to the browser", async () => {
  const config = loadConfig({
    NODE_ENV: "test",
    AI_PROVIDER: "openai",
    OPENAI_API_KEY: "test-server-key",
    OPENAI_MODEL: "test-model",
  });
  let authorization;
  const fetcher = async (_url, init) => {
    authorization = new Headers(init.headers).get("authorization");
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                message:
                  "I will smooth the lead vocal and keep the drums unchanged.",
                actions: [
                  {
                    type: "insertPlugin",
                    trackId: "vocal-1",
                    slot: 0,
                    plugin: "Smoothen",
                  },
                  {
                    type: "insertPlugin",
                    trackId: "vocal-1",
                    slot: 1,
                    plugin: "KREATIVE Pitch",
                  },
                  {
                    type: "setFx",
                    trackId: "vocal-1",
                    patch: { smoothenOn: true, smoothenTarget: -19 },
                  },
                ],
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  const app = buildApp(config, { fetcher });
  try {
    const response = await app.inject({
      method: "POST",
      url: "/ai/chat",
      payload: requestBody,
    });
    assert.equal(response.statusCode, 200);
    assert.equal(authorization, "Bearer test-server-key");
    assert.equal(response.json().actions.length, 3);
    assert.equal(response.json().actions[1].plugin, "KREATIVE Pitch");
    assert.equal(response.json().actions[2].patch.smoothenTarget, -19);
  } finally {
    await app.close();
  }
});

test("AI mix plans with out-of-range settings are rejected without actions", async () => {
  const config = loadConfig({
    NODE_ENV: "test",
    AI_PROVIDER: "openai",
    OPENAI_API_KEY: "test-server-key",
  });
  const fetcher = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                message: "Applied.",
                actions: [
                  {
                    type: "setFx",
                    trackId: "vocal-1",
                    patch: { compThreshold: 40 },
                  },
                ],
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  const app = buildApp(config, { fetcher });
  try {
    const response = await app.inject({
      method: "POST",
      url: "/ai/chat",
      payload: requestBody,
    });
    assert.equal(response.statusCode, 502);
    assert.equal(response.json().code, "AI_REQUEST_FAILED");
    assert.match(response.json().error, /No changes were applied/);
  } finally {
    await app.close();
  }
});

test("AI rejects changes targeting tracks absent from the supplied project", async () => {
  const config = loadConfig({
    NODE_ENV: "test",
    AI_PROVIDER: "openai",
    OPENAI_API_KEY: "test-server-key",
  });
  const app = buildApp(config, {
    fetcher: async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  message: "Changing the lead.",
                  actions: [
                    {
                      type: "setTrackMix",
                      trackId: "unknown-track",
                      volume: -3,
                    },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  });
  try {
    const response = await app.inject({
      method: "POST",
      url: "/ai/chat",
      payload: requestBody,
    });
    assert.equal(response.statusCode, 502);
    assert.match(response.json().error, /unknown track/i);
  } finally {
    await app.close();
  }
});

test("AI request validation rejects audio-bearing fields and unknown request properties", async () => {
  const app = buildApp(loadConfig({ NODE_ENV: "test" }));
  try {
    const response = await app.inject({
      method: "POST",
      url: "/ai/chat",
      payload: { ...requestBody, audio: "encoded-audio" },
    });
    assert.equal(response.statusCode, 400);
  } finally {
    await app.close();
  }
});
