import { describe, expect, it } from 'vitest'
import {
  CONFIANZA_MINIMA,
  LIMITE_NOVATO,
  TOPE_COLA,
  decide,
  desborde,
  ordenaCola,
  type Autor,
  type EnCola,
} from '../../motor/moderacion.js'
import {
  MAXIMO_POR_RESUMEN,
  resumenPara,
  resumenesDeLaSemana,
  type Miembro,
  type Publicacion,
} from '../../motor/resumen.js'

/**
 * Lo que se prueba aqui no es que el motor "funcione": es la decision de producto que
 * lo separa de Doc Intake, y que si se pierde convierte el producto en otra cosa.
 *
 *   Ante la duda, en documentos se para. Aqui se publica y se revisa.
 *
 * Retener una publicacion legitima mata la conversacion, y una comunidad sin
 * conversacion esta muerta. Solo lo que no se puede recoger si sale se retiene.
 */

const veterano: Autor = { antiguedadDias: 400, sanciones: 0, hoy: 1 }

describe('moderacion: la duda se resuelve publicando', () => {
  it('lo limpio y con confianza sale al instante y no molesta a nadie', () => {
    const r = decide({ categoria: 'limpio', confianza: 0.95 }, veterano)
    expect(r.accion).toBe('publicar')
    expect(r.encolar).toBe(false)
  })

  it('un tono feo se publica igual, pero un moderador lo ve', () => {
    const r = decide({ categoria: 'tono', confianza: 0.9 }, veterano)
    expect(r.accion).toBe('publicar_y_revisar')
    expect(r.encolar).toBe(true)
  })

  it('fuera de tema no retiene: no es un danyo que no se pueda recoger', () => {
    expect(decide({ categoria: 'fuera_de_tema', confianza: 0.99 }, veterano).accion).toBe(
      'publicar_y_revisar',
    )
  })

  it('datos personales de terceros SI retiene, aunque el modelo no este seguro', () => {
    const r = decide({ categoria: 'datos_personales', confianza: 0.55 }, veterano)
    expect(r.accion).toBe('retener')
  })

  it.each(['amenaza', 'ilegal', 'spam'] as const)('%s retiene', (categoria) => {
    expect(decide({ categoria, confianza: 0.8 }, veterano).accion).toBe('retener')
  })

  it('lo grave con confianza minima se publica y se revisa, no se retiene a ciegas', () => {
    // 0.2 de confianza en "amenaza" es ruido del modelo. Retener por eso seria dejar
    // que un clasificador flojo silencie a la gente.
    const r = decide({ categoria: 'amenaza', confianza: 0.2 }, veterano)
    expect(r.accion).toBe('publicar_y_revisar')
  })

  it('un "limpio" con poca confianza no se cree del todo', () => {
    expect(decide({ categoria: 'limpio', confianza: CONFIANZA_MINIMA - 0.01 }, veterano).accion).toBe(
      'publicar_y_revisar',
    )
    expect(decide({ categoria: 'limpio', confianza: CONFIANZA_MINIMA }, veterano).accion).toBe(
      'publicar',
    )
  })

  it('una cuenta de hoy publicando sin parar se retiene por el patron, no por el texto', () => {
    const nueva: Autor = { antiguedadDias: 0, sanciones: 0, hoy: LIMITE_NOVATO }
    const r = decide({ categoria: 'limpio', confianza: 0.99 }, nueva)
    expect(r.accion).toBe('retener')
    expect(r.motivo).toContain('publicaciones')
  })

  it('una cuenta de hoy con una sola publicacion no se toca', () => {
    const nueva: Autor = { antiguedadDias: 0, sanciones: 0, hoy: 1 }
    expect(decide({ categoria: 'limpio', confianza: 0.99 }, nueva).accion).toBe('publicar')
  })

  it('un reincidente se publica igual, pero siempre se revisa', () => {
    const marcado: Autor = { antiguedadDias: 300, sanciones: 2, hoy: 1 }
    const r = decide({ categoria: 'limpio', confianza: 0.99 }, marcado)
    expect(r.accion).toBe('publicar_y_revisar')
    expect(r.encolar).toBe(true)
  })
})

