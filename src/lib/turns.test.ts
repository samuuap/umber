import { describe, expect, test } from 'vitest';

import {
  MAX_QUESTIONS,
  MIN_QUESTIONS,
  conversationState,
  parseTurnMeta,
  turnToolsFor,
  wantsToSkipQuestions,
} from '@/lib/turns';
import type { ChatHistoryMessage } from '@/lib/types';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

const user = (content: string): ChatHistoryMessage => ({ role: 'user', content });
const question = (content = '¿Con quién la vas a ver?'): ChatHistoryMessage => ({ role: 'assistant', content });

/** Una conversación con `count` preguntas de Umber seguidas, sin buscar. */
function questions(count: number): ChatHistoryMessage[] {
  return Array.from({ length: count }, () => [user('algo'), question()]).flat();
}

const searched: ChatHistoryMessage = {
  role: 'assistant',
  content: 'Te propongo **Una**.',
  search: {
    summary: 'cozy rainy afternoon',
    candidates: [
      { id: A, similarity: 0.5 },
      { id: B, similarity: 0.4 },
      { id: C, similarity: 0.3 },
    ],
  },
  recommendation_ids: [A],
};

describe('conversationState', () => {
  test('cuenta las preguntas seguidas del final', () => {
    expect(conversationState(questions(2)).pendingQuestions).toBe(2);
  });

  test('tras buscar, quedan los candidatos que aún no ha recomendado', () => {
    const state = conversationState([...questions(3), user('vale'), searched]);
    expect(state.lastSearch?.summary).toBe('cozy rainy afternoon');
    expect(state.remaining.map((candidate) => candidate.id)).toEqual([B, C]);
    expect(state.pendingQuestions).toBe(0);
  });

  test('las preguntas después de una búsqueda vuelven a contar desde cero', () => {
    const state = conversationState([searched, user('otra cosa'), question()]);
    expect(state.pendingQuestions).toBe(1);
  });
});

describe('turnToolsFor', () => {
  test(`antes de ${String(MIN_QUESTIONS)} preguntas no puede buscar por ánimo, pero sí un título`, () => {
    const tools = turnToolsFor(conversationState(questions(MIN_QUESTIONS - 1)));
    expect(tools).toEqual({ moodSearch: false, titleSearch: true, choice: 'auto' });
  });

  test('si pide que le recomiende ya, puede buscar sin preguntar', () => {
    expect(turnToolsFor(conversationState([]), true).moodSearch).toBe(true);
  });

  test(`con ${String(MIN_QUESTIONS)} preguntas elige él`, () => {
    const tools = turnToolsFor(conversationState(questions(MIN_QUESTIONS)));
    expect(tools).toEqual({ moodSearch: true, titleSearch: true, choice: 'auto' });
  });

  test(`con ${String(MAX_QUESTIONS)} preguntas está obligado a buscar por ánimo`, () => {
    const tools = turnToolsFor(conversationState(questions(MAX_QUESTIONS)));
    expect(tools).toEqual({ moodSearch: true, titleSearch: false, choice: 'required' });
  });
});

test.each(['Sorpréndeme', 'recomiéndame algo ya', 'sin más preguntas', 'tú eliges', 'just recommend one'])(
  'wantsToSkipQuestions: «%s»',
  (message) => {
    expect(wantsToSkipQuestions(message)).toBe(true);
  },
);

test.each(['Algo de miedo', 'quiero una comedia', 'ya la he visto'])('no pide saltarse las preguntas: «%s»', (message) => {
  expect(wantsToSkipQuestions(message)).toBe(false);
});

describe('parseTurnMeta', () => {
  test('descarta lo mal formado sin romper', () => {
    expect(parseTurnMeta({ recommendation_ids: ['no-es-un-uuid'], search: { summary: '', candidates: [] } })).toEqual(
      {},
    );
  });

  test('conserva lo bueno', () => {
    expect(parseTurnMeta({ recommendation_ids: [A] })).toEqual({ recommendation_ids: [A] });
  });

  test('no acepta más de 10 candidatos', () => {
    const candidates = Array.from({ length: 11 }, () => ({ id: A, similarity: 0.5 }));
    expect(parseTurnMeta({ search: { summary: 'x', candidates } })).toEqual({});
  });
});
