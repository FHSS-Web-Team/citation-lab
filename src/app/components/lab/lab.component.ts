import { Component, computed, inject, linkedSignal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { CitationEngineService } from '../../services/citation-engine.service';
import { TemplateSyncService } from '../../services/template-sync.service';
import { TemplateBuilder } from '../template-builder/template-builder';

@Component({
  selector: 'app-lab',
  standalone: true,
  imports: [FormsModule, TemplateBuilder],
  templateUrl: './lab.component.html',
  styleUrls: ['./lab.component.scss'],
})
export class LabComponent {
  private templateSync = inject(TemplateSyncService);
  private engine = inject(CitationEngineService);

  protected template = computed(() => this.templateSync.template());
  protected arguments = computed(() => this.templateSync.variables());
  protected readonly values = linkedSignal(() =>
    Array(this.arguments().length)
  );

  protected readonly result = computed(() => {
    try {
      return this.engine.format(this.template(), ...this.values()) || '';
    } catch (e: any) {
      return `Citation error: ${e?.message ?? e}`;
    }
  });

  handleArgumentInput(event: Event, argumentIndex: number) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    this.values.update(array => {
      const value = target.value;
      array[argumentIndex] = value.trim() === '' ? null : value;
      return [...array];
    });
  }

  /** Minimal markdown-to-HTML renderer for bold/italic + line breaks. */
  renderCitation(text: string): string {
    const escape = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    let html = escape(text);
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // Collapse newlines to spaces so each result renders on one line.
    html = html.replace(/\s*\n+\s*/g, ' ');
    return `<p>${html}</p>`;
  }
}
