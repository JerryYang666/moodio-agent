import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 12;

const MIN_LENGTH = 8;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Performs a dummy hash to consume roughly the same time as a real
 * bcrypt verify, preventing timing-based user enumeration.
 */
export async function dummyVerify(): Promise<void> {
  await bcrypt.hash("dummy-password-timing-safe", BCRYPT_ROUNDS);
}

export function validatePasswordStrength(password: string): {
  valid: boolean;
  error?: string;
} {
  if (password.length < MIN_LENGTH) {
    return { valid: false, error: `Password must be at least ${MIN_LENGTH} characters` };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: "Password must contain at least one lowercase letter" };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: "Password must contain at least one uppercase letter" };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: "Password must contain at least one digit" };
  }
  return { valid: true };
}
