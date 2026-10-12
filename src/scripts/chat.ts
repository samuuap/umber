/**
 * El chat en el navegador: manda el mensaje a `POST /api/chat`, pinta el stream
 * según llega y, al terminar, las fichas de lo recomendado.
 *
 * Sin framework (decisión de la Fase 5): una pantalla, poco estado. Sin sesión,
 * el historial vive solo en memoria y viaja en cada petición; con sesión, manda
 * la conversación guardada y aquí solo se recuerda su id.
 */
import { isApiErrorBody, readChatEvents } from '@/lib/chat-stream';
import { renderReply } from '@/lib/markdown';
import {
  FAVORITE_EVENT,
  fillContentCard,
  initFavoriteButtons,
  type FavoriteEventDetail,
} from '@/scripts/content-card';
import {
  CONVERSATION_WARNING_TURNS,
  isChatMode,
  isSpecialty,
  remainingTurns,
  type ChatHistoryMessage,
  type ChatMode,
  type ChatRequestBody,
  type Recommendation,
  type Specialty,
} from '@/lib/types';

// ─── Elementos ───────────────────────────────────────────────────────────────

function required<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (element === null) throw new Error(`Falta ${selector} en la página del chat.`);
  return element;
}

const root = required<HTMLElement>(document, '[data-chat]');
const list = required<HTMLOListElement>(root, '[data-messages]');
const form = required<HTMLFormElement>(root, '[data-composer]');
const input = required<HTMLTextAreaElement>(form, 'textarea');
const sendButton = required<HTMLButtonElement>(form, '[data-send]');
const stopButton = required<HTMLButtonElement>(form, '[data-stop]');
const turnsLeftNotice = required<HTMLElement>(form, '[data-turns-left]');
const conversationEnd = required<HTMLElement>(root, '[data-conversation-end]');
const dailyEnd = required<HTMLElement>(root, '[data-daily-end]');
const skipButton = required<HTMLButtonElement>(form, '[data-skip-questions]');
const recommendationsCount = required<HTMLElement>(form, '[data-recommendations-count]');
const quickReplies = required<HTMLUListElement>(form, '[data-quick-replies]');
/** Las recomendaciones que le quedan hoy, o `null` si no tiene límite (admin y pruebas). */
let recommendationsLeft: number | null =
  root.dataset.recommendationsLeft === '' || root.dataset.recommendationsLeft === undefined
    ? null
    : Number(root.dataset.recommendationsLeft);
const emptyState = root.querySelector<HTMLElement>('[data-empty-state]');
// El cuadro entero parece un campo: pulsar en su margen también lleva a escribir.
form.querySelector('.composer')?.addEventListener('click', (event) => {
  if (event.target === event.currentTarget) input.focus();
});
const templates = {
  user: required<HTMLTemplateElement>(root, 'template[data-template="user"]'),
  assistant: required<HTMLTemplateElement>(root, 'template[data-template="assistant"]'),
  card: required<HTMLTemplateElement>(root, 'template[data-template="card"]'),
};

const modeAttribute = root.dataset.mode;
if (!isChatMode(modeAttribute)) {
  throw new Error(`Modo desconocido en la página del chat: ${String(modeAttribute)}`);
}
const mode: ChatMode = modeAttribute;
/** La especialidad de la conversación (otoño), o `null`: Umber general. */
const specialty: Specialty | null = isSpecialty(root.dataset.specialty) ? root.dataset.specialty : null;

// ─── Estado ──────────────────────────────────────────────────────────────────

/** Id de la conversación guardada. Solo existe con sesión. */
let conversationId: string | null = root.dataset.conversationId || null;
/**
 * Turnos completos de esta visita. Sin sesión es todo el historial que hay, y
 * los de Umber llevan lo que devolvió `done`: el servidor lo necesita para saber
 * cuántas preguntas lleva y qué candidatos le quedan.
 */
