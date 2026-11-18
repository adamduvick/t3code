import type { OpencodeClient } from "@opencode-ai/sdk/v2";
import { it as effectIt } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "vite-plus/test";

import * as OpenCodeRuntime from "./OpenCodeRuntime.ts";

describe("resolveOpenCodeServerPassword", () => {
  it("uses the settings password when local settings and environment differ", () => {
    expect(
      OpenCodeRuntime.resolveOpenCodeServerPassword(
        {
          external: false,
          serverPassword: "settings-password",
          environment: { OPENCODE_SERVER_PASSWORD: "environment-password" },
        },
        {},
      ),
    ).toBe("settings-password");
  });

  it("does not send an inherited local password to an external server", () => {
    expect(
      OpenCodeRuntime.resolveOpenCodeServerPassword(
        { external: true, environment: { OPENCODE_SERVER_PASSWORD: "local-secret" } },
        { OPENCODE_SERVER_PASSWORD: "inherited-secret" },
      ),
    ).toBeUndefined();
  });
});

function makeHealthClient(
  result: (options?: { readonly signal?: AbortSignal }) => Promise<unknown>,
): OpencodeClient {
  return {
    global: {
      health: result,
    },
  } as unknown as OpencodeClient;
}

describe("verifyOpenCodeServerVersion", () => {
  effectIt.effect("accepts a sufficiently new date-stamped build", () =>
    Effect.gen(function* () {
      for (const version of ["0.0.0-dev-202604200720", "0.0.0-main-202606291941"]) {
        const result = yield* OpenCodeRuntime.verifyOpenCodeServerVersion(
          makeHealthClient(() => Promise.resolve({ data: { healthy: true, version } })),
        );
        expect(result).toBe(version);
      }
    }),
  );

  effectIt.effect("rejects date-stamped builds before the supported cutoff", () =>
    Effect.gen(function* () {
      const error = yield* OpenCodeRuntime.verifyOpenCodeServerVersion(
        makeHealthClient(() =>
          Promise.resolve({ data: { healthy: true, version: "0.0.0-dev-202604200719" } }),
        ),
      ).pipe(Effect.flip);
      expect(error.detail).toContain("v0.0.0-dev-202604200719 is too old");
    }),
  );

  effectIt.effect("rejects malformed date-stamped build versions", () =>
    Effect.gen(function* () {
      const error = yield* OpenCodeRuntime.verifyOpenCodeServerVersion(
        makeHealthClient(() =>
          Promise.resolve({ data: { healthy: true, version: "0.0.0-main-20260420072" } }),
        ),
      ).pipe(Effect.flip);
      expect(error.detail).toContain("v0.0.0-main-20260420072 is too old");
    }),
  );

  effectIt.effect("rejects a server below the supported version", () =>
    Effect.gen(function* () {
      const error = yield* OpenCodeRuntime.verifyOpenCodeServerVersion(
        makeHealthClient(() => Promise.resolve({ data: { healthy: true, version: "1.14.18" } })),
      ).pipe(Effect.flip);
      expect(error).toBeInstanceOf(OpenCodeRuntime.OpenCodeRuntimeError);
      expect(error.detail).toContain("v1.14.18 is too old");
    }),
  );
});
