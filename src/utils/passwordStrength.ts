export interface PasswordStrengthResult {
  score: 0 | 1 | 2 | 3 | 4;
  label: 'Very Weak' | 'Weak' | 'Fair' | 'Strong' | 'Very Strong';
  color: string;
  isStrong: boolean; // meets the minimum bar required to register
}

export const getPasswordStrength = (password: string): PasswordStrengthResult => {
  const hasMinLength = password.length >= 8;
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);

  const score = [hasMinLength, hasLower && hasUpper, hasNumber, hasSymbol].filter(Boolean).length as 0 | 1 | 2 | 3 | 4;

  const levels: Record<number, Pick<PasswordStrengthResult, 'label' | 'color'>> = {
    0: { label: 'Very Weak', color: '#ef4444' },
    1: { label: 'Weak', color: '#f97316' },
    2: { label: 'Fair', color: '#eab308' },
    3: { label: 'Strong', color: '#84cc16' },
    4: { label: 'Very Strong', color: '#C8FF5E' },
  };

  return {
    score,
    ...levels[score],
    isStrong: hasMinLength && hasLower && hasUpper && hasNumber && hasSymbol,
  };
};
