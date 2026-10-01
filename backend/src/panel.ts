import type { Express, Request, Response } from 'express'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { asyncHandler } from './lib/asyncHandler.js'
import { requireRole } from './lib/auth.js'
import { GRAVES, type Categoria } from './motor/moderacion.js'

/**
 * Las lecturas del panel del moderador y del foro.
 *
 * Lo que compone este fichero, y que no esta en ninguna coleccion, es el CONTEXTO del
 * autor: cuantos dias lleva la cuenta y cuantas sanciones previas tiene. Sin eso, la
 * cola obliga a decidir sobre un parrafo suelto, y el mismo parrafo de una cuenta de un
 * dia y de una de dos anyos no significa lo mismo.
 *
 * Y una distincion que la pantalla tiene que poder hacer: lo retenido (nadie lo ve,
 * alguien espera) y lo publicado-y-marcado (ya esta vivo, solo necesita un vistazo). Un
 * moderador que las trata igual las trata todas como urgentes, y entonces ninguna lo es.
 */

function texto(v: unknown) {
  return typeof v === 'string' ? v : ''
}

function numero(v: unknown) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function segundos(t: unknown): number {
  if (t && typeof t === 'object') {
    const o = t as { _seconds?: number; seconds?: number; toMillis?: () => number }
    if (typeof o.toMillis === 'function') return Math.floor(o.toMillis() / 1000)
    if (typeof o._seconds === 'number') return o._seconds
    if (typeof o.seconds === 'number') return o.seconds
  }
  return 0
}

/** Un extracto que cabe en la cola sin cortar una palabra por la mitad. */
function extracto(cuerpo: string, tope = 140) {
  const limpio = cuerpo.replace(/\s+/g, ' ').trim()
  if (limpio.length <= tope) return limpio
  const corte = limpio.slice(0, tope)
  return `${corte.slice(0, corte.lastIndexOf(' ') > 0 ? corte.lastIndexOf(' ') : tope)}…`
}

type Autor = { nombre: string; dias: number }

/** Nombre y antiguedad de cada autor, en una tanda. `getUsers` acepta cien. */
async function autoresDe(uids: string[]): Promise<Map<string, Autor>> {
  const salida = new Map<string, Autor>()
  const unicos = [...new Set(uids.filter(Boolean))]
  for (let i = 0; i < unicos.length; i += 100) {
    try {
      const { users } = await getAuth().getUsers(unicos.slice(i, i + 100).map((uid) => ({ uid })))
      for (const u of users) {
        const creada = u.metadata.creationTime ? Date.parse(u.metadata.creationTime) : Date.now()
        salida.set(u.uid, {
          nombre: u.displayName || u.email || u.uid,
          dias: Math.max(0, Math.floor((Date.now() - creada) / 86_400_000)),
        })
      }
    } catch (err) {
      // Sin directorio seguimos: una cola sin nombres es peor, pero una cola que no
      // carga es inservible.
      console.error('[panel] no se pudieron leer los autores', err)
    }
  }
  for (const uid of unicos) if (!salida.has(uid)) salida.set(uid, { nombre: uid, dias: 0 })
  return salida
}

/**
 * Sanciones previas, contadas POR AUTOR.
 *
 * Esto ya fallo una vez: contando publicaciones retenidas sin filtrar por autor, con dos
 * en toda la comunidad TODO el mundo salia reincidente. El filtro no es un detalle, es
 * la diferencia entre una senyal y un ruido que empuja a retener de mas.
 */
async function sancionesPorAutor(uids: string[]): Promise<Map<string, number>> {
  const db = getFirestore()
  const salida = new Map<string, number>()
  const unicos = [...new Set(uids.filter(Boolean))]
  for (let i = 0; i < unicos.length; i += 30) {
    const tanda = unicos.slice(i, i + 30)
    if (tanda.length === 0) continue
    const snap = await db.collection('posts').where('author_id', 'in', tanda).limit(500).get()
    for (const d of snap.docs) {
      const p = d.data()
      if (p['estado'] !== 'retenido' && p['estado'] !== 'retirado') continue
      const autor = texto(p['author_id'])
      salida.set(autor, (salida.get(autor) ?? 0) + 1)
    }
  }
  for (const uid of unicos) if (!salida.has(uid)) salida.set(uid, 0)
  return salida
}

