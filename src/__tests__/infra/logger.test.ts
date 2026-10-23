import { jest } from '@jest/globals';

// LOG_LEVEL must be set before the logger/env modules are evaluated.
process.env.LOG_LEVEL = 'warn';

const { createLogger } = await import('../../infra/logger.js');

describe('logger', () => {
  let stdout: jest.SpiedFunction<typeof process.stdout.write>;
  let stderr: jest.SpiedFunction<typeof process.stderr.write>;

  beforeEach(() => {
    stdout = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true) as typeof stdout;
    stderr = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true) as typeof stderr;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('suppresses levels below LOG_LEVEL', () => {
    const log = createLogger('test');
    log.debug('d');
    log.info('i');
    expect(stdout).not.toHaveBeenCalled();
  });

  it('writes warn/error to stderr with timestamp, level and scope', () => {
    const log = createLogger('sto-build');
    log.warn('bundle not ready');
    log.error('build failed', { build: 7 });

    expect(stderr).toHaveBeenCalledTimes(2);
    const first = String(stderr.mock.calls[0][0]);
    expect(first).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z WARN {2}\[sto-build\] bundle not ready\n$/
    );
    const second = String(stderr.mock.calls[1][0]);
    expect(second).toContain('ERROR [sto-build] build failed {"build":7}');
  });

  it('renders Error meta as its message', () => {
    const log = createLogger('test');
    log.error('boom', new Error('kaput'));
    const line = String(stderr.mock.calls[0][0]);
    expect(line).toContain('error="kaput"');
  });
});
