/**
 * Plantillas de `src/prompts/`, cargadas como texto en build.
 *
 * Solo servidor: el system prompt nunca se expone al cliente.
 */
import autumnPromptSource from '@/prompts/specialty-autumn.md?raw';
import systemPromptSource from '@/prompts/system.md?raw';
import userContextSource from '@/prompts/user-context.md?raw';

import { ConfigError } from '@/lib/errors';
import type { Specialty } from '@/lib/types';

/** Los comentarios HTML documentan la plantilla para quien la edita, no para el modelo. */
function stripComments(markdown: string): string {
  return markdown.replace(/<!--[\s\S]*?-->/gu, '').trim();
}

export const SYSTEM_PROMPT = stripComments(systemPromptSource);

/** La capa de cada especialidad, que va al final del system prompt. */
const SPECIALTY_PROMPTS: Readonly<Record<Specialty, string>> = {
  autumn: stripComments(autumnPromptSource),
};

/** El system prompt de Umber, con la capa de la especialidad si la conversación tiene una. */
export function systemPrompt(specialty: Specialty | null): string {
  return specialty === null ? SYSTEM_PROMPT : `${SYSTEM_PROMPT}\n\n${SPECIALTY_PROMPTS[specialty]}`;
}

const USER_CONTEXT_TEMPLATE = stripComments(userContextSource);

/**
 * cyrb53: un hash de 53 bits, síncrono y sin dependencias. Solo tiene que
 * distinguir una versión de otra, no resistir a nadie.
 */
function versionHash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/**
 * Versión de los prompts: cambia con cualquier cambio en `system.md` o en la
 * plantilla. Va en cada llamada registrada, para comparar versiones en el panel.
 */
export const PROMPT_VERSION = versionHash(
  [SYSTEM_PROMPT, USER_CONTEXT_TEMPLATE, ...Object.values(SPECIALTY_PROMPTS)].join('\n'),
);

/** Las `{{variables}}` que documenta `user-context.md`. */
export interface UserContextValues {
  readonly mode: string;
  readonly mode_label: string;
  readonly reply_language: string;
  readonly specialty: string;
  readonly region: string;
  readonly today: string;
  readonly user_message: string;
  readonly conversation_state: string;
  readonly candidates: string;
  readonly already_recommended: string;
}

/**
 * Sustituye cada `{{variable}}` en una sola pasada: el texto sustituido no se
 * vuelve a examinar, así que un mensaje que contenga `{{candidates}}` no inyecta
 * la lista de candidatos donde no toca.
 */
export function renderTemplate(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{\{(\w+)\}\}/gu, (_match, name: string) => {
    const value = values[name];
    if (value === undefined) {
      throw new ConfigError(`La plantilla usa {{${name}}}, que no tiene valor.`);
    }
    return value;
  });
}

export function renderUserContext(values: UserContextValues): string {
  return renderTemplate(USER_CONTEXT_TEMPLATE, { ...values });
}
