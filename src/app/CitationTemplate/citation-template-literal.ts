import { CitationTemplateAddend } from "./citation-template-addend";
import { CitationTemplateVariable } from "./citation-template-variable";

export class CitationTemplateLiteral extends CitationTemplateAddend {
    constructor(value: string) {
        super(value, `{${
            value
            .replaceAll('[', '\\[')
            .replaceAll(']', '\\]')
            .replaceAll('{', '\\{')
            .replaceAll('}', '\\}')
        }}`)
    }

    override getVariables(): string[] {
      return [];
    }

}
