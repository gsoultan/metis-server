import { afterEach, describe, expect, it } from "bun:test";
import { processService } from "../api";
import { secondFactorService } from "./secondFactorService";
import { API_BASE_URL } from "../shared/config";
import { stubFetch } from "../shared/stubbedFetch";

describe("two-factor sign-in", () => {
  let restore = () => {};
  afterEach(() => restore());

  it("reads a password that still needs a code as a challenge, not a session", async () => {
    const stub = stubFetch({ second_factor: "code", challenge: "ch-1", challenge_expires_at: "2026-11-17T10:05:00Z" });
    restore = stub.restore;

    const reply = await processService.login("grace", "secret");

    expect(reply.token).toBeNull();
    expect(reply.secondFactor).toBe("code");
    expect(reply.challenge).toBe("ch-1");
  });

  it("sends the challenge and the code to finish signing in", async () => {
    const stub = stubFetch({ token: "session-1", user: { id: "u1", username: "grace" } });
    restore = stub.restore;

    const reply = await secondFactorService.signInWithCode("ch-1", "123456");

    expect(reply.token).toBe("session-1");
    expect(stub.sent[0].url).toBe(`${API_BASE_URL}/login/code`);
    expect(stub.sent[0].body).toEqual({ challenge: "ch-1", code: "123456" });
  });

  it("answers the new recovery codes", async () => {
    const stub = stubFetch({ recovery_codes: ["aaaaa-bbbbb", "ccccc-ddddd"] });
    restore = stub.restore;

    const codes = await secondFactorService.regenerateRecoveryCodes("654321");

    expect(codes).toEqual(["aaaaa-bbbbb", "ccccc-ddddd"]);
    expect(stub.sent[0].url).toBe(`${API_BASE_URL}/users/me/two-factor/recovery-codes`);
  });

  it("removes another account's app by its id", async () => {
    const stub = stubFetch({});
    restore = stub.restore;

    await secondFactorService.resetSecondFactor("u 2");

    expect(stub.sent[0].method).toBe("DELETE");
    expect(stub.sent[0].url).toBe(`${API_BASE_URL}/users/u%202/two-factor`);
  });
});
