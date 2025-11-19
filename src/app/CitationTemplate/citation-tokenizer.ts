import { CitationTemplateAddend } from './citation-template-addend';
import { CitationTemplateLiteral } from './citation-template-literal';
import { CitationTemplateVariable } from './citation-template-variable';

interface Token {
  type: 'arg' | 'lit';
  name?: string;
  value: string;
}

/**
 * Parse literal text with proper tokenization.
 * Handles punctuation and spaces appropriately.
 */
function parseLiteralTokens(chunk: string): Token[] {
  if (!chunk) {
    return [];
  }
  const tokens: Token[] = [];
  // Replace newlines with spaces
  chunk = chunk.replace(/\n/g, ' ').replace(/\r/g, ' ');
  // Define punctuation that should be separate tokens
  const punctuation = new Set([',', ':', ';', '#', '(', ')', '"']);
  // Split the chunk into segments based on punctuation
  const segments: string[] = [];
  let currentSegment = '';
  for (let i = 0; i < chunk.length; i++) {
    const char = chunk[i];
    if (punctuation.has(char)) {
      // Save current segment if it exists (preserve spaces)
      if (currentSegment) {
        segments.push(currentSegment);
        currentSegment = '';
      }
      // Add punctuation as separate segment
      segments.push(char);
    } else {
      // Regular character (including periods and spaces) - keep with preceding text
      currentSegment += char;
    }
  }
  // Add any remaining segment
  if (currentSegment) {
    segments.push(currentSegment);
  }
  // Convert segments to tokens
  for (const segment of segments) {
    if (segment) {
      tokens.push({ type: 'lit', value: segment });
    }
  }
  return tokens;
}

/**
 * Parse a citation template string into tokens.
 * Finds [Args] and treats everything else as literals.
 */
function parseCitationTemplate(template: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const n = template.length;
  while (i < n) {
    if (template[i] === '[') {
      // Find the matching ']' for the argument
      // Handle nested brackets by counting opening and closing brackets
      let bracketCount = 0;
      let j = i;
      while (j < n) {
        if (template[j] === '[') {
          bracketCount++;
        } else if (template[j] === ']') {
          bracketCount--;
          if (bracketCount === 0) {
            break;
          }
        }
        j++;
      }
      if (j === n) {
        // No closing bracket; treat rest as literal
        const literalTokens = parseLiteralTokens(template.slice(i));
        out.push(...literalTokens);
        break;
      }
      // Extract argument name, ignoring parentheses inside brackets
      let argContent = template.slice(i + 1, j);
      // Remove parentheses and their contents inside brackets
      argContent = argContent.replace(/\([^)]*\)/g, '');
      const argName = argContent.trim();
      out.push({ type: 'arg', name: argName, value: argName });
      i = j + 1;
    } else {
      // Gather literal until next '[' or end
      const k = template.indexOf('[', i);
      const literalEnd = k === -1 ? n : k;
      const literalSpan = template.slice(i, literalEnd);
      const literalTokens = parseLiteralTokens(literalSpan);
      out.push(...literalTokens);
      i = literalEnd;
    }
  }
  return out;
}

/**
 * Tokenize a citation template string and convert to CitationTemplateAddend array.
 * Automatically marks [Args] as variables and everything else as literals.
 */
export function tokenizeCitationTemplate(template: string): CitationTemplateAddend[] {
  if (!template.trim()) {
    return [];
  }
  const tokens = parseCitationTemplate(template);
  const addends: CitationTemplateAddend[] = [];
  for (const token of tokens) {
    if (token.type === 'arg') {
      addends.push(new CitationTemplateVariable(token.name || token.value));
    } else {
      // Add all literal tokens (including spaces and punctuation)
      if (token.value) {
        addends.push(new CitationTemplateLiteral(token.value));
      }
    }
  }
  return addends;
}