const TOPE_COLA = 50
const TOPE_FEED = 100

export function montaPanel(app: Express) {
  /** La cola, con lo retenido primero y el contexto del autor en la misma fila. */
  app.get(
    '/moderacion/cola',
    requireRole(['moderator', 'admin']),
    asyncHandler(async (_req: Request, res: Response) => {
      const db = getFirestore()
      const pendientes = await db
        .collection('moderation_queue')
        .where('estado', '==', 'pendiente')
        .limit(300)
        .get()

      const filas = await Promise.all(
        pendientes.docs.map(async (d) => {
          const m = d.data()
          const postId = texto(m['objeto_id'])
          const post = postId ? await db.collection('posts').doc(postId).get() : null
          const p = post?.data()
          const retenido = p?.['estado'] === 'retenido'
          return {
            id: d.id,
            publicacion_id: postId,
            accion: retenido ? ('retener' as const) : ('publicar_y_revisar' as const),
            categoria: (texto(m['categoria']) || 'ruido') as Categoria,
            confianza: numero(m['confianza']),
            motivo: texto(m['motivo_ia']),
            creado_en: p?.['creado_en'] ?? m['decidido_en'],
            autor_id: texto(p?.['author_id']),
            titulo: texto(p?.['titulo']) || '(deleted post)',
            extracto: extracto(texto(p?.['cuerpo'])),
          }
        }),
      )

      const autores = await autoresDe(filas.map((f) => f.autor_id))
      const sanciones = await sancionesPorAutor(filas.map((f) => f.autor_id))

      const cola = filas
        .map((f) => ({
          ...f,
          autor_nombre: autores.get(f.autor_id)?.nombre ?? f.autor_id,
          autor_dias: autores.get(f.autor_id)?.dias ?? 0,
          // La propia publicacion de la cola no cuenta como sancion previa suya.
          autor_sanciones: Math.max(0, (sanciones.get(f.autor_id) ?? 0) - (f.accion === 'retener' ? 1 : 0)),
        }))
        // Retenido primero: ahi hay alguien esperando. Dentro de cada grupo, lo mas
        // viejo antes. Se ordena en memoria sobre un conjunto ya acotado.
        .sort((a, b) => {
          const peso = (x: typeof a) => (x.accion === 'retener' ? 0 : 1)
          return peso(a) - peso(b) || segundos(a.creado_en) - segundos(b.creado_en)
        })

      res.status(200).json({
        cola: cola.slice(0, TOPE_COLA),
        // Se dice en voz alta en vez de esconderlo tras un "50+": una cola que crece mas
        // rapido de lo que se vacia significa un ataque o un umbral mal puesto.
        desbordadas: Math.max(0, cola.length - TOPE_COLA),
      })
    }),
  )

  /** Los espacios, con cuanta gente hay y cuanto se mueve cada uno. */
  app.get(
    '/espacios',
    requireRole(['moderator', 'admin']),
    asyncHandler(async (_req: Request, res: Response) => {
      const db = getFirestore()
      const haceUnaSemana = new Date(Date.now() - 7 * 86_400_000)
      const [espacios, miembros, recientes] = await Promise.all([
        db.collection('spaces').limit(100).get(),
        db.collection('memberships').limit(2000).get(),
        db.collection('posts').where('creado_en', '>=', haceUnaSemana).limit(1000).get(),
      ])

      const activos = miembros.docs.filter((d) => d.data()['estado'] === 'activa').length
      const porEspacio = new Map<string, number>()
      for (const d of recientes.docs) {
        const id = texto(d.data()['space_id'])
        porEspacio.set(id, (porEspacio.get(id) ?? 0) + 1)
      }

      res.status(200).json({
        espacios: espacios.docs
          .filter((d) => d.data()['activo'] !== false)
          .map((d) => ({
            id: d.id,
            nombre: texto(d.data()['nombre']) || d.id,
            descripcion: texto(d.data()['descripcion']),
            // Un espacio con nivel minimo lo ve menos gente, pero el recuento por nivel
            // necesita el padron de niveles: hasta entonces, el total de activos.
            miembros: activos,
            publicaciones_semana: porEspacio.get(d.id) ?? 0,
          })),
      })
    }),
  )

  /** El feed, tal y como lo ve un miembro. Lo marcado para revisar sale aqui tambien. */
  app.get(
    '/publicaciones/recientes',
    requireRole(['moderator', 'admin']),
    asyncHandler(async (_req: Request, res: Response) => {
      const db = getFirestore()
      const [posts, espacios] = await Promise.all([
        db.collection('posts').where('estado', '==', 'publicado').limit(TOPE_FEED).get(),
        db.collection('spaces').limit(100).get(),
      ])

      const nombreEspacio = new Map(
        espacios.docs.map((d) => [d.id, texto(d.data()['nombre']) || d.id]),
      )
      const autores = await autoresDe(posts.docs.map((d) => texto(d.data()['author_id'])))

      // Las respuestas de todos los posts de un tiron, en vez de una consulta por post.
      const ids = posts.docs.map((d) => d.id)
      const respuestas = new Map<string, number>()
      for (let i = 0; i < ids.length; i += 30) {
        const tanda = ids.slice(i, i + 30)
        if (tanda.length === 0) continue
        const snap = await db.collection('comments').where('post_id', 'in', tanda).limit(500).get()
        for (const d of snap.docs) {
          const id = texto(d.data()['post_id'])
          respuestas.set(id, (respuestas.get(id) ?? 0) + 1)
        }
      }

      res.status(200).json({
        publicaciones: posts.docs
          .map((d) => {
            const p = d.data()
            const autor = texto(p['author_id'])
            return {
              id: d.id,
              espacio_id: texto(p['space_id']),
              espacio_nombre: nombreEspacio.get(texto(p['space_id'])) ?? texto(p['space_id']),
              autor_nombre: autores.get(autor)?.nombre ?? autor,
              titulo: texto(p['titulo']),
              cuerpo: extracto(texto(p['cuerpo'])),
              creado_en: p['creado_en'],
              respuestas: respuestas.get(d.id) ?? 0,
              estado: 'publicado' as const,
            }
          })
          .sort((a, b) => segundos(b.creado_en) - segundos(a.creado_en)),
      })
    }),
  )

  /**
   * El resumen semanal antes de mandarlo.
   *
   * Lo que de verdad hay que poder ver aqui es a cuanta gente NO se le manda. Un digest
   * vacio es la forma mas rapida de que te marquen como spam, y se lleva por delante a
   * los que si tenian algo que leer.
   */
  app.get(
    '/resumenes/semana',
    requireRole(['moderator', 'admin']),
    asyncHandler(async (_req: Request, res: Response) => {
      const db = getFirestore()
      const haceUnaSemana = new Date(Date.now() - 7 * 86_400_000)
      const [miembros, posts, espacios] = await Promise.all([
        db.collection('memberships').limit(2000).get(),
        db.collection('posts').where('creado_en', '>=', haceUnaSemana).limit(500).get(),
        db.collection('spaces').limit(100).get(),
      ])

      const nombreEspacio = new Map(
        espacios.docs.map((d) => [d.id, texto(d.data()['nombre']) || d.id]),
      )
      const publicados = posts.docs.filter((d) => d.data()['estado'] === 'publicado')
      const activos = miembros.docs.filter((d) => d.data()['estado'] === 'activa')
      const nombres = await autoresDe(activos.map((d) => texto(d.data()['user_id'])))

      const contenido = publicados.slice(0, 5).map((d) => ({
        titulo: texto(d.data()['titulo']),
        espacio: nombreEspacio.get(texto(d.data()['space_id'])) ?? '',
        respuestas: 0,
      }))

      // Sin nada publicado esta semana no sale ningun resumen. No es un caso raro: en
      // una comunidad pequena es la semana normal.
      const resumenes =
        contenido.length === 0
          ? []
          : activos.slice(0, 25).map((d) => {
              const uid = texto(d.data()['user_id'])
              return {
                miembro: nombres.get(uid)?.nombre ?? uid,
                espacios: [...new Set(contenido.map((c) => c.espacio).filter(Boolean))],
                publicaciones: contenido,
              }
            })

      res.status(200).json({
        resumenes,
        miembros_totales: activos.length,
        sin_nada_que_leer: Math.max(0, activos.length - resumenes.length),
      })
    }),
  )
}

/** Se exporta para que la pantalla y el motor coincidan en que cuenta como grave. */
export const CATEGORIAS_GRAVES = GRAVES