const pastMessages: ChatHistoryMessage[] = [];
/** Los que ya traía la página: los de una conversación guardada. */
const initialMessageCount = Number(root.dataset.messageCount ?? '0');
const favorites = new Set<string>(JSON.parse(root.dataset.favorites ?? '[]') as string[]);
let controller: AbortController | null = null;

// La ficha de esta página vive en un `<template>`, y el `<script>` de
// `ContentCard.astro` queda dentro, inerte: los botones se activan desde aquí.
initFavoriteButtons();

document.addEventListener(FAVORITE_EVENT, (event) => {
  const { contentId, saved } = (event as CustomEvent<FavoriteEventDetail>).detail;
  if (saved) favorites.add(contentId);
  else favorites.delete(contentId);
});

// ─── Pintar ──────────────────────────────────────────────────────────────────

function clone(template: HTMLTemplateElement): HTMLElement {
  const fragment = template.content.cloneNode(true) as DocumentFragment;
  return required<HTMLElement>(fragment, 'li, article');
}

function part<T extends HTMLElement = HTMLElement>(bubble: HTMLElement, name: string): T {
  return required<T>(bubble, `[data-field="${name}"]`);
}

function isNearBottom(): boolean {
  return window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 160;
}

/**
 * Aplica un cambio y, si la persona estaba al final, la mantiene al final. Si
 * ha subido a leer, no se le mueve la pantalla.
 */
function keepPinned<T>(update: () => T): T {
  const pinned = isNearBottom();
  const result = update();
  if (pinned) window.scrollTo({ top: document.documentElement.scrollHeight });
  return result;
}

function appendUserMessage(text: string): void {
  const bubble = clone(templates.user);
  part(bubble, 'body').textContent = text;
  list.append(bubble);
}

function appendAssistantMessage(): HTMLElement {
  const bubble = clone(templates.assistant);
  list.append(bubble);
  return bubble;
}

const THINKING = 'Pensando…';
const SEARCHING = 'Buscando títulos que encajen…';

function resetAssistantMessage(bubble: HTMLElement): void {
  const status = part(bubble, 'status');
  status.textContent = THINKING;
  status.hidden = false;
  part(bubble, 'body').replaceChildren();
  part(bubble, 'error').hidden = true;
  part(bubble, 'cards').replaceChildren();
}

/** Cómo seguir tras un error. Sin `retry`, no se ofrece reintentar: repetir daría el mismo error. */
interface Recovery {
  readonly retry: (() => void) | null;
  /** Un enlace con la salida, si la hay: volver a entrar, empezar otra. */
  readonly action: { readonly href: string; readonly label: string } | null;
  /** El chat ya no admite más mensajes: se cierra con este panel. */
  readonly ends: HTMLElement | null;
}

function showError(bubble: HTMLElement, message: string, recovery: Pick<Recovery, 'retry' | 'action'>): void {
  part(bubble, 'status').hidden = true;
  part(bubble, 'error-message').textContent = message;
  part(bubble, 'error').hidden = false;
  const retryButton = required<HTMLButtonElement>(bubble, '[data-retry]');
  retryButton.hidden = recovery.retry === null;
  retryButton.onclick = recovery.retry;
  const action = part<HTMLAnchorElement>(bubble, 'error-action');
  action.hidden = recovery.action === null;
  if (recovery.action !== null) {
    action.href = recovery.action.href;
    action.textContent = recovery.action.label;
  }
}

// ─── Final de la conversación ────────────────────────────────────────────────

