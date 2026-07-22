import '@/lib/server/only';

export class WhitelistRequestError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'WhitelistRequestError';
    this.status = status;
  }
}

export type WhitelistSubmitActor = {
  userId: string;
  clientId: string;
  email: string | null;
};
