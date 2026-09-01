/**
 * De dónde es un sismo del USGS, en español.
 *
 * **Por qué esto vive en el cliente y no en la base.** `quake_events.region` y
 * `country_code` existen, pero para el USGS la ingesta los deja en NULL: lo
 * único que llega del feed es el campo `place`, una cadena en inglés con el
 * formato `"63 km NNE of Ruteng, Indonesia"`. Sacar país y continente de ahí es
 * interpretación de un texto, no un dato, así que se hace donde se muestra.
 *
 * **El mapa se construyó midiendo, no de memoria.** Se agruparon los `place` ya
 * ingeridos por lo que va después de la última coma, y eso destapó tres formas
 * que no son obvias:
 *
 * 1. Para Estados Unidos el USGS **no dice el país**: pone el estado
 *    (`"..., Alaska"`) y a veces la sigla (`"..., CA"`).
 * 2. Muchos eventos terminan en `" region"` (`"Japan region"`) o arrancan con
 *    una dirección (`"south of the Fiji Islands"`).
 * 3. Buena parte no tiene país porque ocurren en el mar (`"Banda Sea"`,
 *    `"Pacific-Antarctic Ridge"`). Esos **no se inventan**: se muestran con su
 *    nombre traducido y sin continente.
 */

export type Continent =
  | 'América del Norte'
  | 'América Central'
  | 'El Caribe'
  | 'América del Sur'
  | 'Europa'
  | 'Asia'
  | 'África'
  | 'Oceanía'
  | 'Antártida';

type Territory = { country: string; continent: Continent };

const US: Territory = { country: 'Estados Unidos', continent: 'América del Norte' };

/**
 * Países como los escribe el USGS → nombre en español y continente.
 *
 * Cubre el mundo sísmicamente activo, no los 195 países: un sismo en Chad no va
 * a aparecer nunca en un feed de magnitud 4,5 o más.
 */
