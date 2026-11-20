package signin

import "strings"

// Settings that decide whether a password sign-in asks for a code, read as
// the engine read them.
const (
	// EnvTwoFactor is "required" (the default) or "optional".
	EnvTwoFactor = "METIS_TWO_FACTOR"
	// EnvDevMode marks a development stack. "optional" is honoured only beside
	// it, so a production server cannot be switched to password-only sign-in
	// by one setting copied from a developer's machine.
	EnvDevMode = "METIS_DEV_MODE"
)

// Policy is whether every staff password sign-in asks for a code.
type Policy int

const (
	// Required asks every account: one without an authenticator app sets one
	// up before it gets a session.
	Required Policy = iota
	// Optional asks only accounts that set up an app. Development only.
	Optional
)

// ReadPolicy reads the policy, and a sentence for the startup log when what
// was written is not what applies. Anything but a clean "optional" beside
// METIS_DEV_MODE=true is required: a typo must not switch a control off.
func ReadPolicy(getenv func(string) string) (Policy, string) {
	asked := strings.ToLower(strings.TrimSpace(getenv(EnvTwoFactor)))
	switch asked {
	case "", "required":
		return Required, ""
	case "optional":
		if strings.EqualFold(strings.TrimSpace(getenv(EnvDevMode)), "true") {
			return Optional, "Two-factor sign-in is optional: accounts without an authenticator app " +
				"sign in with a password alone. This is for development only; unset METIS_TWO_FACTOR anywhere else."
		}
		return Required, "METIS_TWO_FACTOR=optional is honoured only beside METIS_DEV_MODE=true, " +
			"so two-factor sign-in stays required."
	default:
		return Required, "METIS_TWO_FACTOR is \"" + asked + "\", which is neither \"required\" nor " +
			"\"optional\", so two-factor sign-in stays required."
	}
}
