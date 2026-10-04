-- Trazabilidad: cada petición al chat y al buscador, y cada llamada a un modelo
-- (DeepSeek y embeddings) que hizo. Lo escribe el servidor con la secret key
-- (`src/lib/trace.ts`) y lo leerá el panel de administración (Fase 8, bloque D).
--
-- Tres niveles, según lo que cuesta guardar cada cosa:
--  · chat_traces y llm_calls: una fila por petición admitida y otra por llamada.
--    El texto (lo que se escribió, la respuesta, la búsqueda) se borra a los
--    30 días; la fila entera, a los 90 (`prune_traces`, con pg_cron).
--  · usage_daily: tokens y coste por día, modelo y propósito. No caduca.
--  · request_daily: peticiones por día, endpoint y estado, también las
--    rechazadas. Una petición que no pasa el rate limit (o ni siquiera es
--    válida) solo suma aquí: si dejara una fila, insistir llenaría la base.

create table public.chat_traces (
  id                 uuid        primary key,
  created_at         timestamptz not null default now(),
  endpoint           text        not null check (endpoint in ('chat', 'search')),
  -- Borrar la cuenta o la conversación borra sus trazas: los agregados diarios
  -- no llevan nada de nadie y se quedan.
  user_id            uuid        references auth.users (id) on delete cascade,
  conversation_id    uuid        references public.conversations (id) on delete cascade,
  -- HMAC de la clave de rate limit (la IP, o su /64): agrupa sin guardar la IP.
  client_hash        text,
  mode               text,
  language           text,
  -- HTTP; en el chat, el error que llegó por el stream, o 499 si la persona se fue.
  status             smallint    not null,
  error_code         text,
  duration_ms        integer     not null check (duration_ms >= 0),
  -- Hasta que la persona ve el primer texto.
  first_byte_ms      integer,
  message            text,
  reply              text,
  search             jsonb,
  recommendation_ids uuid[]      not null default '{}',
  -- Títulos en negrita que no venían de ninguna búsqueda: inventados.
  unknown_titles     text[]      not null default '{}',
  steps              jsonb       not null default '[]',
  meta               jsonb       not null default '{}'
);

comment on table public.chat_traces is
  'Una fila por petición admitida al chat o al buscador. El texto se borra a los 30 días y la fila a los 90.';

create index chat_traces_created_at_idx on public.chat_traces (created_at desc);
create index chat_traces_user_idx on public.chat_traces (user_id, created_at desc) where user_id is not null;
-- Para el borrado en cascada al borrar una conversación.
create index chat_traces_conversation_idx on public.chat_traces (conversation_id) where conversation_id is not null;

create table public.llm_calls (
  id                uuid           primary key default gen_random_uuid(),
  trace_id          uuid           not null references public.chat_traces (id) on delete cascade,
  created_at        timestamptz    not null default now(),
  provider          text           not null,
  model             text           not null,
  purpose           text           not null,
  -- Hash del system prompt y la plantilla: para comparar versiones.
  prompt_version    text,
  status            text           not null check (status in ('ok', 'error', 'aborted')),
  error             text,
  input_tokens      integer,
  output_tokens     integer,
  cache_hit_tokens  integer,
  cache_miss_tokens integer,
  -- Calculado al registrar, con el precio de ese momento: un cambio de precio no reescribe el pasado.
  cost_usd          numeric(12, 8) not null default 0,
  -- Desde el inicio de la petición.
  started_ms        integer        not null,
  first_token_ms    integer,
  duration_ms       integer        not null check (duration_ms >= 0),
  finish_reason     text,
  tool_name         text,
  tool_args         jsonb
);

comment on table public.llm_calls is
  'Cada llamada a un modelo (DeepSeek, embeddings), con tokens, coste y tiempos.';

create index llm_calls_trace_idx on public.llm_calls (trace_id);
create index llm_calls_created_at_idx on public.llm_calls (created_at desc);

create table public.usage_daily (
  day              date           not null,
  provider         text           not null,
  model            text           not null,
  purpose          text           not null,
  calls            integer        not null default 0,
  errors           integer        not null default 0,
  input_tokens     bigint         not null default 0,
  output_tokens    bigint         not null default 0,
  cache_hit_tokens bigint         not null default 0,
  cost_usd         numeric(14, 8) not null default 0,

  primary key (day, provider, model, purpose)
);

comment on table public.usage_daily is
  'Consumo por día (UTC), modelo y propósito. Sobrevive a la retención de llm_calls.';

create table public.request_daily (
  day       date     not null,
  endpoint  text     not null,
  status    smallint not null,
  signed_in boolean  not null,
  requests  integer  not null default 0,

  primary key (day, endpoint, status, signed_in)
);

comment on table public.request_daily is
  'Peticiones por día (UTC), endpoint y estado, también las rechazadas por el rate limit.';

-- Lo que escribe la gente y sus ids: solo el servidor.
alter table public.chat_traces enable row level security;
alter table public.llm_calls enable row level security;
alter table public.usage_daily enable row level security;
alter table public.request_daily enable row level security;
revoke all on table public.chat_traces, public.llm_calls, public.usage_daily, public.request_daily
  from anon, authenticated;

-- ─── record_trace ────────────────────────────────────────────────────────────
-- Guarda una petición y sus llamadas en un solo viaje: el chat lo hace justo
-- antes de cerrar el stream. `p_trace.admitted` dice si pasó el rate limit; si
-- no, solo cuenta en request_daily.

create or replace function public.record_trace(p_trace jsonb, p_calls jsonb)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_day      date    := (now() at time zone 'utc')::date;
  v_id       uuid    := (p_trace ->> 'id')::uuid;
  v_endpoint text    := p_trace ->> 'endpoint';
  v_status   integer := (p_trace ->> 'status')::integer;