const COUNTRIES: Record<string, Territory> = {
  // — Asia —
  afghanistan: { country: 'Afganistán', continent: 'Asia' },
  armenia: { country: 'Armenia', continent: 'Asia' },
  azerbaijan: { country: 'Azerbaiyán', continent: 'Asia' },
  bangladesh: { country: 'Bangladés', continent: 'Asia' },
  bhutan: { country: 'Bután', continent: 'Asia' },
  burma: { country: 'Birmania', continent: 'Asia' },
  myanmar: { country: 'Birmania', continent: 'Asia' },
  cambodia: { country: 'Camboya', continent: 'Asia' },
  china: { country: 'China', continent: 'Asia' },
  cyprus: { country: 'Chipre', continent: 'Asia' },
  georgia: { country: 'Georgia', continent: 'Asia' },
  india: { country: 'India', continent: 'Asia' },
  indonesia: { country: 'Indonesia', continent: 'Asia' },
  iran: { country: 'Irán', continent: 'Asia' },
  iraq: { country: 'Irak', continent: 'Asia' },
  israel: { country: 'Israel', continent: 'Asia' },
  japan: { country: 'Japón', continent: 'Asia' },
  jordan: { country: 'Jordania', continent: 'Asia' },
  kazakhstan: { country: 'Kazajistán', continent: 'Asia' },
  kyrgyzstan: { country: 'Kirguistán', continent: 'Asia' },
  laos: { country: 'Laos', continent: 'Asia' },
  lebanon: { country: 'Líbano', continent: 'Asia' },
  malaysia: { country: 'Malasia', continent: 'Asia' },
  mongolia: { country: 'Mongolia', continent: 'Asia' },
  nepal: { country: 'Nepal', continent: 'Asia' },
  'north korea': { country: 'Corea del Norte', continent: 'Asia' },
  pakistan: { country: 'Pakistán', continent: 'Asia' },
  philippines: { country: 'Filipinas', continent: 'Asia' },
  'south korea': { country: 'Corea del Sur', continent: 'Asia' },
  'sri lanka': { country: 'Sri Lanka', continent: 'Asia' },
  syria: { country: 'Siria', continent: 'Asia' },
  taiwan: { country: 'Taiwán', continent: 'Asia' },
  tajikistan: { country: 'Tayikistán', continent: 'Asia' },
  thailand: { country: 'Tailandia', continent: 'Asia' },
  'east timor': { country: 'Timor Oriental', continent: 'Asia' },
  'timor leste': { country: 'Timor Oriental', continent: 'Asia' },
  turkey: { country: 'Turquía', continent: 'Asia' },
  turkmenistan: { country: 'Turkmenistán', continent: 'Asia' },
  uzbekistan: { country: 'Uzbekistán', continent: 'Asia' },
  vietnam: { country: 'Vietnam', continent: 'Asia' },
  yemen: { country: 'Yemen', continent: 'Asia' },

  // — Europa —
  albania: { country: 'Albania', continent: 'Europa' },
  austria: { country: 'Austria', continent: 'Europa' },
  'bosnia and herzegovina': { country: 'Bosnia y Herzegovina', continent: 'Europa' },
  bulgaria: { country: 'Bulgaria', continent: 'Europa' },
  croatia: { country: 'Croacia', continent: 'Europa' },
  france: { country: 'Francia', continent: 'Europa' },
  germany: { country: 'Alemania', continent: 'Europa' },
  greece: { country: 'Grecia', continent: 'Europa' },
  hungary: { country: 'Hungría', continent: 'Europa' },
  iceland: { country: 'Islandia', continent: 'Europa' },
  italy: { country: 'Italia', continent: 'Europa' },
  montenegro: { country: 'Montenegro', continent: 'Europa' },
  'north macedonia': { country: 'Macedonia del Norte', continent: 'Europa' },
  norway: { country: 'Noruega', continent: 'Europa' },
  poland: { country: 'Polonia', continent: 'Europa' },
  portugal: { country: 'Portugal', continent: 'Europa' },
  romania: { country: 'Rumanía', continent: 'Europa' },
  russia: { country: 'Rusia', continent: 'Europa' },
  serbia: { country: 'Serbia', continent: 'Europa' },
  slovenia: { country: 'Eslovenia', continent: 'Europa' },
  spain: { country: 'España', continent: 'Europa' },
  switzerland: { country: 'Suiza', continent: 'Europa' },
  'svalbard and jan mayen': { country: 'Svalbard', continent: 'Europa' },
  'united kingdom': { country: 'Reino Unido', continent: 'Europa' },

  // — África —
  algeria: { country: 'Argelia', continent: 'África' },
  'burkina faso': { country: 'Burkina Faso', continent: 'África' },
  cameroon: { country: 'Camerún', continent: 'África' },
  'democratic republic of the congo': { country: 'R. D. del Congo', continent: 'África' },
  djibouti: { country: 'Yibuti', continent: 'África' },
  egypt: { country: 'Egipto', continent: 'África' },
  eritrea: { country: 'Eritrea', continent: 'África' },
  ethiopia: { country: 'Etiopía', continent: 'África' },
  kenya: { country: 'Kenia', continent: 'África' },
  libya: { country: 'Libia', continent: 'África' },
  malawi: { country: 'Malaui', continent: 'África' },
  morocco: { country: 'Marruecos', continent: 'África' },
  mozambique: { country: 'Mozambique', continent: 'África' },
  somalia: { country: 'Somalia', continent: 'África' },
  'south africa': { country: 'Sudáfrica', continent: 'África' },
  sudan: { country: 'Sudán', continent: 'África' },
  tanzania: { country: 'Tanzania', continent: 'África' },
  tunisia: { country: 'Túnez', continent: 'África' },
  uganda: { country: 'Uganda', continent: 'África' },
  zambia: { country: 'Zambia', continent: 'África' },

  // — América —
  canada: { country: 'Canadá', continent: 'América del Norte' },
  greenland: { country: 'Groenlandia', continent: 'América del Norte' },
  mexico: { country: 'México', continent: 'América del Norte' },
  'united states': US,
  usa: US,

  'belize': { country: 'Belice', continent: 'América Central' },
  'costa rica': { country: 'Costa Rica', continent: 'América Central' },
  'el salvador': { country: 'El Salvador', continent: 'América Central' },
  guatemala: { country: 'Guatemala', continent: 'América Central' },
  honduras: { country: 'Honduras', continent: 'América Central' },
  nicaragua: { country: 'Nicaragua', continent: 'América Central' },
  panama: { country: 'Panamá', continent: 'América Central' },

  'antigua and barbuda': { country: 'Antigua y Barbuda', continent: 'El Caribe' },
  barbados: { country: 'Barbados', continent: 'El Caribe' },
  cuba: { country: 'Cuba', continent: 'El Caribe' },
  dominica: { country: 'Dominica', continent: 'El Caribe' },
  'dominican republic': { country: 'República Dominicana', continent: 'El Caribe' },
  grenada: { country: 'Granada', continent: 'El Caribe' },
  haiti: { country: 'Haití', continent: 'El Caribe' },
  jamaica: { country: 'Jamaica', continent: 'El Caribe' },
  martinique: { country: 'Martinica', continent: 'El Caribe' },
  'puerto rico': { country: 'Puerto Rico', continent: 'El Caribe' },
  'trinidad and tobago': { country: 'Trinidad y Tobago', continent: 'El Caribe' },
  'u.s. virgin islands': { country: 'Islas Vírgenes', continent: 'El Caribe' },
  'british virgin islands': { country: 'Islas Vírgenes Británicas', continent: 'El Caribe' },

  argentina: { country: 'Argentina', continent: 'América del Sur' },
  bolivia: { country: 'Bolivia', continent: 'América del Sur' },
  brazil: { country: 'Brasil', continent: 'América del Sur' },
  chile: { country: 'Chile', continent: 'América del Sur' },
  colombia: { country: 'Colombia', continent: 'América del Sur' },
  ecuador: { country: 'Ecuador', continent: 'América del Sur' },
  guyana: { country: 'Guyana', continent: 'América del Sur' },
  paraguay: { country: 'Paraguay', continent: 'América del Sur' },
  peru: { country: 'Perú', continent: 'América del Sur' },
  suriname: { country: 'Surinam', continent: 'América del Sur' },
  uruguay: { country: 'Uruguay', continent: 'América del Sur' },
  venezuela: { country: 'Venezuela', continent: 'América del Sur' },

  // — Oceanía —
  australia: { country: 'Australia', continent: 'Oceanía' },
  fiji: { country: 'Fiyi', continent: 'Oceanía' },
  'fiji islands': { country: 'Fiyi', continent: 'Oceanía' },
  'french polynesia': { country: 'Polinesia Francesa', continent: 'Oceanía' },
  guam: { country: 'Guam', continent: 'Oceanía' },
  kiribati: { country: 'Kiribati', continent: 'Oceanía' },
  'marshall islands': { country: 'Islas Marshall', continent: 'Oceanía' },
  micronesia: { country: 'Micronesia', continent: 'Oceanía' },
  nauru: { country: 'Nauru', continent: 'Oceanía' },
  'new caledonia': { country: 'Nueva Caledonia', continent: 'Oceanía' },
  'new zealand': { country: 'Nueva Zelanda', continent: 'Oceanía' },
  'northern mariana islands': { country: 'Islas Marianas del Norte', continent: 'Oceanía' },
  palau: { country: 'Palaos', continent: 'Oceanía' },
  'papua new guinea': { country: 'Papúa Nueva Guinea', continent: 'Oceanía' },
  samoa: { country: 'Samoa', continent: 'Oceanía' },
  'solomon islands': { country: 'Islas Salomón', continent: 'Oceanía' },
  tonga: { country: 'Tonga', continent: 'Oceanía' },
  tuvalu: { country: 'Tuvalu', continent: 'Oceanía' },
  vanuatu: { country: 'Vanuatu', continent: 'Oceanía' },
  'wallis and futuna': { country: 'Wallis y Futuna', continent: 'Oceanía' },
};

