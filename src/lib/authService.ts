export interface AuthUser {
  email: string;
  name: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthService {
  getSession: () => AuthUser | null;
  login: (input: LoginInput) => Promise<AuthUser>;
  logout: () => void;
}

const AUTH_STORAGE_KEY = 'fiat-ops.session';

function buildUser(email: string): AuthUser {
  const localPart = email.split('@')[0] || 'demo';
  const normalizedName = localPart
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

  return {
    email,
    name: normalizedName || 'Demo User',
  };
}

function readSession(): AuthUser | null {
  const rawSession = window.localStorage.getItem(AUTH_STORAGE_KEY);

  if (!rawSession) {
    return null;
  }

  try {
    return JSON.parse(rawSession) as AuthUser;
  } catch {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

export const mockAuthService: AuthService = {
  getSession: () => readSession(),
  login: async ({ email }: LoginInput) => {
    const user = buildUser(email.trim().toLowerCase());

    await new Promise((resolve) => window.setTimeout(resolve, 650));
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));

    return user;
  },
  logout: () => {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  },
};
