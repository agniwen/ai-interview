// 平台账号密码规则：Web 表单校验、强度提示与 Better Auth 服务端钩子共用这一份。
// Platform account password policy shared by web validation, the strength meter and
// the Better Auth server hook.

/** 与 Better Auth `emailAndPassword.minPasswordLength` 保持一致。Mirrors Better Auth config. */
export const PASSWORD_MIN_LENGTH = 8;
/** Better Auth 默认 `maxPasswordLength`。Better Auth's default max length. */
export const PASSWORD_MAX_LENGTH = 128;
/** 四类字符中至少需要满足的类数。Character classes required out of four. */
export const PASSWORD_REQUIRED_CATEGORY_COUNT = 3;
/** 达到「强」所需的长度。Length that upgrades a valid password to strong. */
const STRONG_PASSWORD_LENGTH = 12;

const LOWERCASE_PATTERN = /\p{Ll}/u;
const UPPERCASE_PATTERN = /\p{Lu}/u;
const DIGIT_PATTERN = /\p{Nd}/u;
// 非字母数字、非空白的可见字符都算符号。Any visible non-alphanumeric character is a symbol.
const SYMBOL_PATTERN = /[^\p{L}\p{N}\s]/u;

export type PasswordCategory = "lowercase" | "uppercase" | "digit" | "symbol";
export type PasswordStrength = "empty" | "weak" | "medium" | "strong";

export const PASSWORD_CATEGORY_LABELS = {
  digit: "数字",
  lowercase: "小写字母",
  symbol: "符号",
  uppercase: "大写字母",
} as const satisfies Record<PasswordCategory, string>;

export interface PasswordEvaluation {
  categories: Record<PasswordCategory, boolean>;
  categoryCount: number;
  lengthValid: boolean;
  /** 满足服务端强制规则。Satisfies the enforced policy. */
  meetsPolicy: boolean;
  strength: PasswordStrength;
}

function getPasswordStrength(
  password: string,
  meetsPolicy: boolean,
  categoryCount: number,
): PasswordStrength {
  if (!password) {
    return "empty";
  }
  if (!meetsPolicy) {
    return "weak";
  }
  const allCategories = categoryCount === Object.keys(PASSWORD_CATEGORY_LABELS).length;
  return password.length >= STRONG_PASSWORD_LENGTH && allCategories ? "strong" : "medium";
}

export function evaluatePassword(password: string): PasswordEvaluation {
  const categories = {
    digit: DIGIT_PATTERN.test(password),
    lowercase: LOWERCASE_PATTERN.test(password),
    symbol: SYMBOL_PATTERN.test(password),
    uppercase: UPPERCASE_PATTERN.test(password),
  } satisfies Record<PasswordCategory, boolean>;
  const categoryCount = Object.values(categories).filter(Boolean).length;
  const lengthValid =
    password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH;
  const meetsPolicy = lengthValid && categoryCount >= PASSWORD_REQUIRED_CATEGORY_COUNT;

  return {
    categories,
    categoryCount,
    lengthValid,
    meetsPolicy,
    strength: getPasswordStrength(password, meetsPolicy, categoryCount),
  };
}

/** 不满足规则时的第一条可读原因；满足时为 null。First readable violation, or null. */
export function getPasswordPolicyViolation(password: string): string | null {
  const evaluation = evaluatePassword(password);
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `密码至少 ${PASSWORD_MIN_LENGTH} 位`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `密码不能超过 ${PASSWORD_MAX_LENGTH} 位`;
  }
  if (!evaluation.meetsPolicy) {
    return `密码需包含大写字母、小写字母、数字、符号中的至少 ${PASSWORD_REQUIRED_CATEGORY_COUNT} 类`;
  }
  return null;
}
