const KEY = 'nexusai_onboarding_v1';

export function isOnboardingComplete(): boolean {
  try {
    return localStorage.getItem(KEY) === 'done';
  } catch {
    return true;
  }
}

export function completeOnboarding(focus?: string): void {
  try {
    localStorage.setItem(KEY, 'done');
    if (focus) localStorage.setItem(`${KEY}_focus`, focus);
  } catch {
    /* ignore */
  }
}

export function getOnboardingFocus(): string | null {
  try {
    return localStorage.getItem(`${KEY}_focus`);
  } catch {
    return null;
  }
}

export function resetOnboarding(): void {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(`${KEY}_focus`);
  } catch {
    /* ignore */
  }
}
