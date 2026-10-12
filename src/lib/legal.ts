/**
 * Datos de quien responde de Umber, para los textos legales (`/aviso-legal`,
 * `/privacidad`, `/cookies`, `/condiciones`). Un solo sitio: al completarlos,
 * cambian las cuatro páginas.
 *
 * Con `LEGAL_DRAFT = true`, cada página dice arriba que es un borrador. En vigor
 * desde el 2026-10-12 (Friends and Family), revisados contra lo que hace el
 * código; no los ha revisado un abogado.
 */
export const LEGAL_DRAFT = false;

/**
 * Sin NIF ni domicilio: Umber es un proyecto personal sin ingresos, fuera del
 * artículo 10 de la LSSI, y el RGPD pide identidad y contacto. Al cobrar (Fase 7,
 * premium, o publicidad) pasa a ser actividad económica: añadir NIF y domicilio
 * aquí y en `/aviso-legal`.
 */
export const LEGAL_OWNER = {
  /** Nombre y apellidos, o razón social. */
  name: 'Samuel Aós',
  /** Email de contacto y para ejercer los derechos de protección de datos. */
  email: 'samuel.aos@hotmail.com',
} as const;

/**
 * Consentimiento explícito para que DeepSeek trate los mensajes del chat en
 * China, sin decisión de adecuación (art. 49.1.a del RGPD). Lo pide
 * `/antes-de-hablar` antes de abrir el chat. Cambiar la versión si cambia lo que
 * se informa: obliga a aceptarlo de nuevo.
 *
 * Se guarda en dos sitios: la cookie, para este navegador, y la cuenta
 * (`user_metadata.ai_consent`, con versión y fecha), que es la constancia que
 * pide el art. 7.1 y vale en otros dispositivos. Se retira desde `/cuenta`
 * (art. 7.3). `/chat` y `/api/chat` lo exigen.
 */
export const AI_CONSENT_COOKIE = 'umber_consentimiento_ia';
export const AI_CONSENT_VERSION = '2026-10-12';

/** Lo que se guarda en la cuenta al aceptar. */
export interface AiConsentRecord {
  readonly version: string;
  /** ISO 8601. */
  readonly accepted_at: string;
}

export function readAiConsent(metadata: unknown): AiConsentRecord | null {
  if (typeof metadata !== 'object' || metadata === null) return null;
  const record = (metadata as Record<string, unknown>)['ai_consent'];
  if (typeof record !== 'object' || record === null) return null;
  const { version, accepted_at: acceptedAt } = record as Record<string, unknown>;
  return typeof version === 'string' && typeof acceptedAt === 'string' ? { version, accepted_at: acceptedAt } : null;
}

/** La cookie de este navegador o lo guardado en la cuenta, de la versión en vigor. */
export function hasAiConsent(cookie: string | undefined, record: AiConsentRecord | null): boolean {
  return cookie === AI_CONSENT_VERSION || record?.version === AI_CONSENT_VERSION;
}

/** La fecha de la versión en vigor de los textos. */
export const LEGAL_UPDATED = '12 de octubre de 2026';

export const LEGAL_PAGES = [
  { href: '/aviso-legal', label: 'Aviso legal' },
  { href: '/privacidad', label: 'Privacidad' },
  { href: '/cookies', label: 'Cookies' },
  { href: '/condiciones', label: 'Condiciones' },
] as const;
