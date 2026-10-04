# Fase 7 — Premium (futuro)

**Estado:** 💤 Futuro — **no empezar** hasta que el producto gratuito esté en
producción, completo y estable (Fase 6). Esto es un plan para cuando toque.
**Depende de:** [Fase 6](fase-6-pulido-despliegue.md) ⏳
**Actualizado:** 2026-10-04

## Objetivo

Un plan de pago para quien use Umber a menudo, que cubra con margen su coste de
DeepSeek, sin quitarle al plan gratuito lo que lo hace útil: el gratuito es el
que trae gente, y premium es para quien ya la ha traído.

## Prerrequisitos

Ninguno es código, y todos van antes de cobrar el primer euro:

- [ ] **Producto gratuito completo y en producción**, con su dominio propio y su
      correo (Fase 6)
- [ ] **Alta fiscal**: en España hace falta estar dado de alta (autónomo o
      sociedad) para facturar, y tiene su cuota. Hablarlo con un gestor antes
      de nada
- [ ] **Hosting con uso comercial**: el plan Hobby de Vercel es solo para uso
      no comercial. Opciones a comparar entonces, con sus condiciones
      vigentes: Vercel Pro (unos 20 $/mes) o Cloudflare Workers de pago (unos
      5 $/mes; el gratuito limita la CPU a 10 ms por petición y puede no bastar
      para pintar las páginas)
- [ ] **Textos legales de venta**: condiciones de contratación, desistimiento
      (en contenido digital, el cliente renuncia de forma expresa al empezar a
      usarlo), reembolsos y baja. Que los revise alguien que sepa

## Planes propuestos

| | Sin cuenta | Gratis | Premium |
|---|---|---|---|
| Precio | — | — | 2,99 €/mes o 24,99 €/año |
| Mensajes | Una conversación de prueba al día | 50 al día | 100 al día, con tope de 1.500 al mes |
| Mensajes por conversación | 40 | 40 | 80 |
| Película y Serie | ✓ | ✓ | ✓ |
| **Fin de semana** y **Mes otoñal** | — | — | ✓ |
| Solo lo que se puede ver en sus plataformas | — | — | ✓ |
| Recomendaciones según sus gustos (favoritos e historial) | — | — | ✓ |
| Calendario del mes exportable (`.ics`) | — | — | ✓ |

Los modos `weekend` y `month` son la estrella: ya están diseñados (tipos y
constantes en `src/lib/types.ts`) y son lo que no tiene un buscador.

## Cuentas

Estimación con los datos de hoy; **medir antes de fijar precio**:

- Un mensaje del chat cuesta algo menos de 0,001 USD de DeepSeek (estimado de
  lo que costó puntuar el corpus con llamadas de tamaño parecido; ver
  `src/lib/rate-limit.ts`). Antes de lanzar, registrar los tokens reales por
  mensaje y por modo
- Peor caso de un premium: 1.500 mensajes al mes, unos 1,5 USD
- Ingreso neto por suscripción mensual: unos 2,3 € tras la comisión de la
  pasarela (ver abajo)
- Hay margen incluso en el peor caso. **Fin de semana** y **Mes otoñal** podrán
  razonar (`docs/fase-4-api-chat.md`), y razonar gasta varias veces más: medir
  su coste por plan generado y darle su propio tope

## Pasarela de pago

| | Stripe | Lemon Squeezy o Paddle (*merchant of record*) |
|---|---|---|
| Comisión | Menor (sin cuota mensual) | Mayor: en torno al 5 % + 0,50 por venta |
| IVA europeo y facturas | Los gestionas tú (o Stripe Tax, de pago) | Los gestiona la pasarela: vende ella y te paga a ti |
| Tarjetas | En su página: no tocamos datos de pago | Igual |

Para una persona sola en España, la de *merchant of record* ahorra el IVA de
cada país europeo y la facturación. Decidirlo con el gestor.

## Diseño técnico

- **Tabla `subscriptions`**: `user_id` (único), `provider`, ids del cliente y
  de la suscripción en la pasarela, `plan`, `status`, `current_period_end`,
  `cancel_at_period_end`, `updated_at`. RLS: cada usuario lee la suya; solo la
  secret key escribe
- **Webhook `POST /api/billing/webhook`**: verifica la firma (HMAC), es
  idempotente (tabla de eventos ya procesados) y actualiza la suscripción. La
  pasarela es la fuente de verdad; la app nunca decide sola que alguien pagó
- **Alta**: enlace a la página de pago de la pasarela con el `user_id` en sus
  datos; vuelve a `/cuenta`. **Gestión y baja**: el portal de la pasarela
- **Plan del usuario**: una función de servidor que lo lea de `subscriptions`
  (activo, en prueba, o con el pago fallido durante unos días de gracia). De
  ella salen los límites de `src/lib/rate-limit.ts` y los modos disponibles
- **Tope global por plan**: hoy hay uno solo (300 al día). Premium necesita el
  suyo, para que un pico de usuarios gratuitos no deje sin servicio a quien paga
- **Interfaz**: `/premium` con los planes; en `/cuenta`, el plan y su gestión;
  y la invitación en los sitios donde se nota el límite (fin de la prueba,
  límite diario, modos de la portada)
- **Pruebas**: firma inválida rechazada, evento repetido sin efecto, baja al
  final del periodo, límites y modos según el plan

## Preguntas abiertas

1. **Precio final** y si hay prueba gratuita (7 días)
2. **Qué es gratis y qué premium**: «Solo lo que puedo ver en mis plataformas»
   podría ser gratis y atraer más gente
3. **Pasarela**, con el gestor
4. **Hosting comercial**: comparar entonces condiciones y precio

## Verificación

- Un pago de prueba activa premium en segundos; la baja lo quita al final del
  periodo pagado
- Un webhook con la firma mal no cambia nada
- Con los tokens medidos, el peor caso de un premium sale rentable