/**
 * Estados y territorios de EE. UU. El USGS los usa **en lugar del país**, y para
 * los de la costa oeste manda la sigla de dos letras (`"..., CA"`).
 */
const US_STATES = new Set([
  'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut',
  'delaware', 'florida', 'georgia', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa',
  'kansas', 'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan',
  'minnesota', 'mississippi', 'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire',
  'new jersey', 'new mexico', 'new york', 'north carolina', 'north dakota', 'ohio',
  'oklahoma', 'oregon', 'pennsylvania', 'rhode island', 'south carolina', 'south dakota',
  'tennessee', 'texas', 'utah', 'vermont', 'virginia', 'washington', 'west virginia',
  'wisconsin', 'wyoming',
  'al', 'ak', 'az', 'ar', 'ca', 'co', 'ct', 'de', 'fl', 'ga', 'hi', 'id', 'il', 'in',
  'ia', 'ks', 'ky', 'la', 'me', 'md', 'ma', 'mi', 'mn', 'ms', 'mo', 'mt', 'ne', 'nv',
  'nh', 'nj', 'nm', 'ny', 'nc', 'nd', 'oh', 'ok', 'or', 'pa', 'ri', 'sc', 'sd', 'tn',
  'tx', 'ut', 'vt', 'va', 'wa', 'wv', 'wi', 'wy',
]);

