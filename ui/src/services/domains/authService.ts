import { requestJSON } from "../shared/rest";
import type { LoginResponse } from "../types";

export const authService = {
  async login(username: string, password: string, signal?: AbortSignal) {
    try {
      const data = await requestJSON<LoginResponse>("/login", {
        method: "POST",
        body: { username, password },
        signal,
        auth: false,
      });

      return {
        user: data.user ?? null,
        token: data.token ?? null,
        // A correct password for an account that needs a code: no session
        // yet, and the step still to take.
        secondFactor: data.second_factor ?? null,
        challenge: data.challenge ?? null,
        err: null,
      };
    } catch (error) {
      return {
        user: null,
        token: null,
        secondFactor: null,
        challenge: null,
        err: error instanceof Error ? error : new Error("Login failed"),
      };
    }
  },
};
