/**
 * Datos de quien responde de Umber, para los textos legales (`/aviso-legal`,
 * `/privacidad`, `/cookies`, `/condiciones`). Un solo sitio: al completarlos,
 * cambian las cuatro páginas.
 *
 * Los textos son **borradores**: mientras `LEGAL_DRAFT` sea `true`, cada página
 * lo dice arriba. Pasarlo a `false` cuando los haya revisado alguien.
 */
export const LEGAL_DRAFT = true;

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
 */
export const AI_CONSENT_COOKIE = 'umber_consentimiento_ia';
export const AI_CONSENT_VERSION = '2026-10-11';

/** La fecha de la versión en vigor de los textos. */
export const LEGAL_UPDATED = '11 de octubre de 2026';

export const LEGAL_PAGES = [
  { href: '/aviso-legal', label: 'Aviso legal' },
  { href: '/privacidad', label: 'Privacidad' },
  { href: '/cookies', label: 'Cookies' },
  { href: '/condiciones', label: 'Condiciones' },
] as const;