begin
  if v_id is null or v_endpoint is null or v_status is null then
    raise exception 'record_trace: faltan id, endpoint o status' using errcode = '22023';
  end if;

  insert into public.request_daily as r (day, endpoint, status, signed_in, requests)
  values (v_day, v_endpoint, v_status, (p_trace ->> 'user_id') is not null, 1)
  on conflict (day, endpoint, status, signed_in) do update set requests = r.requests + 1;

  if not coalesce((p_trace ->> 'admitted')::boolean, false) then
    return;
  end if;

  insert into public.chat_traces (
    id, endpoint, user_id, conversation_id, client_hash, mode, language, status, error_code,
    duration_ms, first_byte_ms, message, reply, search, recommendation_ids, unknown_titles, steps, meta
  )
  values (
    v_id,
    v_endpoint,
    (p_trace ->> 'user_id')::uuid,
    -- Si no llegó a guardarse (falló el guardado), la traza queda sin ella en vez de fallar.
    (select c.id from public.conversations c where c.id = (p_trace ->> 'conversation_id')::uuid),
    p_trace ->> 'client_hash',
    p_trace ->> 'mode',
    p_trace ->> 'language',
    v_status,
    p_trace ->> 'error_code',
    greatest(coalesce((p_trace ->> 'duration_ms')::integer, 0), 0),
    (p_trace ->> 'first_byte_ms')::integer,
    p_trace ->> 'message',
    p_trace ->> 'reply',
    p_trace -> 'search',
    coalesce(array(select jsonb_array_elements_text(p_trace -> 'recommendation_ids'))::uuid[], '{}'),
    coalesce(array(select jsonb_array_elements_text(p_trace -> 'unknown_titles')), '{}'),
    coalesce(p_trace -> 'steps', '[]'),
    coalesce(p_trace -> 'meta', '{}')
  );

  insert into public.llm_calls (
    trace_id, provider, model, purpose, prompt_version, status, error, input_tokens, output_tokens,
    cache_hit_tokens, cache_miss_tokens, cost_usd, started_ms, first_token_ms, duration_ms,
    finish_reason, tool_name, tool_args
  )
  select v_id, c.provider, c.model, c.purpose, c.prompt_version, c.status, c.error, c.input_tokens,
         c.output_tokens, c.cache_hit_tokens, c.cache_miss_tokens, coalesce(c.cost_usd, 0),
         c.started_ms, c.first_token_ms, greatest(c.duration_ms, 0), c.finish_reason, c.tool_name, c.tool_args
  from jsonb_to_recordset(coalesce(p_calls, '[]')) as c (
    provider text, model text, purpose text, prompt_version text, status text, error text,
    input_tokens integer, output_tokens integer, cache_hit_tokens integer, cache_miss_tokens integer,
    cost_usd numeric, started_ms integer, first_token_ms integer, duration_ms integer,
    finish_reason text, tool_name text, tool_args jsonb
  );

  insert into public.usage_daily as u (
    day, provider, model, purpose, calls, errors, input_tokens, output_tokens, cache_hit_tokens, cost_usd
  )
  select v_day, c.provider, c.model, c.purpose, count(*), count(*) filter (where c.status <> 'ok'),
         sum(coalesce(c.input_tokens, 0)), sum(coalesce(c.output_tokens, 0)),
         sum(coalesce(c.cache_hit_tokens, 0)), sum(coalesce(c.cost_usd, 0))
  from jsonb_to_recordset(coalesce(p_calls, '[]')) as c (
    provider text, model text, purpose text, status text, input_tokens integer, output_tokens integer,
    cache_hit_tokens integer, cost_usd numeric
  )
  group by c.provider, c.model, c.purpose
  on conflict (day, provider, model, purpose) do update set
    calls            = u.calls + excluded.calls,
    errors           = u.errors + excluded.errors,
    input_tokens     = u.input_tokens + excluded.input_tokens,
    output_tokens    = u.output_tokens + excluded.output_tokens,
    cache_hit_tokens = u.cache_hit_tokens + excluded.cache_hit_tokens,
    cost_usd         = u.cost_usd + excluded.cost_usd;
end;
$$;

comment on function public.record_trace(jsonb, jsonb) is
  'Registra una petición y sus llamadas a modelos. Solo el servidor (secret key).';

revoke execute on function public.record_trace(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.record_trace(jsonb, jsonb) to service_role;

-- ─── Retención ───────────────────────────────────────────────────────────────
-- Decisión de producto (2026-10-04): el texto de las consultas, también de
-- quien no tiene cuenta, se guarda 30 días. Después quedan los números (tokens,
-- tiempos, estados) hasta los 90, y los agregados diarios para siempre.

create or replace function public.prune_traces()
returns void
language sql
volatile
set search_path = ''
as $$
  update public.chat_traces
     set message = null, reply = null, search = null
   where created_at < now() - interval '30 days'
     and (message is not null or reply is not null or search is not null);

  update public.llm_calls
     set tool_args = null
   where created_at < now() - interval '30 days'
     and tool_args is not null;

  delete from public.chat_traces where created_at < now() - interval '90 days';
$$;

comment on function public.prune_traces() is
  'Borra el texto de las trazas a los 30 días y las trazas a los 90. La ejecuta pg_cron cada noche.';

revoke execute on function public.prune_traces() from public, anon, authenticated;
grant execute on function public.prune_traces() to service_role;

create extension if not exists pg_cron with schema pg_catalog;

-- Cada noche a las 03:17 UTC, fuera de horas de uso.
select cron.schedule('umber-prune-traces', '17 3 * * *', 'select public.prune_traces()');
