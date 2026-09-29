import { z } from 'zod'

/**
 * Los campos declarados en el blueprint, y solo esos.
 *
 * `.strict()` no es cosmetico: sin el, un cliente puede colar un campo extra --
 * `role`, `owner_id`, `estado` -- que ninguna regla mira porque nadie sabia que
 * existia. Rechazar lo no declarado es lo que hace que la lista de campos signifique
 * algo.
 *
 * Los tipos concretos se afinan al escribir el motor de este producto; lo que esta
 * fijado desde el blueprint es QUE campos existen.
 */
export const esquemaModerationQueue = z
  .object({
  objeto_tipo: z.unknown(),
  objeto_id: z.unknown(),
  motivo_ia: z.unknown(),
  confianza: z.unknown(),
  estado: z.unknown(),
  decidido_por: z.unknown(),
  decidido_en: z.unknown(),
  })
  .strict()

export type ModerationQueue = z.infer<typeof esquemaModerationQueue>
