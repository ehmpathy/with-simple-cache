import { getUuid } from 'uuid-fns';

import { withSimpleCacheOnDisk } from './withSimpleCacheOnDisk';

describe('withSimpleCacheOnDisk', () => {
  it('should be able to wrap a procedure that has a custom context', async () => {
    // given a procedure with custom context
    const procedure = async (
      input: { name: string },
      _: { dbConnection: string },
    ) => ({ name: input.name });

    // then we should be able to wrap it
    const wrapped = withSimpleCacheOnDisk(procedure, {
      procedure: { name: 'test', version: getUuid() },
      directory: { local: { path: __dirname + '/.temp' } },
    });

    // and it should work
    expect(await wrapped({ name: 'casey' }, { dbConnection: 'yes' })).toEqual({
      name: 'casey',
    });

    // and it should repeatedly
    expect(await wrapped({ name: 'casey' }, { dbConnection: 'yes' })).toEqual({
      name: 'casey',
    });
  });
});
