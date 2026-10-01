/**
 * Las formas que viajan entre el backend y las pantallas.
 *
 * El seed de la demo se escribe contra estos mismos tipos: un campo que cambie en el
 * backend rompe la compilacion de la demo, no la cara de quien la abre.
 */

export type Marca = { _seconds: number }

export type Categoria =
  | 'limpio'
  | 'ruido'
  | 'ofensivo'
  | 'datos_personales'
  | 'amenaza'
  | 'ilegal'
  | 'spam'

export type Accion = 'publicar' | 'publicar_y_revisar' | 'retener'

export type Espacio = {
  id: string
  nombre: string
  descripcion: string
  miembros: number
  publicaciones_semana: number
}

export type Publicacion = {
  id: string
  espacio_id: string
  espacio_nombre: string
  autor_nombre: string
  titulo: string
  cuerpo: string
  creado_en: Marca
  respuestas: number
  estado: 'publicado' | 'retenido'
}

export type EnCola = {
  id: string
  publicacion_id: string
  accion: Accion
  categoria: Categoria
  confianza: number
  motivo: string
  creado_en: Marca
  autor_nombre: string
  /** Sanciones previas DE ESTE AUTOR. Sin filtrar por autor, todos son reincidentes. */
  autor_sanciones: number
  autor_dias: number
  titulo: string
  extracto: string
}

export type Cola = {
  cola: EnCola[]
  /** Lo que no cabe en el tope. Se dice en voz alta: una cola que crece es una senyal. */
  desbordadas: number
}

export type Resumen = {
  miembro: string
  espacios: string[]
  publicaciones: Array<{ titulo: string; espacio: string; respuestas: number }>
}
