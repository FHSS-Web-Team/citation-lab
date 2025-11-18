import { CitationTemplateAddend } from "./citation-template-addend";

export class CitationTemplateExpression extends CitationTemplateAddend {
  private _addends: CitationTemplateAddend[];

    constructor(addends: CitationTemplateAddend[]) {
      super(
        addends.map(addend => addend.toString()).join(''),
        `[${addends.map(addend => addend.stringify()).join('+')}]`
      );
      this._addends = addends;
    }

    override getVariables(): string[] {
      return this._addends.flatMap(addend => addend.getVariables());
    }
}