/** Qué se ofrece según el código de error del servidor. */
function recoveryFor(code: string | null, retry: () => void): Recovery {
  // Aquí ya no caben más mensajes: la conversación está llena, o ya tiene las recomendaciones del día.
  if (code === 'conversation_full') return { retry: null, action: null, ends: conversationEnd };
  if (code === 'recommendations_used') return { retry: null, action: null, ends: dailyEnd };
  // La sesión ha caducado: tras entrar, se vuelve a esta misma conversación.
  if (code === 'auth_error') {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    return { retry: null, action: { href: `/entrar?next=${next}`, label: 'Entrar de nuevo' }, ends: null };
  }
  // Retiró el consentimiento (en `/cuenta`, quizá en otra pestaña): se acepta y se vuelve aquí.
  if (code === 'consent_required') {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    return { retry: null, action: { href: `/antes-de-hablar?next=${next}`, label: 'Leer y aceptar' }, ends: null };
  }
  // La conversación ya no existe: la borró en otra pestaña.
  if (code === 'not_found') return { retry: null, action: { href: '/', label: 'Empezar una nueva' }, ends: null };
  // El mensaje no es válido: enviarlo otra vez daría lo mismo.
  if (code === 'validation_error') return { retry: null, action: null, ends: null };
  return { retry, action: null, ends: null };
}

/** Cierra el chat: fuera el cuadro de texto, y el panel que toque (empezar otra, o volver mañana). */
function endConversation(panel: HTMLElement = conversationEnd): void {
  form.hidden = true;
  panel.hidden = false;
}

/** Avisa de los mensajes que quedan cuando son pocos, y cierra al llegar a cero. */
function updateTurnsLeft(): void {
  const turns = remainingTurns(initialMessageCount + pastMessages.length);
  if (turns === 0) {
    endConversation();
    return;
  }
  turnsLeftNotice.hidden = turns > CONVERSATION_WARNING_TURNS;
  turnsLeftNotice.textContent =
    turns === 1
      ? 'Te queda 1 mensaje en esta conversación.'
      : `Te quedan ${String(turns)} mensajes en esta conversación.`;
}

/** El contador del día y «Recomiéndame ya», que sobra cuando ya ha recomendado. */
function updateRecommendations(): void {
  if (recommendationsLeft !== null) {
    recommendationsCount.textContent =
      recommendationsLeft === 0
        ? 'Era tu última recomendación de hoy'
        : recommendationsLeft === 1
          ? 'Te queda 1 recomendación hoy'
          : `Te quedan ${String(recommendationsLeft)} recomendaciones hoy`;
  }
  // Oculto ya desde el servidor si la conversación guardada tenía recomendaciones.
  skipButton.hidden ||= pastMessages.some((message) => (message.recommendation_ids ?? []).length > 0);
}

/** Animación de entrada; el CSS está en `global.css`. */
function revealCard(card: HTMLElement, index: number): void {
  card.style.setProperty('--reveal-delay', `${String(index * 150)}ms`);
  card.classList.add('reveal-card');
  const poster = card.querySelector<HTMLImageElement>('[data-field="poster"]');
  if (poster === null || poster.hidden) return;
  // Sin esperar a la carga, el revelado pasaría sobre un hueco vacío.
  poster.dataset.develop = 'waiting';
  const develop = (): void => {
    poster.dataset.develop = 'on';
  };
  poster.addEventListener('load', develop, { once: true });
  poster.addEventListener('error', develop, { once: true });
}

function renderCards(bubble: HTMLElement, recommendations: readonly Recommendation[]): void {
  part(bubble, 'cards').replaceChildren(
    ...recommendations.map((recommendation, index) => {
      const card = clone(templates.card);
      fillContentCard(card, recommendation, favorites.has(recommendation.id));
      revealCard(card, index);
      return card;
    }),
  );
}

/** Las respuestas que Umber propone a su pregunta: pulsar una la envía, como si se escribiera. */
function showQuickReplies(options: readonly string[]): void {
  quickReplies.replaceChildren(
    ...options.map((option) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      // Que se vean todas: son dos o tres, y una escondida a la derecha no se pulsa.
      button.className = 'chip text-left';
      button.textContent = option;
      button.addEventListener('click', () => {
        void send(option);
      });
      item.append(button);
      return item;
    }),
  );
  quickReplies.hidden = options.length === 0;
}

