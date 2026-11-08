export class RestoreError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RestoreError';
  }
}
