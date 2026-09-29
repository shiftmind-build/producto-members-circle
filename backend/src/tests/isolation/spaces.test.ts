import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { readFileSync } from 'node:fs'

/**
 * Aislamiento de spaces. Obligatorio y bloqueante: corre en el hook pre-push.
 *
 * Lo que comprueba no es que la aplicacion funcione, es que NO funciona para quien no
 * debe. Un usuario que consigue leer la fila de otro es el fallo mas caro de un MVP y
 * el que no da ninguna senyal hasta que alguien lo descubre.
 *
 * Generado desde el bloque `acceso` de blueprint.yaml -- no se edita a mano: se cambia
 * el blueprint y se vuelve a generar, o la regla y el test dejan de hablar de lo mismo.
 */
describe('aislamiento: spaces', () => {
  let ctx: RulesTestEnvironment

  beforeAll(async () => {
    ctx = await initializeTestEnvironment({
      projectId: 'shiftmind-members-circle',
      firestore: {
        rules: readFileSync('firestore.rules', 'utf8'),
        host: '127.0.0.1',
        port: 8080,
      },
    })
  })

  afterAll(async () => {
    await ctx.cleanup()
  })

  beforeEach(async () => {
    await ctx.clearFirestore()
    await ctx.withSecurityRulesDisabled(async (libre) => {
      await libre.firestore().doc('spaces/d1').set({
      'nombre': 'x',
      'descripcion': 'x',
      'nivel_minimo': 'x',
      'orden': 'x',
      'activo': 'x'
})
    })
  })

  it('sin sesion no se lee nada', async () => {
    const fuera = ctx.unauthenticatedContext()
    await assertFails(fuera.firestore().doc('spaces/d1').get())
  })

  it('admin SI lee la fila, como declara el blueprint', async () => {
    const rol = ctx.authenticatedContext('uid-b', { role: 'admin' })
    await assertSucceeds(rol.firestore().doc('spaces/d1').get())
  })

  it('member SI lee la fila, como declara el blueprint', async () => {
    const rol = ctx.authenticatedContext('uid-b', { role: 'member' })
    await assertSucceeds(rol.firestore().doc('spaces/d1').get())
  })

  it('moderator SI lee la fila, como declara el blueprint', async () => {
    const rol = ctx.authenticatedContext('uid-b', { role: 'moderator' })
    await assertSucceeds(rol.firestore().doc('spaces/d1').get())
  })


  it('un tercero no puede modificar ni borrar la fila de otro', async () => {
    const otro = ctx.authenticatedContext('uid-c', { role: 'member' })
    await assertFails(otro.firestore().doc('spaces/d1').update({ estado: 'pirateado' }))
    await assertFails(otro.firestore().doc('spaces/d1').delete())
  })
})