/**
 * Mares, dorsales y archipiélagos sin país. Se traducen para que la app no
 * mezcle idiomas, pero **no se les asigna continente**: un sismo en medio del
 * Pacífico no es de ninguno, y decir que sí sería inventar.
 */
const OCEAN_REGIONS: Record<string, string> = {
  'balleny islands': 'Islas Balleny',
  'banda sea': 'Mar de Banda',
  'bering sea': 'Mar de Bering',
  'caribbean sea': 'Mar Caribe',
  'carlsberg ridge': 'Dorsal de Carlsberg',
  'celebes sea': 'Mar de Célebes',
  'central east pacific rise': 'Dorsal del Pacífico Oriental',
  'central mid-atlantic ridge': 'Dorsal Mesoatlántica',
  'east pacific rise': 'Dorsal del Pacífico Oriental',
  'greenland sea': 'Mar de Groenlandia',
  'gulf of alaska': 'Golfo de Alaska',
  'gulf of california': 'Golfo de California',
  'java sea': 'Mar de Java',
  'kermadec islands': 'Islas Kermadec',
  'kuril islands': 'Islas Kuriles',
  'macquarie island': 'Isla Macquarie',
  'mid-indian ridge': 'Dorsal Índica',
  'molucca sea': 'Mar de las Molucas',
  'north atlantic ocean': 'Océano Atlántico Norte',
  'northern mid-atlantic ridge': 'Dorsal Mesoatlántica Norte',
  'pacific-antarctic ridge': 'Dorsal Pacífico-Antártica',
  'philippine sea': 'Mar de Filipinas',
  'reykjanes ridge': 'Dorsal de Reykjanes',
  'scotia sea': 'Mar de Scotia',
  'south atlantic ocean': 'Océano Atlántico Sur',
  'south indian ocean': 'Océano Índico Sur',
  'south of the fiji islands': 'al sur de Fiyi',
  'south sandwich islands': 'Islas Sandwich del Sur',
  'southeast indian ridge': 'Dorsal Índica Sudoriental',
  'southern east pacific rise': 'Dorsal del Pacífico Oriental Sur',
  'southern mid-atlantic ridge': 'Dorsal Mesoatlántica Sur',
  'timor sea': 'Mar de Timor',
  'western indian-antarctic ridge': 'Dorsal Índico-Antártica',
};

/**
 * Deja el territorio en forma comparable: minúsculas, sin el `" region"` que el
 * USGS agrega a discreción y sin la dirección de arranque (`"south of the ..."`).
 */
function normalizeTerritory(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+region$/, '')
    .replace(/^(?:north|south|east|west|northeast|northwest|southeast|southwest)\s+of\s+(?:the\s+)?/, '')
    .replace(/^off\s+the\s+coast\s+of\s+(?:the\s+)?/, '')
    .trim();
}

export type PlaceInfo = {
  /** Lo más parecido a "la ciudad": lo que va antes de la primera coma. */
  spot: string;
  /** País ya en español, si se pudo resolver. */
  country: string | null;
  continent: Continent | null;
  /**
   * Segunda línea para el feed global (`"Indonesia · Asia"`), o null si no hay
   * nada que agregar a `spot`. Ubica el sismo **entre países**.
   */
  label: string | null;
  /**
   * División administrativa local: `"Parinacochas, Ayacucho"` (provincia y
   * departamento). Solo la trae el IGP; el USGS no manda nada equivalente.
   *
   * Es lo contrario de `label`: no sirve para comparar países sino para saber
   * **dónde en el país** fue, que es lo que se pregunta cuando el sismo es acá.
   * Por eso la Home usa este y el feed global usa el otro.
   */
  area: string | null;
};

/**
 * Quita el prefijo de distancia y dirección que ambas fuentes anteponen:
 * `"63 km NNE of Ruteng"` → `"Ruteng"`, `"34 km al S de Mala"` → `"Mala"`.
 */
function cleanSpot(head: string): string {
  const afterPreposition = head.match(/\b(?:of|de)\s+(.+)$/i)?.[1] ?? head;
  // El guion separa provincia y departamento en los datos del IGP
  // ("Cañete - Lima"). Se exige espacio alrededor para no partir nombres
  // compuestos como "Pacific-Antarctic".
  return afterPreposition.replace(/^the\s+/i, '').split(/\s+-\s+/)[0]?.trim() || head;
}

const PERU: Territory = { country: 'Perú', continent: 'América del Sur' };

