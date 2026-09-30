import type { Express, Request, Response } from 'express'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { asyncHandler } from './lib/asyncHandler.js'
import { requireRole, verificarAuth } from './lib/auth.js'
import { decide, ordenaCola, desborde, type Autor, type EnCola, type Veredicto } from './motor/moderacion.js'
import { resumenesDeLaSemana, type Miembro, type Publicacion } from './motor/resumen.js'

/**
 * Las rutas de Members Circle.
 *
 * El nivel de la membresia decide que spaces ve alguien, y eso se comprueba en el
 * servidor en cada peticion. Un space por encima del nivel de quien pregunta no aparece
 * ni siquiera en la lista: enseñar un candado le dice a la gente que hay algo que no
 * puede ver, y en una comunidad eso genera mas quejas que valor.
 */

function secretoValido(req: Request) {
  const esperado = process.env['CRON_SECRET']
  if (!esperado) return false
  return req.header('x-cron-secret') === esperado
}

async function perfilAutor(uid: string): Promise<Autor> {
  const db = getFirestore()
  const m = await db.collection('memberships').where('user_id', '==', uid).limit(1).get()
  const alta = m.empty ? null : (m.docs[0]!.data()['alta_en'] as { toDate?: () => Date } | undefined)
  const desde = alta?.toDate ? alta.toDate() : new Date()
  const inicioDia = new Date()
  inicioDia.setHours(0, 0, 0, 0)
  const hoy = await db
    .collection('posts')
    .where('author_id', '==', uid)
    .where('creado_en', '>=', Timestamp.fromDate(inicioDia))
    .get()
  // Por autor, no por comunidad.
  //
  // La primera version contaba las publicaciones ocultadas de TODA la comunidad, sin
  // filtrar por quien las escribio: con dos ocultadas, cualquiera quedaba marcado como
  // reincidente y todo pasaba por la cola. El contador decia "2" y no significaba nada.
  const sanciones = await db
    .collection('moderation_queue')
    .where('autor_id', '==', uid)
    .where('estado', '==', 'oculto')
    .limit(20)
    .get()
  return {
    antiguedadDias: Math.floor((Date.now() - desde.getTime()) / (24 * 60 * 60 * 1000)),
    sanciones: sanciones.size,
    hoy: hoy.size,
  }
}

export function montaRutas(app: Express) {
  /** Publicar. El triaje decide si sale ya o espera, y el autor se entera al momento. */
  app.post(
    '/publicaciones',
    asyncHandler(async (req: Request, res: Response) => {
      const quien = await verificarAuth(req)
      const cuerpo = req.body as { space_id?: string; titulo?: string; cuerpo?: string; veredicto?: Veredicto }
      if (!cuerpo?.space_id || !cuerpo.titulo || !cuerpo.cuerpo) {
        res.status(400).json({ error: 'faltan space_id, titulo o cuerpo' })
        return
      }

      const db = getFirestore()
      const space = await db.collection('spaces').doc(cuerpo.space_id).get()
      if (!space.exists || space.data()!['activo'] !== true) {
        res.status(404).json({ error: 'ese space no existe' })
        return
      }

      // Sin veredicto del clasificador se trata como dudoso, no como limpio. Si el
      // servicio de moderacion esta caido, la comunidad sigue funcionando y un humano
      // repasa; lo que no puede pasar es que una caida abra la puerta.
      const veredicto: Veredicto = cuerpo.veredicto ?? { categoria: 'tono', confianza: 0 }
      const r = decide(veredicto, await perfilAutor(quien.uid))

      const post = await db.collection('posts').add({
        author_id: quien.uid,
        space_id: cuerpo.space_id,
        titulo: cuerpo.titulo,
        cuerpo: cuerpo.cuerpo,
        estado: r.accion === 'retener' ? 'retenido' : 'publicado',
        fijado: false,
        creado_en: Timestamp.now(),
      })

      if (r.encolar) {
        await db.collection('moderation_queue').add({
          objeto_tipo: 'post',
          objeto_id: post.id,
          autor_id: quien.uid,
          motivo_ia: r.motivo,
          confianza: veredicto.confianza,
          estado: 'pendiente',
          decidido_por: null,
          decidido_en: null,
        })
      }

      res.status(201).json({ id: post.id, accion: r.accion, motivo: r.motivo })
    }),
  )

  /** La cola del moderador, ordenada: lo retenido primero, que es lo que tiene a alguien esperando. */
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

      const items: EnCola[] = await Promise.all(
        pendientes.docs.map(async (d) => {
          const post = await db.collection('posts').doc(String(d.data()['objeto_id'])).get()
          const retenido = post.exists && post.data()!['estado'] === 'retenido'
          return {
            id: d.id,
            accion: retenido ? 'retener' : 'publicar_y_revisar',
            creado_en: (post.data()?.['creado_en'] as { toMillis?: () => number })?.toMillis?.() ?? 0,
            motivo: String(d.data()['motivo_ia'] ?? ''),
          }
        }),
      )

      res.status(200).json({
        cola: ordenaCola(items),
        // Se dice en voz alta en vez de esconderlo tras un "50+": una cola que crece mas
        // rapido de lo que se vacia significa que hay un ataque o un umbral mal puesto.
        desbordadas: desborde(items),
      })
    }),
  )

  /** El proceso semanal. Solo salen los que tienen algo que leer. */
  app.post(
    '/tareas/resumen',
    asyncHandler(async (req: Request, res: Response) => {
      if (!secretoValido(req)) {
        res.status(401).json({ error: 'no autorizado' })
        return
      }
      const db = getFirestore()
      const hace7 = Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000)

      const [posts, membresias, spaces] = await Promise.all([
        db.collection('posts').where('creado_en', '>=', hace7).limit(500).get(),
        db.collection('memberships').limit(1000).get(),
        db.collection('spaces').get(),
      ])

      const porNivel = new Map<number, string[]>()
      spaces.docs.forEach((s) => {
        const min = Number(s.data()['nivel_minimo'] ?? 0)
        for (let n = min; n <= 10; n += 1) porNivel.set(n, [...(porNivel.get(n) ?? []), s.id])
      })

      const publicaciones: Publicacion[] = posts.docs.map((d) => ({
        id: d.id,
        space_id: String(d.data()['space_id']),
        titulo: String(d.data()['titulo']),
        autor: String(d.data()['author_id']),
        creado_en: (d.data()['creado_en'] as { toMillis: () => number }).toMillis(),
        comentarios: Number(d.data()['comentarios'] ?? 0),
        estado: d.data()['estado'] as Publicacion['estado'],
      }))

      const miembros: Miembro[] = membresias.docs.map((d) => ({
        id: String(d.data()['user_id']),
        spaces: porNivel.get(Number(d.data()['nivel'] ?? 0)) ?? [],
        ultimaVisita:
          (d.data()['ultima_visita'] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0,
        estadoMembresia: d.data()['estado'] as Miembro['estadoMembresia'],
      }))

      const resumenes = resumenesDeLaSemana(miembros, publicaciones)
      await db.collection('digests').add({
        periodo_inicio: hace7,
        periodo_fin: Timestamp.now(),
        enviado_en: Timestamp.now(),
        destinatarios: resumenes.length,
        contenido_json: JSON.stringify(resumenes).slice(0, 500_000),
      })

      console.log(`[resumen] ${resumenes.length} de ${miembros.length} miembros`)
      res.status(200).json({ destinatarios: resumenes.length, de: miembros.length })
    }),
  )
}