function setBusy(busy: boolean): void {
  sendButton.disabled = busy;
  skipButton.disabled = busy;
  stopButton.hidden = !busy;
  list.setAttribute('aria-busy', String(busy));
}

// ─── Enviar ──────────────────────────────────────────────────────────────────

const NETWORK_ERROR = 'No hay conexión con Umber. Revisa tu red y vuelve a intentarlo.';
const CUT_ERROR = 'La respuesta se ha cortado a medias. Vuelve a intentarlo.';

async function readError(response: Response): Promise<{ code: string | null; message: string }> {
  try {
    const body: unknown = await response.json();
    if (isApiErrorBody(body)) return body.error;
  } catch {
    // Sin cuerpo JSON: vale el mensaje genérico.
  }
  return { code: null, message: 'Algo ha fallado por nuestra parte. Vuelve a intentarlo en un momento.' };
}

function requestBody(message: string): ChatRequestBody {
  // Con conversación guardada, el servidor lee el historial de Supabase.
  return conversationId === null
    ? { mode, message, history: pastMessages, ...(specialty === null ? {} : { specialty }) }
    : { mode, message, conversation_id: conversationId };
}

/**
 * Envía un mensaje. Con `bubble`, es un reintento: se reutiliza la respuesta
 * fallida y no se repite el mensaje del usuario en pantalla.
 */
async function send(message: string, bubble?: HTMLElement): Promise<void> {
  if (controller !== null) return;
  if (emptyState !== null) emptyState.hidden = true;
  showQuickReplies([]);
  // Un mensaje nuevo deja atrás los fallidos: reintentarlos ahora los mandaría
  // después de este, y el historial quedaría desordenado.
  if (bubble === undefined) {
    list.querySelectorAll<HTMLButtonElement>('[data-retry]').forEach((button) => {
      button.hidden = true;
    });
  }

  const target =
    bubble ??
    keepPinned(() => {
      appendUserMessage(message);
      return appendAssistantMessage();
    });
  resetAssistantMessage(target);
  const retry = (): void => {
    void send(message, target);
  };

  const current = new AbortController();
  controller = current;
  setBusy(true);

  const status = part(target, 'status');
  const body = part(target, 'body');
  let text = '';
  let finished = false;

  /*
   * Como mucho un repintado por fotograma: cada uno rehace el HTML de toda la
   * respuesta y mide la página para seguir abajo, y los fragmentos llegan más
   * deprisa de lo que se ven. `flush` pinta ya lo pendiente, antes de las fichas
   * o de un error.
   */
  let frame: number | null = null;
  const paint = (): void => {
    frame = null;
    keepPinned(() => {
      status.hidden = true;
      body.innerHTML = renderReply(text);
    });
  };
  const flush = (): void => {
    if (frame === null) return;
    cancelAnimationFrame(frame);
    paint();
  };

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody(message)),
      signal: current.signal,
    });
    const isStream = response.headers.get('content-type')?.startsWith('text/event-stream') === true;
    if (!response.ok || !isStream || response.body === null) {
      const error = await readError(response);
      const recovery = recoveryFor(error.code, retry);
      showError(target, error.message, recovery);
      if (recovery.ends !== null) endConversation(recovery.ends);
      return;
    }

    for await (const event of readChatEvents(response.body)) {
      if (event.event === 'delta') {
        text += event.data.text;
        frame ??= requestAnimationFrame(paint);
      } else if (event.event === 'searching') {
        status.textContent = SEARCHING;
      } else if (event.event === 'done') {
        flush();
        finished = true;
        pastMessages.push(
          { role: 'user', content: message },
          {
            role: 'assistant',
            content: text,
            recommendation_ids: event.data.recommendations.map((item) => item.id),
            ...(event.data.search === null ? {} : { search: event.data.search }),
            ...(event.data.options.length === 0 ? {} : { options: event.data.options }),
          },
        );
        if (event.data.conversation_id !== null) {
          conversationId = event.data.conversation_id;
          // Recargar la página vuelve a esta conversación en vez de empezar otra.
          window.history.replaceState(null, '', `/chat?conversation=${conversationId}`);
        }
        keepPinned(() => {
          renderCards(target, event.data.recommendations);
          showQuickReplies(event.data.options);
        });
        updateTurnsLeft();
        // Cada respuesta que recomienda gasta una del día (`countRecommendation` en el servidor).
        if (event.data.recommendations.length > 0) {
          if (recommendationsLeft !== null) recommendationsLeft = Math.max(0, recommendationsLeft - 1);
          updateRecommendations();
        }
      } else {
        flush();
        finished = true;
        const recovery = recoveryFor(event.data.code, retry);
        showError(target, event.data.message, recovery);
        if (recovery.ends !== null) endConversation(recovery.ends);
      }
    }
    if (!finished) {
      flush();
      showError(target, CUT_ERROR, { retry, action: null });
    }
  } catch (error: unknown) {
    flush();
    if (current.signal.aborted) {
      showError(target, 'Has detenido la respuesta.', { retry, action: null });
    } else {
      // A la persona le basta «sin conexión»; el error de verdad, a la consola.
      console.error('[chat]', error);
      showError(target, NETWORK_ERROR, { retry, action: null });
    }
  } finally {
    controller = null;
    setBusy(false);
  }
}

