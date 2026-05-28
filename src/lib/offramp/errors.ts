import '@/lib/server/only';

export class OfframpError extends Error {
  readonly code: string;

  constructor(message: string, code = 'OFFRAMP_ERROR') {
    super(message);
    this.name = new.target.name;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class OfframpValidationError extends OfframpError {
  constructor(message: string) {
    super(message, 'OFFRAMP_VALIDATION_ERROR');
  }
}

export class OfframpConfigError extends OfframpError {
  constructor(message: string) {
    super(message, 'OFFRAMP_CONFIG_ERROR');
  }
}

export class OfframpOperationError extends OfframpError {
  readonly status: number;

  constructor(message: string, status = 500) {
    super(message, 'OFFRAMP_OPERATION_ERROR');
    this.status = status;
  }
}
