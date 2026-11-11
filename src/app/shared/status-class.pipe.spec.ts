import { StatusClassPipe } from './status-class.pipe';

describe('StatusClassPipe', () => {
  const pipe = new StatusClassPipe();

  it('bildet die Tonalität 1:1 auf die Status-Modifier ab', () => {
    expect(pipe.transform('positive', 'rs-stat')).toBe('rs-stat--ok');
    expect(pipe.transform('negative', 'rs-stat')).toBe('rs-stat--crit');
    expect(pipe.transform('neutral', 'rs-callout')).toBe('rs-callout--neutral');
    expect(pipe.transform('warning', 'rs-badge')).toBe('rs-badge--warn');
  });
});
