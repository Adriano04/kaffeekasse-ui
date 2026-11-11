import { balanceDisplay, displayAmount } from './display';
import { newIdempotencyKey } from './ids';

/** Ersetzt das geschützte Leerzeichen vor „€“ durch ein normales, damit die Erwartungen lesbar bleiben. */
const plain = (text: string) => text.replace(/\s/g, ' ');

describe('F-08 Darstellung des Kontostands', () => {
  it('negativ: Minus, „offen“, Tonalität negativ', () => {
    const display = balanceDisplay(-730);
    expect(plain(display.text)).toBe('−7,30 €');
    expect(display).toMatchObject({ tone: 'negative', hint: 'offen' });
  });

  it('positiv: Plus, „Guthaben“, Tonalität positiv', () => {
    const display = balanceDisplay(1040);
    expect(plain(display.text)).toBe('+10,40 €');
    expect(display).toMatchObject({ tone: 'positive', hint: 'Guthaben' });
  });

  it('genau 0,00 € ist neutral', () => {
    const display = balanceDisplay(0);
    expect(plain(display.text)).toBe('0,00 €');
    expect(display).toMatchObject({ tone: 'neutral', hint: 'ausgeglichen' });
  });
});

describe('F-08 Darstellung von Buchungsbeträgen', () => {
  it('zeigt Belastungen mit Minus, Gutschriften mit Plus und 0 neutral', () => {
    expect(
      [-60, 500, 0].map((amount) => displayAmount(amount)).map((d) => [plain(d.text), d.tone]),
    ).toEqual([
      ['−0,60 €', 'negative'],
      ['+5,00 €', 'positive'],
      ['0,00 €', 'neutral'],
    ]);
  });
});

describe('NF-04 Idempotenz-Schlüssel', () => {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  it('erzeugt eindeutige UUIDs', () => {
    const keys = new Set(Array.from({ length: 100 }, () => newIdempotencyKey()));
    expect(keys.size).toBe(100);
    for (const key of keys) {
      expect(key).toMatch(UUID);
    }
  });

  it('funktioniert auch ohne crypto.randomUUID (kein sicherer Kontext)', () => {
    const original = Object.getOwnPropertyDescriptor(crypto, 'randomUUID');
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      expect(newIdempotencyKey()).toMatch(UUID);
    } finally {
      if (original) {
        Object.defineProperty(crypto, 'randomUUID', original);
      } else {
        delete (crypto as { randomUUID?: unknown }).randomUUID;
      }
    }
  });
});
