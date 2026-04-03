import { z } from 'zod';

const TITLE_QUOTES_REGEX = /["'`]/g;
const TITLE_LINE_BREAKS_REGEX = /[\r\n]+/g;
const TITLE_WHITESPACE_REGEX = /\s+/g;

export const chatTitleRequestSchema = z.object({
  hasFiles: z.boolean().optional(),
  text: z.string().trim().min(1).max(5000),
});

function sanitizeTitle(title: string): string {
  return title
    .replace(TITLE_QUOTES_REGEX, '')
    .replace(TITLE_LINE_BREAKS_REGEX, ' ')
    .replace(TITLE_WHITESPACE_REGEX, ' ')
    .trim()
    .slice(0, 28);
}

export { sanitizeTitle };
