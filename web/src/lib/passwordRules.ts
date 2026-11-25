// What a password must be. Pure (sign-up, reset, change and the tests share it).
// Length matters most (NIST 800-63B): at least 8, and not one of the
// passwords every guesser tries first, nor the account's own email.

const COMMON = new Set([
  "123456", "1234567", "12345678", "123456789", "1234567890", "12345678910", "111111", "11111111", "000000", "00000000", "123123", "123123123",
  "654321", "666666", "888888", "987654321", "112233", "121212", "123321", "password", "password1", "password123", "passw0rd", "qwerty",
  "qwerty123", "qwertyuiop", "asdfgh", "asdfghjkl", "zxcvbnm", "1q2w3e4r", "1q2w3e4r5t", "qazwsx", "abc123", "abcd1234", "iloveyou", "admin",
  "admin123", "administrator", "welcome", "welcome1", "letmein", "monkey", "dragon", "football", "baseball", "sunshine", "princess", "master",
  "superman", "starwars", "remixt", "remixt123", "music", "music123", "password!", "aa123456", "a123456", "123456a", "1qaz2wsx", "zaq12wsx",
]);

export const PASSWORD_MIN = 8;

/** Why a password won't do, or null when it will. */
export function passwordProblem(password: string, email?: string | null): string | null {
  if (password.length < PASSWORD_MIN) return `At least ${PASSWORD_MIN} characters, please`;
  if (password.length > 200) return "200 characters at most";
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return "That's one of the first passwords anyone guesses — choose another";
  if (/^(.)\1+$/.test(password)) return "Not one character repeated — choose another";
  const local = email?.toLowerCase().split("@")[0];
  if (email && (lower === email.toLowerCase() || (local && local.length >= 4 && lower === local))) return "Not your email address — choose another";
  return null;
}
