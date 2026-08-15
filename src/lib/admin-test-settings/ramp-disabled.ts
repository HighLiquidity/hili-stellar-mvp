export class RampDisabledError extends Error {
  readonly code = 'ramp_disabled';
  readonly status = 403;
  readonly product: 'usdc' | 'brh';

  constructor(product: 'usdc' | 'brh', message?: string) {
    super(
      message ??
        (product === 'usdc'
          ? 'USDC ramp is currently disabled.'
          : 'BRH ramp is currently disabled.'),
    );
    this.name = 'RampDisabledError';
    this.product = product;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