describe('la cola de moderacion', () => {
  const item = (id: string, accion: EnCola['accion'], creado_en: number): EnCola => ({
    id,
    accion,
    creado_en,
    motivo: 'x',
  })

  it('lo retenido va primero: es lo unico con alguien esperando', () => {
    const cola = ordenaCola([
      item('viejo-revisar', 'publicar_y_revisar', 1),
      item('nuevo-retenido', 'retener', 100),
    ])
    expect(cola[0]!.id).toBe('nuevo-retenido')
  })

  it('dentro del mismo tipo, lo mas antiguo primero', () => {
    const cola = ordenaCola([
      item('b', 'retener', 200),
      item('a', 'retener', 100),
    ])
    expect(cola.map((c) => c.id)).toEqual(['a', 'b'])
  })

  it('la cola tiene tope, y el desborde se puede contar', () => {
    const muchos = Array.from({ length: TOPE_COLA + 12 }, (_, i) =>
      item(`i${i}`, 'publicar_y_revisar', i),
    )
    expect(ordenaCola(muchos)).toHaveLength(TOPE_COLA)
    expect(desborde(muchos)).toBe(12)
  })
})

describe('el resumen semanal', () => {
  const pub = (id: string, extra: Partial<Publicacion> = {}): Publicacion => ({
    id,
    space_id: 'general',
    titulo: id,
    autor: 'alguien',
    creado_en: 500,
    comentarios: 0,
    estado: 'publicado',
    ...extra,
  })
  const miembro: Miembro = {
    id: 'ana',
    spaces: ['general'],
    ultimaVisita: 100,
    estadoMembresia: 'activa',
  }

  it('no se manda nada cuando no ha pasado nada', () => {
    expect(resumenPara(miembro, [], 1000)).toBeNull()
  })

  it('no se le cuenta lo que ya vio', () => {
    const antes = pub('antes', { creado_en: 50 })
    expect(resumenPara(miembro, [antes], 1000)).toBeNull()
  })

  it('no se manda a quien dejo caducar la membresia', () => {
    const vencida: Miembro = { ...miembro, estadoMembresia: 'vencida' }
    expect(resumenPara(vencida, [pub('a')], 1000)).toBeNull()
  })

  it('no aparece un space al que no tiene acceso', () => {
    expect(resumenPara(miembro, [pub('vip', { space_id: 'premium' })], 1000)).toBeNull()
  })

  it('lo retenido y lo oculto nunca entran en un resumen', () => {
    const r = resumenPara(
      miembro,
      [pub('r', { estado: 'retenido' }), pub('o', { estado: 'oculto' })],
      1000,
    )
    expect(r).toBeNull()
  })

  it('ordena por conversacion, no por fecha', () => {
    const r = resumenPara(
      miembro,
      [pub('reciente-sin-nada', { creado_en: 900 }), pub('debate', { creado_en: 200, comentarios: 14 })],
      1000,
    )
    expect(r!.publicaciones[0]!.id).toBe('debate')
  })

  it('corta en cinco y dice cuantas quedan', () => {
    const muchas = Array.from({ length: MAXIMO_POR_RESUMEN + 7 }, (_, i) =>
      pub(`p${i}`, { comentarios: i }),
    )
    const r = resumenPara(miembro, muchas, 1000)!
    expect(r.publicaciones).toHaveLength(MAXIMO_POR_RESUMEN)
    expect(r.restantes).toBe(7)
  })

  it('en la tanda semanal solo salen los que tienen algo que contar', () => {
    const activa = { ...miembro, id: 'activa' }
    const aldia = { ...miembro, id: 'aldia', ultimaVisita: 900 }
    const vencida = { ...miembro, id: 'vencida', estadoMembresia: 'vencida' as const }
    const salen = resumenesDeLaSemana([activa, aldia, vencida], [pub('a', { creado_en: 500 })], 1000)
    expect(salen.map((r) => r.miembro)).toEqual(['activa'])
  })
})
