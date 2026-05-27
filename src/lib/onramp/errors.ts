import '@/lib/server/only';

export class OnrampError extends Error {
  readonly code: string;

  constructor(message: string, code = 'ONRAMP_ERROR') {
    super(message);
    this.name = new.target.name;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class OnrampValidationError extends OnrampError {
  constructor(message: string) {
    super(message, 'ONRAMP_VALIDATION_ERROR');
  }
}

export class OnrampConfigError extends OnrampError {
  constructor(message: string) {
    super(message, 'ONRAMP_CONFIG_ERROR');
  }
}

export class OnrampOperationError extends OnrampError {
  readonly status: number;

  constructor(message: string, status = 500) {
    super(message, 'ONRAMP_OPERATION_ERROR');
    this.status = status;
  }
}
