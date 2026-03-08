import { Injectable } from '@angular/core';

export type Maybe = string | null | undefined;

@Injectable({ providedIn: 'root' })
export class CitationEngineService {
  format(template: string, ...attributes: Maybe[]): string {
    const filled = this.interpolate(template, attributes);
    return this.evalExpr(filled);
  }

  private interpolate(template: string, attributes: Maybe[]): string {
    let i = 0;
    return template.replace(/%s/g, () => attributes[i++] ?? '');
  }

  private evalExpr(expr: string): string {
    const statement = this.parseStatement(expr);

    const addendContents: string[] = [];
    const expressions: string[] = [];
    for (const addend of statement) {
      if (addend.startsWith('[') && addend.endsWith(']')) {
        const inner = this.evalExpr(addend.slice(1, -1));
        expressions.push(inner);
        addendContents.push(inner);
      } else {
        addendContents.push(addend);
      }
    }
    return expressions.some(e => e === '')
      ? expressions.join('')
      : addendContents.join('');
  }

  private parseStatement(expression: string): string[] {
    let statement: string[] = [];
    let currentAddend = '';
    let bracketCount = 0;
    let insideExpression = expression.charAt(0) === '[';

    for (let i = 0; i < expression.length; i++) {
      const ch = expression.charAt(i);

      // handle escapes for []
      if (ch === '\\' && i < expression.length - 1) {
        const next = expression.charAt(i + 1);
        if (next === '[' || next === ']') {
          i++;
          currentAddend += ch;
          currentAddend += next;
          continue;
        }
      }

      currentAddend += ch;
      if (ch === '[') bracketCount++;
      if (ch === ']') bracketCount--;

      // end of expression
      if (insideExpression && bracketCount === 0) {
        statement.push(currentAddend);
        currentAddend = '';
        insideExpression = expression.charAt(i + 1) === '[';
      }
      // end of literal
      else if (
        !insideExpression &&
        (expression.charAt(i + 1) === '[' || i === expression.length - 1)
      ) {
        statement.push(currentAddend);
        currentAddend = '';
        insideExpression = expression.charAt(i + 1) === '[';
      }
    }
    return statement;
  }
}
