import { formatAmount, formatAmountForInput, formatSignedAmount, parseAmount } from './money';

describe('NF-04 Geldbeträge in Cent', () => {
  describe('parseAmount', () => {
    it.each([
      ['0,80', 80],
      ['0.8', 80],
      ['12', 1200],
      ['12,5', 1250],
      ['12.50', 1250],
      [',5', 50],
      ['  3,00 € ', 300],
      ['3,00€', 300],
      ['-2,60', -260],
      ['\u22122,60', -260],
      ['+1,20', 120],
      ['0,10', 10],
      ['0,20', 20],
      ['0', 0],
      ['-0,00', 0],
      ['1234,56', 123456],
    ])('wandelt „%s“ in %i Cent um', (input, expected) => {
      expect(parseAmount(input)).toBe(expected);
    });

    it('rechnet ohne Rundungsfehler (0,1 + 0,2)', () => {
      expect((parseAmount('0,1') ?? 0) + (parseAmount('0,2') ?? 0)).toBe(30);
    });

    it.each(['', '   ', 'abc', '1,005', '1,2,3', '1.234,56', '12,', '€', '-', '1e3', '0x10'])(
      'lehnt „%s“ ab',
      (input) => {
        expect(parseAmount(input)).toBeNull();
      },
    );
  });

  describe('formatAmount', () => {
    it('zeigt negative Beträge mit typografischem Minus', () => {
      expect(formatAmount(-260)).toBe('\u22122,60\u00a0€');
    });

    it('zeigt positive Beträge ohne Vorzeichen und 0 als 0,00 €', () => {
      expect(formatAmount(1040)).toBe('10,40\u00a0€');
      expect(formatAmount(0)).toBe('0,00\u00a0€');
      expect(formatAmount(5)).toBe('0,05\u00a0€');
    });

    it('gruppiert Tausender', () => {
      expect(formatAmount(123456)).toBe('1.234,56\u00a0€');
      expect(formatAmount(-100000000)).toBe('\u22121.000.000,00\u00a0€');
    });
  });

  describe('formatSignedAmount', () => {
    it('zeigt Gutschriften mit „+“ (F-08)', () => {
      expect(formatSignedAmount(1000)).toBe('+10,00\u00a0€');
      expect(formatSignedAmount(-60)).toBe('\u22120,60\u00a0€');
      expect(formatSignedAmount(0)).toBe('0,00\u00a0€');
    });
  });

  describe('formatAmountForInput', () => {
    it('liefert Text, den parseAmount wieder einliest', () => {
      for (const amount of [0, 5, 80, 1250, -260, 123456]) {
        expect(parseAmount(formatAmountForInput(amount))).toBe(amount);
      }
      expect(formatAmountForInput(1250)).toBe('12,50');
    });
  });
});
