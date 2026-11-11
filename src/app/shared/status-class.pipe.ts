import { Pipe, PipeTransform } from '@angular/core';

import { Tone } from '../core/model/display';

/** Status-Modifier von custom-components. */
export type StatusModifier = 'ok' | 'warn' | 'crit' | 'neutral';

/** Abbildung der Tonalität auf die Status-Modifier, für alle Seiten gleich. */
export const STATUS_MODIFIERS: Readonly<Record<Tone, StatusModifier>> = {
  positive: 'ok',
  negative: 'crit',
  neutral: 'neutral',
  warning: 'warn',
};

/**
 * Status-Klasse eines Widgets zu einer Tonalität, z. B.
 * `{{ 'negative' | statusClass: 'rs-stat' }}` → `rs-stat--crit`.
 */
@Pipe({ name: 'statusClass' })
export class StatusClassPipe implements PipeTransform {
  transform(tone: Tone, block: string): string {
    return `${block}--${STATUS_MODIFIERS[tone]}`;
  }
}