// ─── Eventos ─────────────────────────────────────────────────────────────────

/** El cuadro crece con el texto hasta el `max-height` del CSS. */
function fitInput(): void {
  input.style.height = 'auto';
  input.style.height = `${String(input.scrollHeight)}px`;
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (message.length === 0 || controller !== null) return;
  input.value = '';
  fitInput();
  void send(message);
});

input.addEventListener('input', fitInput);

input.addEventListener('keydown', (event) => {
  // Intro envía; con Mayúsculas, salto de línea. `isComposing`: no cortar un acento a medias.
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    form.requestSubmit();
  }
});

stopButton.addEventListener('click', () => {
  controller?.abort();
});

/*
 * Sin sesión, la charla solo vive en memoria: ir a «Entrar» la perdería. Si ya
 * hay algo hablado, el enlace se abre en otra pestaña, como el de las fichas;
 * tras entrar allí, el siguiente mensaje de esta ya va con sesión y el servidor
 * guarda también lo anterior. Vale para el de la cabecera y para cualquier otro.
 */
document.addEventListener('click', (event) => {
  if (conversationId !== null || pastMessages.length === 0) return;
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href^="/entrar"]') : null;
  if (link === null || link.target === '_blank') return;
  event.preventDefault();
  window.open(link.href, '_blank', 'noopener');
});

skipButton.addEventListener('click', () => {
  void send('Recomiéndame ya, sin más preguntas');
});

root.querySelectorAll<HTMLButtonElement>('[data-suggestion]').forEach((button) => {
  button.addEventListener('click', () => {
    const text = button.textContent?.trim() ?? '';
    if (text.length > 0) void send(text);
  });
});

// Una conversación guardada que acabó en pregunta vuelve con sus respuestas para pulsar.
showQuickReplies(JSON.parse(quickReplies.dataset.options ?? '[]') as string[]);

// En una conversación guardada, abrir la página lleva al último mensaje.
if (list.children.length > 0) window.scrollTo({ top: document.documentElement.scrollHeight });
updateTurnsLeft();
updateRecommendations();

// Llega desde la portada con su primer mensaje: se envía ya. Fuera de la URL,
// para que recargar no lo vuelva a mandar.
const initialMessage = root.dataset.initialMessage ?? '';
if (initialMessage.length > 0) {
  window.history.replaceState(null, '', `/chat?mode=${mode}${specialty === 'autumn' ? '&especialidad=otono' : ''}`);
  void send(initialMessage);
}
