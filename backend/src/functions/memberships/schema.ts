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
export const esquemaMemberships = z
  .object({
  user_id: z.unknown(),
  nivel: z.unknown(),
  estado: z.unknown(),
  vence_en: z.unknown(),
  stripe_subscription_id: z.unknown(),
  alta_en: z.unknown(),
  })
  .strict()

export type Memberships = z.infer<typeof esquemaMemberships>
