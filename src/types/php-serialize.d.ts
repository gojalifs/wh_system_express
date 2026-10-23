declare module 'php-serialize' {
  export function serialize(
    value: unknown,
    scope?: Record<string, unknown>
  ): string;
  export function unserialize(payload: string): unknown;
}
