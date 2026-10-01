import type { Cola, EnCola, Espacio, Publicacion, Resumen } from './tipos'

/**
 * Los datos de la demo publica. Inventados, y la pantalla lo dice.
 *
 * Elegidos para ensenar la decision que distingue a este producto de un filtro de spam:
 * aqui la duda se resuelve PUBLICANDO.
 *
 *   - Una retenida de verdad (datos personales con confianza alta). Es la unica que
 *     nadie ve mientras espera.
 *   - Dos publicadas-y-en-revision: estan en la cola y en el foro a la vez. Es el caso
 *     que hay que poder ver para entender el producto.
 *   - Una retenida por patron de cuenta nueva, no por lo que dice.
 *   - Y un resumen semanal que incluye a un miembro con cosas que leer y deja fuera al
 *     que no tiene ninguna: un digest vacio es la forma mas rapida de que te marquen
 *     como spam.
 */

/**
 * La demo se ancla al momento en que se abre, no a una fecha escrita.
 *
 * Con una fecha fija la demo envejece sola: en diciembre un turno "de hoy" sale con
 * fecha de octubre y un reintento "manyana" sale pasado hace dos meses. Una demo con
 * fechas rancias dice de la empresa exactamente lo contrario de lo que queremos.
 *
 * Redondeado a la hora en punto: un turno de 07:54 a 15:54 no existe en ningun cuadrante
 * del mundo, y ese detalle es lo primero que ve alguien que trabaja con turnos.
 */
const AHORA = Math.floor(Date.now() / 3_600_000) * 3600
const horas = (n: number) => ({ _seconds: AHORA + n * 3600 })

const ESPACIOS: Espacio[] = [
  { id: 'esp_general', nombre: 'General', descripcion: 'Anything that does not fit elsewhere.', miembros: 512, publicaciones_semana: 38 },
  { id: 'esp_pedir', nombre: 'Ask the room', descripcion: 'Questions members want answered by other members.', miembros: 404, publicaciones_semana: 61 },
  { id: 'esp_trabajo', nombre: 'Jobs board', descripcion: 'Hiring and looking. One post per role.', miembros: 287, publicaciones_semana: 9 },
  { id: 'esp_anuncios', nombre: 'Announcements', descripcion: 'Read-only. Posts come from the team.', miembros: 512, publicaciones_semana: 2 },
]

const PUBLICACIONES: Publicacion[] = [
  {
    id: 'pub_1',
    espacio_id: 'esp_pedir',
    espacio_nombre: 'Ask the room',
    autor_nombre: 'Rae Ortiz',
    titulo: 'How are you handling VAT on cross-border invoices?',
    cuerpo: 'We just took on two clients in Ireland and I cannot work out whether to charge it.',
    creado_en: horas(-2),
    respuestas: 7,
    estado: 'publicado',
  },
  {
    id: 'pub_2',
    espacio_id: 'esp_general',
    espacio_nombre: 'General',
    autor_nombre: 'Tom Vester',
    titulo: 'Anyone else had the September invoice arrive twice?',
    cuerpo: 'Not a complaint, just checking whether it is me or everyone.',
    creado_en: horas(-5),
    respuestas: 12,
    estado: 'publicado',
  },
  {
    id: 'pub_3',
    espacio_id: 'esp_trabajo',
    espacio_nombre: 'Jobs board',
    autor_nombre: 'Nadia Brem',
    titulo: 'Looking for a part-time bookkeeper, remote, UK hours',
    cuerpo: 'Around 10 hours a week. Reply here or DM me.',
    creado_en: horas(-9),
    respuestas: 3,
    estado: 'publicado',
  },
  {
    // En el foro Y en la cola. Es el caso que explica el producto entero.
    id: 'pub_4',
    espacio_id: 'esp_general',
    espacio_nombre: 'General',
    autor_nombre: 'Jon K.',
    titulo: 'This whole thing is a waste of money and you all know it',
    cuerpo: 'Been here four months and nothing has improved.',
    creado_en: horas(-1),
    respuestas: 2,
    estado: 'publicado',
  },
  {
    id: 'pub_5',
    espacio_id: 'esp_pedir',
    espacio_nombre: 'Ask the room',
    autor_nombre: 'Priya Shah',
    titulo: 'Which accountant do you use in Manchester?',
    cuerpo: 'Happy to take recommendations by DM if people prefer.',
    creado_en: horas(-4),
    respuestas: 5,
    estado: 'publicado',
  },
]

