import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ANNA, BEN, COFFEE } from '../../testing/test-data';
import {
  provideTestEnvironment,
  settle,
  testRepository,
  testSession,
} from '../../testing/test-environment';
import { DataVersion } from '../data/data-version';
import { fail } from '../model/result';
import { AccountFacade } from './account.facade';
import { JournalFacade } from './journal.facade';
import { MasterDataFacade } from './master-data.facade';
import { MetricsFacade } from './metrics.facade';
import { SettingsFacade } from './settings.facade';

describe('Facades', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: provideTestEnvironment() });
  });

  describe('Abfragen', () => {
    it('laden geteilte Daten nur einmal, auch bei mehreren Nutzern', async () => {
      const load = vi.spyOn(testRepository(), 'myAccount');
      const facade = TestBed.inject(AccountFacade);
      const booking = computed(() => facade.account.value()?.balance);
      const account = computed(() => facade.account.value()?.person.displayName);

      expect(facade.account.value()).toBeUndefined();
      await settle();

      expect(booking()).toBe(-50);
      expect(account()).toBe('Anna');
      expect(TestBed.inject(AccountFacade).account.value()?.balance).toBe(-50);
      expect(load).toHaveBeenCalledTimes(1);
    });

    it('laden nach einem erfolgreichen Befehl neu und behalten bis dahin den alten Wert', async () => {
      const facade = TestBed.inject(AccountFacade);
      await settle();
      const load = vi.spyOn(testRepository(), 'myAccount');

      const result = await facade.bookConsumption(COFFEE, 'k1');
      expect(result.ok).toBe(true);
      expect(facade.account.value()?.balance).toBe(-50);
      expect(facade.account.loading()).toBe(true);

      await settle();
      expect(facade.account.value()?.balance).toBe(-100);
      expect(facade.account.loading()).toBe(false);
      expect(load).toHaveBeenCalledTimes(1);
    });

    it('laden nach einem abgelehnten Befehl nicht neu', async () => {
      const facade = TestBed.inject(AccountFacade);
      await settle();
      const version = TestBed.inject(DataVersion).version();

      const result = await facade.bookConsumption('gibt-es-nicht', 'k1');
      expect(result).toEqual({ ok: false, failure: { code: 'NOT_FOUND' } });
      expect(TestBed.inject(DataVersion).version()).toBe(version);
    });

    it('verwerfen nach einem Personenwechsel sofort die Daten der vorherigen Person', async () => {
      const facade = TestBed.inject(AccountFacade);
      await settle();

      testSession().switchTo(BEN);
      expect(facade.account.value()).toBeUndefined();
      await settle();
      expect(facade.account.value()).toMatchObject({ person: { id: BEN }, balance: 250 });
    });

    it('melden Fehler als Failure, auch bei unerwarteten Ausnahmen', async () => {
      const repository = testRepository();
      vi.spyOn(repository, 'myAccount').mockResolvedValue(fail('NOT_AUTHENTICATED'));
      vi.spyOn(repository, 'settings').mockRejectedValue(new Error('Netzwerk weg'));
      const account = TestBed.inject(AccountFacade).account;
      const settings = TestBed.inject(SettingsFacade).settings;
      await settle();

      expect(account.value()).toBeUndefined();
      expect(account.error()).toEqual({ code: 'NOT_AUTHENTICATED' });
      expect(settings.error()).toEqual({ code: 'TECHNICAL_ERROR' });
    });

    it('der Verlauf lädt beim Ändern des Zeitraums neu (F-07)', async () => {
      testSession().switchTo(BEN);
      const from = signal('2026-10-01');
      const history = TestBed.runInInjectionContext(() =>
        TestBed.inject(AccountFacade).history(from),
      );
      await settle();
      expect(history.value()?.entries.map((e) => e.id)).toEqual(['b-5', 'b-4']);
      expect(history.value()?.hasOlder).toBe(true);

      from.set('2026-07-01');
      expect(history.value()?.entries.length).toBe(2);
      await settle();
      expect(history.value()?.entries.map((e) => e.id)).toEqual(['b-5', 'b-4', 'b-2']);
      expect(history.value()?.hasOlder).toBe(false);
    });
  });

  describe('Verwaltung', () => {
    it('laden ohne Rolle Verwaltung nichts und ohne Fehler', async () => {
      testSession().switchTo(BEN);
      const people = vi.spyOn(testRepository(), 'people');
      const masterData = TestBed.inject(MasterDataFacade);
      const metrics = TestBed.inject(MetricsFacade);
      await settle();

      expect(masterData.people.value()).toBeUndefined();
      expect(masterData.people.error()).toBeNull();
      expect(metrics.metrics.value()).toBeUndefined();
      expect(people).not.toHaveBeenCalled();

      testSession().switchTo(ANNA);
      await settle();
      expect(masterData.people.value()?.map((p) => p.displayName)).toEqual(['Anna', 'Ben', 'Cleo']);
      expect(metrics.metrics.value()?.receivables.total).toBe(350);
    });

    it('Stammdaten-Befehle laden Personen, Kennzahlen und die Anmeldung neu', async () => {
      const masterData = TestBed.inject(MasterDataFacade);
      const account = TestBed.inject(AccountFacade);
      await settle();

      const result = await masterData.updatePerson(ANNA, { displayName: 'Anna B.', email: null });
      expect(result.ok).toBe(true);
      expect(account.currentPerson()?.displayName).toBe('Anna B.');
      await settle();
      expect(masterData.people.value()?.[0].displayName).toBe('Anna B.');
    });

    it('Buchungen der Verwaltung erhöhen den Datenstand, Suchen nicht', async () => {
      const journal = TestBed.inject(JournalFacade);
      const version = journal.version();

      const page = await journal.searchBookings({ filter: {}, sort: null, page: 1, pageSize: 10 });
      expect(page.ok && page.value.total).toBe(6);
      expect(journal.version()).toBe(version);

      const booked = await journal.recordPayment(
        { personId: BEN, amount: 500, paymentMethod: 'CASH', bookingDate: '2026-10-13', note: '' },
        'k1',
      );
      expect(booked.ok).toBe(true);
      expect(journal.version()).toBe(version + 1);
    });

    it('Suchen melden unerwartete Ausnahmen als TECHNICAL_ERROR', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.spyOn(testRepository(), 'cashBook').mockRejectedValue(new Error('Netzwerk weg'));
      const result = await TestBed.inject(JournalFacade).cashBook({
        filter: {},
        sort: null,
        page: 1,
        pageSize: 10,
      });
      expect(result).toEqual({ ok: false, failure: { code: 'TECHNICAL_ERROR' } });
    });

    it('geänderte Zahlungsinformationen sind sofort für alle sichtbar (F-37)', async () => {
      const settings = TestBed.inject(SettingsFacade);
      await settle();
      const result = await settings.updatePaymentInfo({
        ...settings.settings.value()!.paymentInfo,
        iban: 'DE11 2222',
      });
      expect(result.ok).toBe(true);
      await settle();
      expect(settings.settings.value()?.paymentInfo.iban).toBe('DE11 2222');
    });
  });
});
