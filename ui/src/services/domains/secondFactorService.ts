import { requestJSON } from "../shared/rest";
import type { LoginResponse, SecondFactorEnrolment, SecondFactorStatus } from "../types";

/**
 * The steps after a password, for a staff account that signs in with an
 * authenticator app, and the account's own app once signed in.
 *
 * The sign-in steps take no session (auth: false): the challenge the password
 * answered with is what they act on. A wrong code answers 401 there, which is
 * a wrong code and not a session that ended.
 */
export const secondFactorService = {
  /** Finishes a sign-in with the app's code or a recovery code. */
  signInWithCode(challenge: string, code: string, signal?: AbortSignal) {
    return requestJSON<LoginResponse>("/login/code", {
      method: "POST",
      body: { challenge, code },
      signal,
      auth: false,
    });
  },

  /** Makes the secret an authenticator app is set up from. */
  beginEnrolment(challenge: string, signal?: AbortSignal) {
    return requestJSON<SecondFactorEnrolment>("/login/enrol", {
      method: "POST",
      body: { challenge },
      signal,
      auth: false,
    });
  },

  /**
   * Finishes setting the app up with its first code. Answers the session and
   * the recovery codes, which are never shown again.
   */
  confirmEnrolment(challenge: string, code: string, signal?: AbortSignal) {
    return requestJSON<LoginResponse>("/login/enrol/confirm", {
      method: "POST",
      body: { challenge, code },
      signal,
      auth: false,
    });
  },

  /** Whether the signed-in account has an app, and how many recovery codes are left. */
  secondFactorStatus(signal?: AbortSignal) {
    return requestJSON<SecondFactorStatus>("/users/me/two-factor", { signal });
  },

  /**
   * Replaces the signed-in account's recovery codes. Takes a current code from
   * the app: a wrong one is a 401 about the code, not the session.
   */
  async regenerateRecoveryCodes(code: string, signal?: AbortSignal) {
    const data = await requestJSON<{ recovery_codes?: string[] }>("/users/me/two-factor/recovery-codes", {
      method: "POST",
      body: { code },
      signal,
      checksCredentials: true,
    });
    return data.recovery_codes ?? [];
  },

  /**
   * Removes another account's app, as its administrator. Their sessions end
   * and their next sign-in sets up a new one.
   */
  async resetSecondFactor(userId: string, signal?: AbortSignal) {
    await requestJSON<Record<string, never>>(`/users/${encodeURIComponent(userId)}/two-factor`, {
      method: "DELETE",
      signal,
    });
  },
};
