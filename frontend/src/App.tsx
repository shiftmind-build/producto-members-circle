import { useEffect, useState } from 'react'
import { api, ErrorApi } from './api'
import { AvisoDemo, Dato, Estado as Pastilla, Marco, Panel, Pestanas, Tabla, Tarjeta } from './piezas'
import type { Accion, Cola, EnCola, Espacio, Publicacion, Resumen } from './tipos'

/**
 * El panel de Members Circle.
 *
 * Aqui la duda se resuelve al reves que en un producto de documentos, y esa diferencia es
 * el producto: retener una publicacion legitima durante tres horas mata una conversacion
 * y no se recupera. Asi que solo lo grave con confianza razonable se retiene; lo dudoso
 * se publica Y se encola.
 *
 * Por eso la cola ensena en la misma lista dos cosas que parecen la misma y no lo son:
 * lo que esta esperando a una persona (nadie lo ve) y lo que ya esta publicado pero
 * alguien deberia mirar. Un moderador que no distingue esas dos trata las dos como
 * urgentes, y entonces ninguna lo es.
 */

const VISTAS = [
  ['cola', 'Moderation'],
  ['foro', 'Spaces'],
  ['resumen', 'Weekly digest'],
] as const

type Vista = (typeof VISTAS)[number][0]

function cuando(t?: { _seconds?: number }) {
  if (!t?._seconds) return '—'
  const minutos = Math.round((Date.now() / 1000 - t._seconds) / 60)
  if (minutos < 0) return new Date(t._seconds * 1000).toLocaleDateString()
  if (minutos < 60) return `${minutos}m ago`
  if (minutos < 60 * 48) return `${Math.round(minutos / 60)}h ago`
  return new Date(t._seconds * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const ACCIONES: Record<Accion, { texto: string; tipo: 'bien' | 'aviso' | 'mal' }> = {
  retener: { texto: 'held — nobody can see it', tipo: 'mal' },
  publicar_y_revisar: { texto: 'live — flagged for a look', tipo: 'aviso' },
  publicar: { texto: 'live', tipo: 'bien' },
}

function useCarga<T>(ruta: string | null, token: string) {
  const [dato, setDato] = useState<T>()
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(ruta !== null)

  useEffect(() => {
    if (!ruta) {
      setDato(undefined)
      setCargando(false)
      return
    }
    let vivo = true
    setCargando(true)
    setError(null)
    ;(async () => {
      try {
        const r = await api<T>(ruta, { token })
        if (vivo) setDato(r)
      } catch (e) {
        if (vivo) setError(e instanceof ErrorApi ? e.message : 'Could not reach the server.')
      } finally {
        if (vivo) setCargando(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [ruta, token])

  return { dato, error, cargando }
}

function Fallo({ texto }: { texto: string }) {
  return (
    <div className="error" style={{ marginTop: 'var(--hueco)' }}>
      <strong>{texto}</strong>
      <p style={{ margin: '8px 0 0' }}>
        <button className="boton secundario" onClick={() => location.reload()}>
          Try again
        </button>
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ pantallas */

function ColaVista({ token, abre }: { token: string; abre: (item: EnCola) => void }) {
  const { dato, error, cargando } = useCarga<Cola>('/moderacion/cola', token)
  const retenidas = (dato?.cola ?? []).filter((c) => c.accion === 'retener').length

  return (
    <>
      <h1>Moderation</h1>
      <p style={{ color: 'var(--tinta-suave)', maxWidth: '58ch' }}>
        Held first, because those are the ones with somebody waiting. Everything else on this
        list is already live — it is here so a person sees it today, not so the room waits.
      </p>

      {error && <Fallo texto={error} />}

      <div className="fila" style={{ alignItems: 'stretch', marginTop: 'var(--hueco-l)' }}>
        <Tarjeta titulo="Held, waiting on you">
          <p
            className="cifra"
            style={{
              fontSize: '2.6rem',
              fontFamily: 'var(--fuente-titular)',
              fontWeight: 'var(--peso-titular)',
              margin: '4px 0 0',
              color: retenidas > 0 ? 'var(--mal)' : 'var(--tinta)',
            }}
          >
            {cargando ? '—' : retenidas}
          </p>
          <p style={{ margin: 0, color: 'var(--tinta-suave)', fontSize: '0.85rem' }}>
            nobody in the community can see these
          </p>
        </Tarjeta>

        <Tarjeta titulo="Live, flagged for a look">
          <p
            className="cifra"
            style={{
              fontSize: '2.6rem',
              fontFamily: 'var(--fuente-titular)',
              fontWeight: 'var(--peso-titular)',
              margin: '4px 0 0',
              color: 'var(--aviso)',
            }}
          >
            {cargando ? '—' : (dato?.cola.length ?? 0) - retenidas}
          </p>
          <p style={{ margin: 0, color: 'var(--tinta-suave)', fontSize: '0.85rem' }}>
            published already — no conversation is on hold
          </p>
        </Tarjeta>

        <Tarjeta titulo="Which way doubt goes">
          <p style={{ margin: '4px 0 0', fontSize: '0.9rem', lineHeight: 1.6 }}>
            Only something <strong>serious</strong> and reasonably certain is held. Anything
            doubtful goes live and lands here. Holding a good post for three hours kills the
            thread, and you never get it back.
          </p>
        </Tarjeta>
      </div>

      {dato && dato.desbordadas > 0 && (
        <div className="error" style={{ marginTop: 'var(--hueco)' }}>
          <strong>{dato.desbordadas} more than the queue shows.</strong>
          <p style={{ margin: '6px 0 0' }}>
            A queue growing faster than it empties usually means a raid or a threshold set
            wrong — not a busy day.
          </p>
        </div>
      )}

      <h2 style={{ marginTop: 'var(--hueco-l)' }}>The queue</h2>
      <div style={{ marginTop: 'var(--hueco-s)' }}>
        <Tabla
          columnas={['Post', 'Author', 'Status', 'Why', 'When', '']}
          filas={dato?.cola}
          cargando={cargando}
          error={null}
          vacio="Nothing to look at. Everything posted today went straight through."
          fila={(c) => (
            <tr key={c.id}>
              <td style={{ maxWidth: '30ch' }}>{c.titulo}</td>
              <td>
                {c.autor_nombre}
                {/* Las sanciones son DE ESTE AUTOR. Contarlas sin filtrar por autor
                    convierte a todo el mundo en reincidente en cuanto hay dos posts. */}
                {c.autor_sanciones > 0 && (
                  <span style={{ color: 'var(--tinta-suave)' }}> · {c.autor_sanciones} prior</span>
                )}
                {c.autor_dias <= 3 && (
                  <span style={{ color: 'var(--aviso)' }}> · {c.autor_dias}d old account</span>
                )}
              </td>
              <td>
                <Pastilla tipo={ACCIONES[c.accion].tipo}>{ACCIONES[c.accion].texto}</Pastilla>
              </td>
              <td style={{ maxWidth: '24ch' }}>{c.motivo}</td>
              <td className="cifra">{cuando(c.creado_en)}</td>
              <td>
                <button className="boton secundario" onClick={() => abre(c)}>
                  Open
                </button>
              </td>
            </tr>
          )}
        />
      </div>
    </>
  )
}

function ForoVista({ token }: { token: string }) {
  const espacios = useCarga<{ espacios: Espacio[] }>('/espacios', token)
  const posts = useCarga<{ publicaciones: Publicacion[] }>('/publicaciones', token)

  return (
    <>
      <h1>Spaces</h1>
      <p style={{ color: 'var(--tinta-suave)', maxWidth: '58ch' }}>
        What a member sees. A post flagged for review is in here too — that is the point.
      </p>
      {espacios.error && <Fallo texto={espacios.error} />}

      <div className="fila" style={{ alignItems: 'stretch', marginTop: 'var(--hueco-l)' }}>
        {(espacios.dato?.espacios ?? []).map((e) => (
          <Tarjeta key={e.id} titulo={e.nombre}>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--tinta-suave)' }}>
              {e.descripcion}
            </p>
            <p style={{ margin: '8px 0 0', fontSize: '0.85rem' }} className="cifra">
              {e.miembros} members · {e.publicaciones_semana} posts this week
            </p>
          </Tarjeta>
        ))}
      </div>

      <h2 style={{ marginTop: 'var(--hueco-l)' }}>Latest</h2>
      <div style={{ marginTop: 'var(--hueco-s)' }}>
        <Tabla
          columnas={['Post', 'Space', 'Author', 'Replies', 'When']}
          filas={posts.dato?.publicaciones}
          cargando={posts.cargando}
          error={posts.error}
          vacio="Nothing posted yet. The first post is always the hardest."
          fila={(p) => (
            <tr key={p.id}>
              <td style={{ maxWidth: '34ch' }}>{p.titulo}</td>
              <td>{p.espacio_nombre}</td>
              <td>{p.autor_nombre}</td>
              <td className="cifra">{p.respuestas}</td>
              <td className="cifra">{cuando(p.creado_en)}</td>
            </tr>
          )}
        />
      </div>
    </>
  )
}

function ResumenVista({ token }: { token: string }) {
  const { dato, error, cargando } = useCarga<{
    resumenes: Resumen[]
    miembros_totales: number
    sin_nada_que_leer: number
  }>('/resumenes/semana', token)

  return (
    <>
      <h1>Weekly digest</h1>
      <p style={{ color: 'var(--tinta-suave)', maxWidth: '58ch' }}>
        One email per member, built from the spaces they are actually in. A member with
        nothing to read gets no email at all — an empty digest is the fastest way to be
        marked as spam, and it takes the real ones down with it.
      </p>

      {error && <Fallo texto={error} />}

      <div className="fila" style={{ alignItems: 'stretch', marginTop: 'var(--hueco-l)' }}>
        <Tarjeta titulo="Going out this week">
          <p
            className="cifra"
            style={{
              fontSize: '2.6rem',
              fontFamily: 'var(--fuente-titular)',
              fontWeight: 'var(--peso-titular)',
              margin: '4px 0 0',
            }}
          >
            {cargando ? '—' : (dato?.resumenes.length ?? 0)}
          </p>
          <p style={{ margin: 0, color: 'var(--tinta-suave)', fontSize: '0.85rem' }}>
            of {dato?.miembros_totales ?? 0} members
          </p>
        </Tarjeta>
        <Tarjeta titulo="Deliberately not emailed">
          <p
            className="cifra"
            style={{
              fontSize: '2.6rem',
              fontFamily: 'var(--fuente-titular)',
              fontWeight: 'var(--peso-titular)',
              margin: '4px 0 0',
              color: 'var(--tinta-suave)',
            }}
          >
            {cargando ? '—' : (dato?.sin_nada_que_leer ?? 0)}
          </p>
          <p style={{ margin: 0, color: 'var(--tinta-suave)', fontSize: '0.85rem' }}>
            nothing new in the spaces they follow
          </p>
        </Tarjeta>
      </div>

      <h2 style={{ marginTop: 'var(--hueco-l)' }}>Preview</h2>
      {cargando && <div className="cargando">Loading…</div>}
      <div className="columna" style={{ marginTop: 'var(--hueco-s)' }}>
        {(dato?.resumenes ?? []).map((r) => (
          <div key={r.miembro} className="tarjeta">
            <p className="etiqueta">To {r.miembro}</p>
            <p style={{ margin: '4px 0 10px', fontSize: '0.85rem', color: 'var(--tinta-suave)' }}>
              Follows: {r.espacios.join(', ')}
            </p>
            <ol className="escalera">
              {r.publicaciones.map((p) => (
                <li key={p.titulo}>
                  <time>{p.espacio}</time>
                  <span>
                    {p.titulo}{' '}
                    <span style={{ color: 'var(--tinta-suave)' }}>· {p.respuestas} replies</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ detalle */

function DetalleCola({ item, cierra }: { item: EnCola; cierra: () => void }) {
  const [hecho, setHecho] = useState<'aprobada' | 'retirada' | null>(null)
  const retenida = item.accion === 'retener'

  return (
    <Panel titulo="Review" onCerrar={cierra}>
      <Dato etiqueta="Post">{item.titulo}</Dato>
      <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--tinta-suave)' }}>{item.extracto}</p>

      <div className="fila">
        <Dato etiqueta="Author">{item.autor_nombre}</Dato>
        <Dato etiqueta="Account age">{item.autor_dias} days</Dato>
        <Dato etiqueta="Prior sanctions">{item.autor_sanciones}</Dato>
      </div>

      <div className="fila">
        <Dato etiqueta="Flagged as">{item.categoria.replace(/_/g, ' ')}</Dato>
        <Dato etiqueta="Confidence">{Math.round(item.confianza * 100)}%</Dato>
      </div>

      <Dato etiqueta="Right now">
        <Pastilla tipo={ACCIONES[item.accion].tipo}>{ACCIONES[item.accion].texto}</Pastilla>
      </Dato>

      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--tinta-suave)' }}>
        {retenida
          ? 'Held because the category is serious and the model is reasonably sure. The author has been told it is being looked at.'
          : 'Published because the model was not sure enough to hold it. Nobody is waiting on you — this is a second pair of eyes, not a gate.'}
      </p>

      {hecho ? (
        <div className="aviso-demo" style={{ margin: 0 }}>
          <strong>{hecho === 'aprobada' ? 'Kept up.' : 'Taken down.'}</strong> The author is told
          either way, with the reason. Silent removals are what make people leave.
        </div>
      ) : (
        <div className="fila">
          <button className="boton" onClick={() => setHecho('aprobada')}>
            {retenida ? 'Publish it' : 'Leave it up'}
          </button>
          <button className="boton peligro" onClick={() => setHecho('retirada')}>
            Take it down
          </button>
        </div>
      )}
    </Panel>
  )
}

/* ------------------------------------------------------------------ app */

export default function App() {
  const [vista, setVista] = useState<Vista>('cola')
  const [abierto, setAbierto] = useState<EnCola | null>(null)

  const token = new URLSearchParams(location.search).get('t') ?? ''

  return (
    <Marco
      nombre="Members Circle"
      nav={<Pestanas vistas={VISTAS} activa={vista} onCambio={setVista} />}
    >
      <AvisoDemo>
        An invented community of 512. Two posts are held, two are live but flagged — open them
        to see why doubt goes one way and not the other.
      </AvisoDemo>

      <div className="con-detalle">
        <div>
          {vista === 'cola' && <ColaVista token={token} abre={setAbierto} />}
          {vista === 'foro' && <ForoVista token={token} />}
          {vista === 'resumen' && <ResumenVista token={token} />}
        </div>
        {abierto && <DetalleCola item={abierto} cierra={() => setAbierto(null)} />}
      </div>
    </Marco>
  )
}
