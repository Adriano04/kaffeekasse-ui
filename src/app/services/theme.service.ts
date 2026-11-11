import { DOCUMENT, inject, Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);

  private readonly _lightMode = signal(false);
  readonly lightMode = this._lightMode.asReadonly();

  toggleTheme(): void {
    this._lightMode.update((value) => !value);
    this.document.body.classList.toggle('rs-root--light', this._lightMode());
  }
}
