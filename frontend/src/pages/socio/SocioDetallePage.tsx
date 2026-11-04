import { useRef, useState } from 'react';
import { urlArchivo } from '../../api/cliente';
import { archivosApi } from '../../api/crm';
import { IconoCamara } from '../../components/iconos';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { sociosApi } from '../../api/servicios';
import { useAuth } from '../../auth/contexto';
import { Alerta, Avatar, Cargando, EstadoMembresiaBadge, EstadoSocioBadge } from '../../components/ui';
import { formatoFecha } from '../../utils/formato';
import { mensajesError, useCarga } from '../../utils/useCarga';
import { DatosSocio } from './DatosSocio';
import { FichaSaludTab } from './FichaSaludTab';
import { MembresiasTab } from './MembresiasTab';
import { RutinaTab } from './RutinaTab';
import { SeguimientoTab } from './SeguimientoTab';

type Pestana = 'datos' | 'membresias' | 'seguimiento' | 'salud' | 'rutina';

export function SocioDetallePage() {
  const { id } = useParams();
  const idSocio = Number(id);
  const { puede } = useAuth();
  const [params, setParams] = useSearchParams();
  const pestanaUrl = params.get('pestana') as Pestana | null;
  const [pestana, setPestana] = useState<Pestana>(
    pestanaUrl ?? (params.get('accion') === 'membresia' ? 'membresias' : 'datos'),
  );
  const { datos: socio, error, cargando, recargar } = useCarga(() => sociosApi.obtener(idSocio), `socio-${idSocio}`);
  const archivo = useRef<HTMLInputElement>(null);
  const [errorFoto, setErrorFoto] = useState<string[]>([]);
  const [subiendo, setSubiendo] = useState(false);

  async function subirFoto(f: File | undefined) {
    if (!f) return;
    setErrorFoto([]);
    if (f.size > 5 * 1024 * 1024) return setErrorFoto(['La foto no debe pasar de 5 MB.']);
    setSubiendo(true);
    try {
      await archivosApi.fotoSocio(idSocio, f);
      recargar();
    } catch (e) {
      setErrorFoto(mensajesError(e));
    } finally {
      setSubiendo(false);
      if (archivo.current) archivo.current.value = '';
    }
  }

  const cambiar = (p: Pestana) => {
    setPestana(p);
    const nuevos = new URLSearchParams(params);
    nuevos.set('pestana', p);
    nuevos.delete('accion');
    setParams(nuevos, { replace: true });
  };

  if (!Number.isInteger(idSocio)) return <Alerta mensajes={['Socio no válido.']} />;
  if (cargando && !socio) return <Cargando />;
  if (error && !socio) {
    return (
      <div className="espaciado">
        <Alerta mensajes={error.detalles} />
        <Link to="/socios">Volver a socios</Link>
      </div>
    );
  }
  if (!socio) return null;

  const m = socio.membresia;
  const verSalud = puede('entrenador', 'recepcionista');
  const verRutina = puede('entrenador');

  return (
    <>
      <div className="pequeno" style={{ marginBottom: 12 }}>
        <Link to="/socios">← Socios</Link>
      </div>

      <div className="tarjeta tarjeta-cuerpo" style={{ marginBottom: 20 }}>
        <div className="resumen-mem" style={{ justifyContent: 'space-between' }}>
          <div className="persona">
            <div className="foto-editable">
              <Avatar nombre={socio.nombre} foto={urlArchivo(socio.foto_url)} grande />
              {puede('recepcionista') && (
                <>
                  <button onClick={() => archivo.current?.click()} disabled={subiendo} aria-label="Cambiar foto" title="Cambiar foto">
                    <IconoCamara />
                  </button>
                  <input
                    ref={archivo}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="user"
                    hidden
                    onChange={(e) => void subirFoto(e.target.files?.[0])}
                  />
                </>
              )}
            </div>
            <div>
              <h1>{socio.nombre}</h1>
              <div className="fila muted pequeno" style={{ marginTop: 4 }}>
                <span className="mono">{socio.folio}</span>
                <span>·</span>
                <span>{socio.edad} años</span>
                <span>·</span>
                <EstadoSocioBadge estado={socio.estado} />
              </div>
            </div>
          </div>
          <div className="resumen-mem">
            <div>
              <div className="muted pequeno">Membresía</div>
              <div className="fila" style={{ marginTop: 4 }}>
                <EstadoMembresiaBadge estado={m?.estado} />
                {m && <strong>{m.plan.nombre}</strong>}
              </div>
              {m && <div className="muted pequeno">Vigente hasta {formatoFecha(m.vigente_hasta)}</div>}
            </div>
            {m && m.estado !== 'vencida' && (
              <div style={{ textAlign: 'center' }}>
                <div className="dias-grande">{m.dias_restantes}</div>
                <div className="muted pequeno">días restantes</div>
              </div>
            )}
          </div>
        </div>
        {errorFoto.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <Alerta mensajes={errorFoto} />
          </div>
        )}
        {socio.estado === 'baja' && (
          <div style={{ marginTop: 16 }}>
            <Alerta tipo="aviso">
              Dado de baja el {formatoFecha(socio.fecha_baja)}
              {socio.motivo_baja ? `: ${socio.motivo_baja}` : ''}.
            </Alerta>
          </div>
        )}
      </div>

      <div className="pestanas" role="tablist">
        <button className="pestana" role="tab" aria-selected={pestana === 'datos'} onClick={() => cambiar('datos')}>
          Datos
        </button>
        <button className="pestana" role="tab" aria-selected={pestana === 'membresias'} onClick={() => cambiar('membresias')}>
          Membresías y pagos
        </button>
        <button className="pestana" role="tab" aria-selected={pestana === 'seguimiento'} onClick={() => cambiar('seguimiento')}>
          Seguimiento
        </button>
        {verSalud && (
          <button className="pestana" role="tab" aria-selected={pestana === 'salud'} onClick={() => cambiar('salud')}>
            Ficha de salud
          </button>
        )}
        {verRutina && (
          <button className="pestana" role="tab" aria-selected={pestana === 'rutina'} onClick={() => cambiar('rutina')}>
            Rutina
          </button>
        )}
      </div>

      {pestana === 'datos' && <DatosSocio socio={socio} alActualizar={recargar} />}
      {pestana === 'membresias' && (
        <MembresiasTab
          socio={socio}
          abrirAsignar={params.get('accion') === 'membresia'}
          alCambiar={recargar}
        />
      )}
      {pestana === 'seguimiento' && <SeguimientoTab socio={socio} />}
      {pestana === 'salud' && verSalud && <FichaSaludTab idSocio={idSocio} />}
      {pestana === 'rutina' && verRutina && <RutinaTab socio={socio} />}
    </>
  );
}
