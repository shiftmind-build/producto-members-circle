/**
 * El triaje de moderacion. Es el motor de este producto.
 *
 * La decision de disenyo que lo separa de cualquier otro: **aqui la duda se resuelve al
 * reves que en Doc Intake.**
 *
 * En documentos, ante la duda se para y se llama a una persona, porque aprobar de menos
 * cuesta dinero. En una comunidad, retener una publicacion legitima durante tres horas
 * mata la conversacion -- y una comunidad sin conversacion esta muerta, que es un coste
 * mucho mayor que un comentario feo visible durante veinte minutos.
 *
 * Asi que hay dos niveles, y solo uno retiene:
 *
 *   RETENER      solo para lo que no se puede deshacer si sale: datos personales de
 *                terceros, amenazas, contenido ilegal, spam con enlaces. Aqui el danyo
 *                de publicarlo por error es mayor que el de retenerlo por error.
 *
 *   PUBLICAR Y   todo lo demas dudoso. Se ve al instante y ademas entra en la cola.
 *   REVISAR      Si el moderador decide que no valia, lo oculta -- pero mientras tanto
 *                la conversacion no se paro.
 *
 * Y una tercera regla que no viene del modelo: la cola tiene tope. Una cola que crece
 * sin limite deja de mirarse, y una cola que no se mira es peor que no tener cola,
 * porque da la sensacion de estar cubierto.
 */

export type Categoria =
  | 'limpio'
  | 'datos_personales'
  | 'amenaza'
  | 'ilegal'
  | 'spam'
  | 'tono'
  | 'fuera_de_tema'

/** Lo que no se puede deshacer si sale. Solo esto retiene. */
export const GRAVES: Categoria[] = ['datos_personales', 'amenaza', 'ilegal', 'spam']

export type Veredicto = { categoria: Categoria; confianza: number; nota?: string }

export type Accion = 'publicar' | 'publicar_y_revisar' | 'retener'

export type Resultado = {
  accion: Accion
  motivo: string
  /** Solo se encola lo que un moderador tiene que ver. */
  encolar: boolean
}

/**
 * Por debajo de esto no nos fiamos del "limpio" del modelo.
 *
 * Mas bajo que el 0.85 de Doc Intake a proposito: aqui un falso negativo se corrige
 * ocultando un mensaje, no devolviendo dinero.
 */
export const CONFIANZA_MINIMA = 0.7

/** Publicaciones por dia de un miembro nuevo antes de mirarlas. */
export const LIMITE_NOVATO = 3

export type Autor = {
  /** Dias desde el alta. Una cuenta de hoy no merece la misma confianza que una de un anyo. */
  antiguedadDias: number
  /** Cuantas veces le han ocultado algo. */
  sanciones: number
  /** Publicaciones suyas hoy. */
  hoy: number
}

export function decide(v: Veredicto, autor: Autor): Resultado {
  const grave = GRAVES.includes(v.categoria)

  // Lo grave con confianza razonable se retiene. No hace falta certeza para retener
  // veinte minutos algo que, si sale, no se puede recoger.
  if (grave && v.confianza >= 0.5) {
    return { accion: 'retener', motivo: `${v.categoria} (${v.confianza.toFixed(2)})`, encolar: true }
  }

  // Cuenta nueva pasada de vueltas: retener no por lo que dice, sino por el patron.
  // Las comunidades no se hunden por un mensaje, se hunden por una cuenta creada hace
  // diez minutos publicando quince veces.
  if (autor.antiguedadDias < 1 && autor.hoy >= LIMITE_NOVATO) {
    return {
      accion: 'retener',
      motivo: `cuenta de hoy con ${autor.hoy} publicaciones`,
      encolar: true,
    }
  }

  // Reincidente: se publica igual, pero un moderador lo ve siempre.
  if (autor.sanciones >= 2) {
    return { accion: 'publicar_y_revisar', motivo: `autor con ${autor.sanciones} sanciones`, encolar: true }
  }

  if (grave) {
    // Grave pero el modelo muy poco seguro. Publicar y que lo mire alguien.
    return { accion: 'publicar_y_revisar', motivo: `posible ${v.categoria}, sin certeza`, encolar: true }
  }

  if (v.categoria !== 'limpio') {
    return { accion: 'publicar_y_revisar', motivo: v.categoria, encolar: true }
  }

  if (v.confianza < CONFIANZA_MINIMA) {
    return { accion: 'publicar_y_revisar', motivo: `confianza ${v.confianza.toFixed(2)}`, encolar: true }
  }

  return { accion: 'publicar', motivo: 'limpio', encolar: false }
}

/**
 * Lo que de verdad ve el moderador, en orden y con tope.
 *
 * Ordenar por fecha parece lo natural y es lo peor: lo retenido -- que es lo unico que
 * tiene a alguien esperando -- quedaria detras de cien revisiones sin urgencia.
 */
export type EnCola = {
  id: string
  accion: Accion
  creado_en: number
  motivo: string
}

export const TOPE_COLA = 50

export function ordenaCola(items: EnCola[], tope = TOPE_COLA) {
  const peso = (a: Accion) => (a === 'retener' ? 0 : 1)
  return items
    .slice()
    .sort((x, y) => peso(x.accion) - peso(y.accion) || x.creado_en - y.creado_en)
    .slice(0, tope)
}

/**
 * Si la cola se desborda, el problema no es la cola.
 *
 * Devuelve cuanto sobra para que el panel pueda decirlo en voz alta en vez de esconder
 * la diferencia detras de un "50+". Una cola que crece mas rapido de lo que se vacia
 * significa que hay que subir el umbral o que hay un ataque, y las dos cosas hay que
 * verlas.
 */
export function desborde(items: EnCola[], tope = TOPE_COLA) {
  return Math.max(0, items.length - tope)
}
