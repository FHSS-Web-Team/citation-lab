import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class TemplateSyncService {
  readonly variables = signal<string[]>([]);
  readonly template = signal<string>('');

  setData(vars: string[], tmpl: string): void {
    this.variables.set(vars ?? []);
    this.template.set(tmpl ?? '');
  }
}
