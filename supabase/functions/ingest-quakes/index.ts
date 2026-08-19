import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Ingesta de sismos desde IGP (Perú) y USGS (global) — spec §6.
 *
 * La dispara pg_cron vía pg_net cada 2 minutos. Se consultan ambas fuentes y se
 * escribe en `quake_events`; cada fuente se maneja por separado, así que si el
 * IGP se cae, el USGS igual entra (y viceversa).
 *
 * ⚠️ La capa ArcGIS del IGP NO es una API pública documentada para terceros.
 * Contiene filas de utilería con `magnitud` cargada (7.0, 8.0) pero sin
 * coordenadas ni fecha. Ingerir una de esas dispararía una alerta falsa de
 * magnitud 8 a todos los usuarios, así que cada fila se valida entera antes de
 * aceptarla: sin `code`, sin coordenadas válidas o sin fecha creíble, se
 * descarta.
 */

const IGP_URL =
  'https://ide.igp.gob.pe/arcgis/rest/services/monitoreocensis/SismosReportados/MapServer/0/query';

/**
 * DOS feeds del USGS, no uno. Cubren necesidades distintas:
 *
 * - `2.5_day`  → últimas 24 h desde M2.5. Alimenta las ALERTAS. El umbral
 *   mínimo que el usuario puede configurar es 4.0, y el feed semanal arranca en
 *   4.5, así que sin este se perderían los sismos M4.0–4.4 cerca suyo.
 * - `4.5_week` → últimos 7 días desde M4.5. Alimenta la pestaña GLOBAL de
 *   Noticias Sísmicas, que necesita 7 días de historia. Sin él la lista se
 *   llenaría de a un día por vez y quedaría casi vacía la primera semana.
 *
 * Se solapan y está bien: se deduplica por id antes de escribir.
 */
const USGS_FEEDS = [
  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson',
  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson',
];

const FETCH_TIMEOUT_MS = 12_000;
const MIN_SECONDS_BETWEEN_RUNS = 45;
const MAX_EVENT_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type QuakeRow = {
  source: 'igp' | 'usgs';
  source_event_id: string;
  magnitude: number;
  depth_km: number | null;
  latitude: number;
  longitude: number;
  place: string | null;
  region: string | null;
  country_code: string | null;
  intensity_mmi: string | null;
  occurred_at: string;
  raw: unknown;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'TodosBien/1.0 (safety app)' },
    });
  } finally {
    clearTimeout(timer);
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function plausibleEpochMs(value: unknown): value is number {
  if (!isFiniteNumber(value)) return false;
  const floor = Date.UTC(2000, 0, 1);
  const ceiling = Date.now() + 24 * 60 * 60 * 1000;
  return value > floor && value < ceiling;
}

function validCoords(lat: unknown, lon: unknown): boolean {
  if (!isFiniteNumber(lat) || !isFiniteNumber(lon)) return false;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;
  return !(lat === 0 && lon === 0);
}

function validMagnitude(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0 && value <= 10;
}

function parseMercalli(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const match = /^\s*([IVX]+(?:\s*-\s*[IVX]+)?)/.exec(raw.trim());
  if (!match) return null;
  return match[1].replace(/\s*-\s*/, '-');
}

async function fetchIgp(): Promise<QuakeRow[]> {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: 'code,fechaevento,lat,lon,prof,magnitud,int_,ref,departamento',
    returnGeometry: 'false',
    orderByFields: 'fechaevento DESC',
    resultRecordCount: '100',
    f: 'json',
  });

  const response = await fetchWithTimeout(`${IGP_URL}?${params}`);
  if (!response.ok) throw new Error(`IGP HTTP ${response.status}`);

  const payload = await response.json();
  if (payload?.error) throw new Error(`IGP error: ${JSON.stringify(payload.error).slice(0, 200)}`);

  const features = Array.isArray(payload?.features) ? payload.features : [];
  const cutoff = Date.now() - MAX_EVENT_AGE_MS;
  const rows: QuakeRow[] = [];

  for (const feature of features) {
    const a = feature?.attributes;
    if (!a) continue;

    const code = typeof a.code === 'string' ? a.code.trim() : '';

    if (!code) continue;
    if (!plausibleEpochMs(a.fechaevento)) continue;
    if (!validCoords(a.lat, a.lon)) continue;
    if (!validMagnitude(a.magnitud)) continue;
    if (a.fechaevento < cutoff) continue;

    rows.push({
      source: 'igp',
      source_event_id: code,
      magnitude: Math.round(a.magnitud * 10) / 10,
      depth_km: isFiniteNumber(a.prof) ? a.prof : null,
      latitude: a.lat,
      longitude: a.lon,
      place: typeof a.ref === 'string' && a.ref.trim() ? a.ref.trim() : null,
      region:
        typeof a.departamento === 'string' && a.departamento.trim()
          ? a.departamento.trim()
          : null,
      country_code: 'PE',
      intensity_mmi: parseMercalli(a.int_),
      occurred_at: new Date(a.fechaevento).toISOString(),
      raw: a,
    });
  }

  return rows;
}