/**
 * La división administrativa que el IGP pone después de la primera coma:
 * `"Parinacochas - Ayacucho"` → `"Parinacochas, Ayacucho"` (provincia y
 * departamento).
 *
 * **Verificado contra la base:** los 24 `place` del IGP ingeridos siguen todos
 * el mismo formato. Aun así se parte por el guion en vez de exigirlo: si algún
 * día viene un solo nombre, se muestra ese y ya.
 *
 * Se descartan las partes repetidas porque en el Perú hay provincias que se
 * llaman igual que su departamento —Lima, Tacna, Ica— y "Lima, Lima" no informa
 * nada; también se descarta la que repite el lugar ("Coracora, Coracora").
 */
function peruvianArea(rest: string[], spot: string): string | null {
  const partes = rest
    .flatMap((parte) => parte.split(/\s+-\s+/))
    .map((parte) => parte.trim())
    .filter(Boolean);

  const vistas = new Set([spot.toLowerCase()]);
  const unicas = partes.filter((parte) => {
    const clave = parte.toLowerCase();
    if (vistas.has(clave)) return false;
    vistas.add(clave);
    return true;
  });

  return unicas.length > 0 ? unicas.join(', ') : null;
}

/**
 * @param source De dónde vino el evento. Importa porque el feed global **no es
 *   solo del USGS**: `get_quake_feed('global')` devuelve todo lo canónico sobre
 *   4,5, y ahí entran los sismos peruanos del IGP con su formato en español
 *   ("34 km al S de Mala, Cañete - Lima"), donde lo que sigue a la última coma
 *   es un departamento y no un país. Para esos la procedencia no hay que
 *   deducirla del texto: la fuente ya la dice.
 */
export function describePlace(
  place: string | null | undefined,
  source?: 'igp' | 'usgs' | 'simulacro',
): PlaceInfo {
  // El sismo del modo simulacro no tiene lugar que describir: es sintético y
  // local (0035). Se corta acá para que no pase por el parser y termine
  // inventando un departamento del Perú a partir de la palabra «Simulacro».
  if (source === 'simulacro') {
    return { spot: 'Simulacro', country: null, continent: null, label: null, area: null };
  }

  const texto = place?.trim();
  if (!texto) {
    return { spot: 'Zona no especificada', country: null, continent: null, label: null, area: null };
  }

  const partes = texto.split(/\s*,\s*/).filter(Boolean);
  const spot = cleanSpot(partes[0] ?? texto);

  if (source === 'igp') {
    return {
      spot,
      country: PERU.country,
      continent: PERU.continent,
      label: `${PERU.country} · ${PERU.continent}`,
      area: peruvianArea(partes.slice(1), spot),
    };
  }

  // Sin coma, lo que hay ES el territorio: "Kermadec Islands region",
  // "Pacific-Antarctic Ridge". Se resuelve igual, pero el resultado reemplaza al
  // lugar en vez de ir en una segunda línea, que repetiría lo mismo.
  if (partes.length === 1) {
    const solo = normalizeTerritory(partes[0]!);

    const paisSolo = COUNTRIES[solo];
    if (paisSolo) {
      return {
        spot: paisSolo.country,
        country: paisSolo.country,
        continent: paisSolo.continent,
        label: paisSolo.continent,
        area: null,
      };
    }

    const marSolo = OCEAN_REGIONS[solo];
    if (marSolo) return { spot: marSolo, country: null, continent: null, label: null, area: null };

    return { spot, country: null, continent: null, label: null, area: null };
  }

  const territorio = normalizeTerritory(partes[partes.length - 1]!);
  const pais = COUNTRIES[territorio];
  if (pais) {
    return {
      spot,
      country: pais.country,
      continent: pais.continent,
      label: `${pais.country} · ${pais.continent}`,
      area: null,
    };
  }

  if (US_STATES.has(territorio)) {
    return {
      spot,
      country: US.country,
      continent: US.continent,
      label: `${US.country} · ${US.continent}`,
      area: null,
    };
  }

  const mar = OCEAN_REGIONS[territorio];
  if (mar) return { spot, country: null, continent: null, label: mar, area: null };

  // Territorio desconocido: se muestra tal cual antes que perderlo. Preferimos
  // una palabra en inglés a que el usuario no sepa de qué parte del mundo habla.
  const crudo = partes[partes.length - 1]!.trim();
  return { spot, country: null, continent: null, label: crudo === spot ? null : crudo, area: null };
}
