# Area file schema (`area.json`)

Self-contained per-area output of stage 1, written by
`pipeline/area_build.py` to `data/build/<area>/area.json`. Later stages (3D
scene builder, agent engine) load this file — plus its sibling part files
when present — without touching raw data.

Companion file: `report.json` (build metrics; same directory). The
intermediate `osm.json` / `buildings.json` / `graph.json` files are kept for
debugging but are not part of the stage-2 contract.

## Coordinates

* All geometries are **WGS84 (EPSG:4326)**, `[lon, lat]` order, 7 decimals
  (≈1 cm). GeoJSON geometry types: `Point`, `LineString`, `Polygon`,
  `MultiPolygon`.
* The **local metre frame** is an equirectangular projection around the
  stored origin `crs.local.origin` (`{lon, lat}`):
  `x = (lon − lon0) · 111320 · cos(lat0)`, `y = (lat − lat0) · 111320`,
  in metres. Origin rule: the station centre for 1.2 km scene boxes, the
  feature-bounds midpoint for gu-sized boundary areas. The helper
  `pipeline.area_build.local_xy` implements the formula.
* Lengths (`length_m`) and areas (`area_m2`) are metres / m² (haversine and
  local-frame respectively). Heights (`height_m`) are metres above ground.

## Top-level fields

| field | type | meaning |
|---|---|---|
| `area` | string | area id (`pangyo`, `seongsu`, `songpa`, `songpa-jamsil`) |
| `label` | string | Korean label, e.g. `판교역 인근` |
| `kind` | string | `bbox` (1.2 km scene box) or `boundary` (gu-sized admin area) |
| `bbox` | `[minlon, minlat, maxlon, maxlat]` | scene-box bounds, or computed feature bounds for `boundary` areas; WGS84 degrees |
| `center` | `[lon, lat] \| null` | station centre for `bbox` areas, else null |
| `station` | object \| null | `{name, lon, lat, osm_kind, osm_id}` station lookup used (null for `boundary`) |
| `boundary` | object \| null | `{name, relation_id, admin_level}` admin lookup used (null for `bbox`) |
| `crs` | object | `{geographic: "EPSG:4326", local: {type: "equirectangular", origin: {lon, lat}, units: "metre"}}` |
| `counts` | object | section sizes: `buildings`, `roads`, `pois`, `landuse`, `trees`, `graph_nodes`, `walk_edges`, `bike_edges`, `drive_edges` |
| `buildings` | array \| `{"$ref": file}` | building list (see below) |
| `roads` | array \| `{"$ref": file}` | road list (see below) |
| `pois` | array \| `{"$ref": file}` | named-POI list (see below) |
| `landuse` | array \| `{"$ref": file}` | landuse / park / water list (see below) |
| `trees` | array \| `{"$ref": file}` | tree list (see below) |
| `graph` | object \| `{"$ref": file}` | `{nodes, edges}` routing graph (see below) |

## Sections

**buildings[]** — one entry per OSM footprint and per unmatched register
polygon. `id`: `w<osm>` / `r<osm>` for OSM footprints, `reg:<A1>` for
register polygons. `origin`: `joined` (matched pair), `osm` (no register
match), `register` (OSM lacks it).

| field | type | meaning |
|---|---|---|
| `building` | string | coarse type (`apartments`, `house`, `commercial`, …, `yes`) |
| `name` | string \| null | building name (OSM or register A24 + A25) |
| `height_m` | number | height in metres |
| `height_source` | string | `osm_height` > `osm_levels` (×3.0 m) > `register_height` (A16) > `register_floors` (A26 ×3.0 m) > `inferred` (seeded type+area rule) |
| `levels` | int \| null | floor count behind the height, when known |
| `area_m2` | number | footprint area, m² |
| `register` | object \| null | `{height, floors_above, floors_below, use, structure, approval_date, address, region}` register snapshot for joined/register buildings |
| `osm_kind` / `osm_id` | string/int \| null | OSM source (`way`/`relation`) for joined/osm buildings |
| `register_id` | string \| null | `reg:<A1>` for joined/register buildings |
| `geometry` | Polygon/MultiPolygon | footprint, WGS84 |

**roads[]** — `id` (`w<osm>`), `highway` class, `name` (nullable), `oneway`
(bool) + `oneway_reverse` (bool, `oneway=-1`), `access` (subset of OSM
access tags), `lanes` (int, nullable), `bridge`/`tunnel` (tag value or
null), `layer` (int, default 0), `area` (bool: `area=yes` surface such as
a pedestrian plaza — kept for rendering, excluded from the routing graph),
`motorroad` (bool: `motorroad=yes` expressway — never walkable, bike only
with `bicycle=yes`, drivable), `geometry` (LineString, WGS84).

**pois[]** — named POIs only: `id`, `name`, `category`
(`<key>:<value>`, e.g. `amenity:cafe`, `shop:convenience`,
`railway:station`), `geometry` (Point, WGS84), `osm_kind`/`osm_id`.

**landuse[]** — `id`, `kind` (`landuse:<v>`, `leisure:<v>`,
`natural:<v>`, `waterway:<v>`), `name` (nullable), `geometry`
(Polygon/MultiPolygon, or LineString for `natural:tree_row`).

**trees[]** — `id`, `geometry` (Point, WGS84), `osm_kind`/`osm_id`.

**graph** — `{nodes: {id: [lon, lat]}, edges: {walk: [], bike: [], drive:
[]}}`. Node ids (`n000000…`) are assigned in sorted coordinate order, so
they are stable across runs. Each edge: `{from, to, way (OSM way id),
highway, name, length_m}`. Mode rules: walk excludes motorways and
`foot=no`/denied access; bike additionally excludes steps unless
`bicycle=yes`; drive covers drivable classes only. `oneway`/`oneway=-1`
apply to all three modes.

## Split files

A section larger than 2 MB when serialised is written to
`area.<section>.json` next to `area.json`, and `area.json` holds
`{"$ref": "area.<section>.json"}` in its place. Small areas are a single
file; Songpa-gu splits into `area.buildings.json`, `area.graph.json` and
`area.roads.json`. Loader sketch:

```python
import json
from pathlib import Path

def load_area(area_dir: str | Path) -> dict:
    area_dir = Path(area_dir)
    area = json.loads((area_dir / "area.json").read_text(encoding="utf-8"))
    for key, value in area.items():
        if isinstance(value, dict) and set(value) == {"$ref"}:
            part = area_dir / value["$ref"]
            area[key] = json.loads(part.read_text(encoding="utf-8"))
    return area
```

## Determinism

`area.json` and part files use sorted keys and fixed float rounding with no
timestamps or unseeded randomness: rebuilding an unchanged area produces
byte-identical files (verified by md5 over rebuilds). `report.json` timings
are measured durations and naturally vary between runs.