function parseUsgsFeature(feature: unknown, cutoff: number): QuakeRow | null {
  const f = feature as {
    id?: unknown;
    properties?: Record<string, unknown>;
    geometry?: { coordinates?: unknown };
  };

  const id = typeof f?.id === 'string' ? f.id.trim() : '';
  const p = f?.properties;
  const coords = f?.geometry?.coordinates;

  if (!id || !p || !Array.isArray(coords)) return null;
  // El feed incluye voladuras de cantera y explosiones; solo queremos sismos.
  if (p.type !== 'earthquake') return null;
  if (!validMagnitude(p.mag)) return null;
  if (!plausibleEpochMs(p.time) || (p.time as number) < cutoff) return null;

  const [lon, lat, depth] = coords as number[];
  if (!validCoords(lat, lon)) return null;

  const place = typeof p.place === 'string' && p.place.trim() ? p.place.trim() : null;

  return {
    source: 'usgs',
    source_event_id: id,
    magnitude: Math.round((p.mag as number) * 10) / 10,
    depth_km: isFiniteNumber(depth) ? Math.round(depth * 100) / 100 : null,
    latitude: lat,
    longitude: lon,
    place,
    region: null,
    // El USGS no da código de país; se infiere para el filtro nacional.
    country_code: place && /peru|perú/i.test(place) ? 'PE' : null,
    intensity_mmi: isFiniteNumber(p.mmi)
      ? String(Math.round(p.mmi as number))
      : isFiniteNumber(p.cdi)
        ? String(Math.round(p.cdi as number))
        : null,
    occurred_at: new Date(p.time as number).toISOString(),
    raw: { ...p, coordinates: coords },
  };
}

async function fetchUsgs(): Promise<QuakeRow[]> {
  const cutoff = Date.now() - MAX_EVENT_AGE_MS;
  const byId = new Map<string, QuakeRow>();
  const errors: string[] = [];

  for (const url of USGS_FEEDS) {
    try {
      const response = await fetchWithTimeout(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const payload = await response.json();
      const features = Array.isArray(payload?.features) ? payload.features : [];

      for (const feature of features) {
        const row = parseUsgsFeature(feature, cutoff);
        // El primer feed que trae un evento gana; ambos dan los mismos datos.
        if (row && !byId.has(row.source_event_id)) byId.set(row.source_event_id, row);
      }
    } catch (caught) {
      errors.push(`${url.split('/').pop()}: ${caught instanceof Error ? caught.message : caught}`);
    }
  }

  // Que se caiga un feed no debe tirar la fuente entera: solo fallamos si se
  // cayeron los dos.
  if (errors.length === USGS_FEEDS.length) {
    throw new Error(`USGS: ${errors.join(' | ')}`);
  }

  return [...byId.values()];
}

/**
 * Filtra a lo que realmente hay que escribir.
 *
 * El feed semanal devuelve ~143 eventos en cada corrida y el cron corre cada 2
 * minutos. Hacer upsert de todo cada vez generaría cientos de miles de tuplas
 * muertas por día para no cambiar nada. Solo se escribe lo nuevo o lo que
 * cambió de magnitud (el USGS revisa magnitudes de eventos ya publicados).
 */
async function onlyChanged(
  // deno-lint-ignore no-explicit-any
  admin: any,
  source: string,
  rows: QuakeRow[],
): Promise<QuakeRow[]> {
  if (rows.length === 0) return rows;

  const { data, error } = await admin
    .from('quake_events')
    .select('source_event_id, magnitude')
    .eq('source', source)
    .in('source_event_id', rows.map((r) => r.source_event_id));

  if (error) throw new Error(error.message);

  const known = new Map<string, number>(
    (data ?? []).map((r: { source_event_id: string; magnitude: number | string }) => [
      r.source_event_id,
      Number(r.magnitude),
    ]),
  );

  return rows.filter((r) => {
    const previous = known.get(r.source_event_id);
    return previous === undefined || previous !== r.magnitude;
  });
}

Deno.serve(async (req: Request) => {
  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey);

  const provided = req.headers.get('x-ingest-secret');
  const { data: expected, error: secretError } = await admin.rpc('get_ingest_secret');

  if (secretError) return json({ error: 'secret_unavailable', detail: secretError.message }, 500);
  if (!provided || !expected || provided !== expected) {
    return json({ error: 'unauthorized' }, 401);
  }

  const { data: lastRun } = await admin
    .from('ingest_runs')
    .select('ran_at')
    .eq('ok', true)
    .order('ran_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastRun?.ran_at) {
    const elapsed = (Date.now() - Date.parse(lastRun.ran_at)) / 1000;
    if (elapsed < MIN_SECONDS_BETWEEN_RUNS) {
      return json({ skipped: 'throttled', seconds_since_last_run: Math.round(elapsed) });
    }
  }

  const sources: { name: 'igp' | 'usgs'; load: () => Promise<QuakeRow[]> }[] = [
    { name: 'igp', load: fetchIgp },
    { name: 'usgs', load: fetchUsgs },
  ];

  const results = await Promise.all(
    sources.map(async (source) => {
      try {
        const rows = await source.load();
        const changed = await onlyChanged(admin, source.name, rows);

        if (changed.length > 0) {
          const { error } = await admin
            .from('quake_events')
            .upsert(changed, { onConflict: 'source,source_event_id' });
          if (error) throw new Error(error.message);
        }

        await admin
          .from('ingest_runs')
          .insert({ source: source.name, ok: true, events_found: rows.length });

        return { source: source.name, ok: true, seen: rows.length, written: changed.length };
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught);

        await admin.from('ingest_runs').insert({
          source: source.name,
          ok: false,
          events_found: 0,
          error: message.slice(0, 500),
        });

        return { source: source.name, ok: false, error: message };
      }
    }),
  );

  const anyOk = results.some((r) => r.ok);
  return json({ results }, anyOk ? 200 : 502);
});
