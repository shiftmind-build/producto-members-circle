/**
 * El resumen semanal. Sin esto, cualquier comunidad se apaga en seis semanas.
 *
 * El patron es siempre el mismo: la gente entra mucho la primera semana, luego se le
 * olvida, y cuando vuelve a acordarse hay doscientos mensajes sin leer y ya no entra.
 * El resumen rompe ese ciclo, pero solo si cumple tres cosas, y las tres estan aqui
 * porque las tres se incumplen por defecto:
 *
 *  1. NO SE MANDA SI NO HAY NADA. Un correo semanal que dice "esta semana: nada" enseña
 *     a la gente a ignorar tus correos, y ese aprendizaje no se revierte.
 *
 *  2. NO SE LE CUENTA A ALGUIEN LO QUE YA VIO. Quien entro ayer no necesita el resumen
 *     de ayer. Se calcula contra su ultima visita, no contra el lunes.
 *
 *  3. LO MEJOR PRIMERO, Y POCO. Cinco cosas buenas se leen; treinta se archivan.
 */

export type Publicacion = {
  id: string
  space_id: string
  titulo: string
  autor: string
  creado_en: number
  comentarios: number
  /** Solo lo publicado entra en un resumen. Lo retenido o lo oculto, nunca. */
  estado: 'publicado' | 'retenido' | 'oculto'
}

export type Miembro = {
  id: string
  /** Niveles a los que tiene acceso; un space por encima de su nivel no aparece. */
  spaces: string[]
  ultimaVisita: number
  estadoMembresia: 'activa' | 'vencida' | 'cancelada'
}

export const MAXIMO_POR_RESUMEN = 5

export type Resumen = {
  miembro: string
  publicaciones: Publicacion[];
  /** Cuantas quedaron fuera del corte, para poder decir "y 12 mas". */
  restantes: number
}

/**
 * Lo que se pierde este miembro, y nada mas.
 *
 * Devuelve null cuando no hay que mandar nada. Que devuelva null y no un resumen vacio
 * es intencionado: obliga a quien llame a distinguir "no hay nada" de "hay poco", y asi
 * no se puede mandar un correo vacio por descuido.
 */
export function resumenPara(
  miembro: Miembro,
  publicaciones: Publicacion[],
  ahora = Date.now(),
): Resumen | null {
  // A quien no esta al corriente de pago no se le manda: el resumen es una ventaja de
  // la membresia, y mandarselo a quien la dejo caducar es regalar el motivo de pagar.
  if (miembro.estadoMembresia !== 'activa') return null

  const suyas = publicaciones
    .filter((p) => p.estado === 'publicado')
    .filter((p) => miembro.spaces.includes(p.space_id))
    .filter((p) => p.creado_en > miembro.ultimaVisita)
    .filter((p) => p.creado_en <= ahora)

  if (suyas.length === 0) return null

  // "Lo mejor" es lo que genero conversacion, no lo mas reciente. Una publicacion con
  // quince respuestas vale mas que tres de ayer sin ninguna.
  const ordenadas = suyas
    .slice()
    .sort((a, b) => b.comentarios - a.comentarios || b.creado_en - a.creado_en)

  return {
    miembro: miembro.id,
    publicaciones: ordenadas.slice(0, MAXIMO_POR_RESUMEN),
    restantes: Math.max(0, ordenadas.length - MAXIMO_POR_RESUMEN),
  }
}

/** Los resumenes de toda la comunidad, ya filtrados: los que no tocan no salen. */
export function resumenesDeLaSemana(
  miembros: Miembro[],
  publicaciones: Publicacion[],
  ahora = Date.now(),
) {
  return miembros
    .map((m) => resumenPara(m, publicaciones, ahora))
    .filter((r): r is Resumen => r !== null)
}
