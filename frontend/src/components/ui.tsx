import { useEffect, useId, useRef, type ReactNode } from 'react';
import { urlArchivo } from '../api/cliente';
import type { EstadoMembresia } from '../api/tipos';
import { ESTADOS_MEMBRESIA, iniciales } from '../utils/formato';

export function EstadoMembresiaBadge({ estado }: { estado: EstadoMembresia | null | undefined }) {
  if (!estado) return <span className="badge badge-neutro">Sin membresía</span>;
  const e = ESTADOS_MEMBRESIA[estado];
  return <span className={`badge ${e.clase}`}>{e.texto}</span>;
}

export function EstadoSocioBadge({ estado }: { estado: 'activo' | 'baja' }) {
  return estado === 'activo' ? (
    <span className="badge badge-ok">Activo</span>
  ) : (
    <span className="badge badge-neutro">Baja</span>
  );
}

export function Avatar({ nombre, foto, grande }: { nombre: string; foto?: string | null; grande?: boolean }) {
  return (
    <div className={`avatar${grande ? ' avatar-lg' : ''}`} aria-hidden="true">
      {foto ? <img src={urlArchivo(foto) ?? undefined} alt="" /> : iniciales(nombre)}
    </div>
  );
}

export function Alerta({
  tipo = 'error',
  mensajes,
  children,
}: {
  tipo?: 'error' | 'ok' | 'info' | 'aviso';
  mensajes?: string[];
  children?: ReactNode;
}) {
  if (!children && !mensajes?.length) return null;
  return (
    <div className={`alerta alerta-${tipo}`} role={tipo === 'error' ? 'alert' : 'status'}>
      {children}
      {mensajes && mensajes.length === 1 && <span>{mensajes[0]}</span>}
      {mensajes && mensajes.length > 1 && (
        <ul>
          {mensajes.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Campo de formulario con etiqueta, ayuda y error accesibles. */
export function Campo({
  etiqueta,
  ayuda,
  error,
  children,
  className,
}: {
  etiqueta: string;
  ayuda?: string;
  error?: string;
  className?: string;
  children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }) => ReactNode;
}) {
  const id = useId();
  const idAyuda = `${id}-ayuda`;
  return (
    <div className={`campo ${className ?? ''}`}>
      <label htmlFor={id}>{etiqueta}</label>
      {children({ id, 'aria-invalid': !!error, 'aria-describedby': ayuda || error ? idAyuda : undefined })}
      {error ? (
        <span id={idAyuda} className="error-campo">
          {error}
        </span>
      ) : (
        ayuda && (
          <span id={idAyuda} className="ayuda">
            {ayuda}
          </span>
        )
      )}
    </div>
  );
}

export function Modal({
  titulo,
  alCerrar,
  children,
  pie,
  ancho,
}: {
  titulo: string;
  alCerrar: () => void;
  children: ReactNode;
  pie?: ReactNode;
  ancho?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const idTitulo = useId();

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not(.cerrar)')?.focus();
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && alCerrar();
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('keydown', tecla);
      anterior?.focus();
    };
  }, [alCerrar]);

  return (
    <div className="modal-fondo" onMouseDown={(e) => e.target === e.currentTarget && alCerrar()}>
      <div
        ref={ref}
        className={`modal${ancho ? ' modal-ancho' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
      >
        <div className="modal-cabecera">
          <h2 id={idTitulo}>{titulo}</h2>
          <button className="cerrar" onClick={alCerrar} aria-label="Cerrar">
            ×
          </button>
        </div>
        <div className="modal-cuerpo">{children}</div>
        {pie && <div className="modal-pie">{pie}</div>}
      </div>
    </div>
  );
}

export function Paginacion({
  pagina,
  porPagina,
  total,
  alCambiar,
}: {
  pagina: number;
  porPagina: number;
  total: number;
  alCambiar: (p: number) => void;
}) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  if (total === 0) return null;
  const desde = (pagina - 1) * porPagina + 1;
  const hasta = Math.min(pagina * porPagina, total);
  return (
    <div className="fila justify-between py-3 px-4">
      <span className="muted pequeno">
        {desde}–{hasta} de {total}
      </span>
      <div className="fila">
        <button className="btn btn-sm" disabled={pagina <= 1} onClick={() => alCambiar(pagina - 1)}>
          Anterior
        </button>
        <span className="pequeno muted">
          Página {pagina} de {paginas}
        </span>
        <button className="btn btn-sm" disabled={pagina >= paginas} onClick={() => alCambiar(pagina + 1)}>
          Siguiente
        </button>
      </div>
    </div>
  );
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="cargando" role="status">
      {texto}
    </div>
  );
}