const COLA: EnCola[] = [
  {
    // Retenida de verdad: lo grave con confianza razonable no se publica y se mira.
    id: 'mod_1',
    publicacion_id: 'pub_6',
    accion: 'retener',
    categoria: 'datos_personales',
    confianza: 0.91,
    motivo: 'datos_personales (0.91)',
    creado_en: horas(-1),
    autor_nombre: 'Eli Faber',
    autor_sanciones: 0,
    autor_dias: 230,
    titulo: 'Here is the full client list with phone numbers',
    extracto: 'Attaching the spreadsheet so everyone can see who we are working with…',
  },
  {
    // Retenida por el patron de la cuenta, no por lo que dice.
    id: 'mod_2',
    publicacion_id: 'pub_7',
    accion: 'retener',
    categoria: 'spam',
    confianza: 0.78,
    motivo: 'cuenta de 1 dia con 4 publicaciones',
    creado_en: horas(-2),
    autor_nombre: 'growthhacks_pro',
    autor_sanciones: 0,
    autor_dias: 1,
    titulo: 'FREE audit for the first 10 people who DM me',
    extracto: 'I help founders 10x their revenue in 30 days, no upfront cost…',
  },
  {
    // Publicada y en revision: nadie espera, y un humano lo mira cuando puede.
    id: 'mod_3',
    publicacion_id: 'pub_4',
    accion: 'publicar_y_revisar',
    categoria: 'ofensivo',
    confianza: 0.52,
    motivo: 'posible ofensivo, sin certeza',
    creado_en: horas(-1),
    autor_nombre: 'Jon K.',
    autor_sanciones: 0,
    autor_dias: 124,
    titulo: 'This whole thing is a waste of money and you all know it',
    extracto: 'Been here four months and nothing has improved.',
  },
  {
    id: 'mod_4',
    publicacion_id: 'pub_5',
    accion: 'publicar_y_revisar',
    categoria: 'datos_personales',
    confianza: 0.44,
    motivo: 'confianza 0.44',
    creado_en: horas(-4),
    autor_nombre: 'Priya Shah',
    autor_sanciones: 0,
    autor_dias: 611,
    titulo: 'Which accountant do you use in Manchester?',
    extracto: 'Happy to take recommendations by DM if people prefer.',
  },
]

const RESUMENES: Resumen[] = [
  {
    miembro: 'Rae Ortiz',
    espacios: ['Ask the room', 'General'],
    publicaciones: [
      { titulo: 'Anyone else had the September invoice arrive twice?', espacio: 'General', respuestas: 12 },
      { titulo: 'Which accountant do you use in Manchester?', espacio: 'Ask the room', respuestas: 5 },
    ],
  },
  {
    miembro: 'Nadia Brem',
    espacios: ['Jobs board'],
    publicaciones: [
      { titulo: 'How are you handling VAT on cross-border invoices?', espacio: 'Ask the room', respuestas: 7 },
    ],
  },
]

const COLA_RESPUESTA: Cola = { cola: COLA, desbordadas: 0 }

export const DEMO: Record<string, unknown> = {
  '/espacios': { espacios: ESPACIOS },
  '/publicaciones': { publicaciones: PUBLICACIONES },
  '/moderacion/cola': COLA_RESPUESTA,
  // Dos resumenes para 512 miembros no es un error: solo sale quien tiene algo que leer.
  '/resumenes/semana': { resumenes: RESUMENES, miembros_totales: 512, sin_nada_que_leer: 510 },
}
