import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RsToast, RsToastService } from 'custom-components';

import { JournalFacade } from '../../../core/facades/journal.facade';
import { ANNA, BEN, CLEO } from '../../../testing/test-data';
import { provideTestEnvironment, settle } from '../../../testing/test-environment';
import { PeopleViewModel } from './people.view-model';

@Component({ template: '' })
class EmptyPage {}

describe('PeopleViewModel', () => {
  let vm: PeopleViewModel;

  const lastToast = (): RsToast => TestBed.inject(RsToastService).toasts().at(-1)!;
  const row = (id: string) => vm.rows().find((r) => r.id === id)!;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideTestEnvironment(),
        provideRouter([{ path: 'admin/bookings', component: EmptyPage }]),
        PeopleViewModel,
      ],
    });
    vm = TestBed.inject(PeopleViewModel);
    await settle();
  });

  describe('F-09 Liste', () => {
    it('zeigt alle Personen mit Kontostand, Status und Rolle', () => {
      expect(
        vm
          .rows()
          .map((r) => [
            r.name,
            r.username,
            r.balance.text.replace(/\s/g, ' '),
            r.statusLabel,
            r.isAdmin,
          ]),
      ).toEqual([
        ['Anna', 'anna', '−0,50 €', 'aktiv', true],
        ['Ben', 'ben', '+2,50 €', 'aktiv', false],
        ['Cleo', 'cleo', '−3,00 €', 'inaktiv', false],
      ]);
      expect(vm.listTitle()).toBe('Alle Personen (3)');
    });

    it('F-35 sperrt Deaktivieren und Herabstufen des letzten Verwaltungskontos', () => {
      expect(row(ANNA).deactivateBlocker).toBe('Letztes aktives Verwaltungskonto');
      expect(row(ANNA).revokeBlocker).toBe('Letztes aktives Verwaltungskonto');
      expect(row(BEN).deactivateBlocker).toBeNull();
      expect(row(BEN).canGrantAdmin).toBe(true);
      expect(row(CLEO).canGrantAdmin).toBe(false);
    });

    it('sperrt bei mehreren Verwaltungskonten nur noch das eigene Konto', async () => {
      await vm.setAdminRole(BEN, true);
      await settle();
      expect(row(ANNA).deactivateBlocker).toBe('Eigenes Konto – das macht die Vertretung');
      expect(row(BEN).revokeBlocker).toBeNull();
      expect(lastToast().message).toBe('Ben hat jetzt die Rolle Verwaltung');
    });
  });

  describe('F-09 Anlegen', () => {
    it('legt eine Person an und leert das Formular', async () => {
      vm.createForm.displayName().value.set('Dora');
      vm.createForm.username().value.set('dora');
      expect(await vm.submitCreate()).toBe(true);
      await settle();

      expect(lastToast()).toMatchObject({ message: 'Dora angelegt', variant: 'ok' });
      expect(vm.rows().map((r) => r.name)).toContain('Dora');
      expect(vm.createForm().value()).toEqual({ displayName: '', username: '', email: '' });
      expect(vm.createForm.displayName().touched()).toBe(false);
    });

    it('prüft Pflichtfelder und E-Mail vor dem Absenden', async () => {
      vm.createForm.email().value.set('keine-mail');
      expect(await vm.submitCreate()).toBe(false);
      expect(vm.createForm.displayName().errors()[0]?.message).toBe(
        'Bitte gib einen Anzeigenamen ein.',
      );
      expect(vm.createForm.username().errors()[0]?.message).toBe(
        'Bitte gib einen Benutzernamen ein.',
      );
      expect(vm.createForm.email().errors()[0]?.message).toBe(
        'Bitte gib eine gültige E-Mail-Adresse an.',
      );
      expect(vm.createForm.displayName().touched()).toBe(true);
    });

    it('zeigt vergebene Namen als Fehler am Feld (Backend)', async () => {
      vm.createForm.displayName().value.set('ben');
      vm.createForm.username().value.set('ben2');
      await vm.submitCreate();
      expect(vm.createForm.displayName().errors()).toEqual([
        expect.objectContaining({
          kind: 'server',
          message: 'Dieser Anzeigename ist bereits vergeben.',
        }),
      ]);

      vm.createForm.displayName().value.set('Benno');
      vm.createForm.username().value.set('BEN');
      await vm.submitCreate();
      expect(vm.createForm.username().errors()[0]?.message).toBe(
        'Dieser Benutzername ist bereits vergeben.',
      );
    });
  });

  describe('F-09 Bearbeiten', () => {
    it('übernimmt die Daten in den Dialog und speichert Änderungen', async () => {
      vm.startEdit(BEN);
      expect(vm.editing()).toBe('Ben');
      expect(vm.editForm().value()).toEqual({ displayName: 'Ben', email: '' });

      vm.editForm.displayName().value.set('Benjamin');
      vm.editForm.email().value.set('ben@buero.example');
      expect(await vm.submitEdit()).toBe(true);
      await settle();

      expect(vm.editing()).toBeNull();
      expect(row(BEN)).toMatchObject({ name: 'Benjamin', email: 'ben@buero.example' });
    });

    it('lässt den Dialog bei einem vergebenen Namen offen', async () => {
      vm.startEdit(BEN);
      vm.editForm.displayName().value.set('Anna');
      await vm.submitEdit();
      expect(vm.editing()).toBe('Ben');
      expect(vm.editForm.displayName().errors()[0]?.kind).toBe('server');
    });
  });

  describe('F-09 Deaktivieren mit Schlussabrechnung', () => {
    it('weist bei Guthaben auf die Auszahlung hin und führt dorthin', async () => {
      vm.askDeactivate(BEN);
      expect(vm.deactivation()).toEqual({
        personId: BEN,
        name: 'Ben',
        settlement: {
          message: expect.stringContaining('noch 2,50') as unknown as string,
          offerPayout: true,
        },
      });

      await vm.goToPayout();
      expect(vm.deactivation()).toBeNull();
      expect(TestBed.inject(Router).url).toBe(`/admin/bookings?payout=${BEN}`);
    });

    it('weist bei offenem Betrag auf die offenen Forderungen hin', () => {
      vm.askDeactivate(ANNA);
      expect(vm.deactivation()?.settlement?.offerPayout).toBe(false);
      expect(vm.deactivation()?.settlement?.message).toContain('offenen Forderungen');
    });

    it('zeigt bei ausgeglichenem Konto keinen Hinweis und deaktiviert nach Bestätigung', async () => {
      await TestBed.inject(JournalFacade).recordPayout(
        { personId: BEN, amount: 250, paymentMethod: 'CASH', note: '' },
        'k1',
      );
      await settle();
      vm.askDeactivate(BEN);
      expect(vm.deactivation()?.settlement).toBeNull();

      await vm.confirmDeactivate();
      await settle();
      expect(row(BEN)).toMatchObject({ active: false, statusLabel: 'inaktiv' });
      expect(lastToast().message).toBe('Ben deaktiviert');
    });

    it('reaktiviert inaktive Personen', async () => {
      await vm.reactivate(CLEO);
      await settle();
      expect(row(CLEO).active).toBe(true);
    });

    it('meldet abgelehnte Befehle als kritischen Toast', async () => {
      await vm.setAdminRole(ANNA, false);
      expect(lastToast()).toMatchObject({ variant: 'crit' });
      expect(lastToast().message).toContain('letzte aktive Verwaltungskonto');
    });
  });
});
