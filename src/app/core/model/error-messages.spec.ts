import { errorMessage } from './error-messages';
import { ERROR_CODES } from './result';

describe('Fehlermeldungen', () => {
  it.each(ERROR_CODES)('hat eine deutsche Meldung für %s', (code) => {
    expect(errorMessage({ code }).length).toBeGreaterThan(10);
  });

  it('meldet die abgelaufene Storno-Frist verständlich (F-26)', () => {
    expect(errorMessage({ code: 'REVERSAL_WINDOW_EXPIRED' })).toContain('Frist');
  });
});
