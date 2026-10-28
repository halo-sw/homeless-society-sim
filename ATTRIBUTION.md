# Attribution

Data sources used by the stage-1 pipeline. Keep this file and the on-screen
attribution in later stages in sync.

* **OpenStreetMap** — © OpenStreetMap contributors. Data is available under
  the Open Database License (ODbL): <https://www.openstreetmap.org/copyright>
  (licence text: <https://opendatacommons.org/licenses/odbl/>). National
  extract used here: data up to 2026-10-27T21:23:59Z.
* **Geofabrik** — national South-Korea extract
  (`south-korea-latest.osm.pbf`) downloaded from the Geofabrik download
  service: <https://download.geofabrik.de> (<https://www.geofabrik.de>).
  Extract contents are OpenStreetMap data (ODbL, see above).
* **GIS건물통합정보 (building register)** — 건물통합정보 provided by the
  Ministry of Land, Infrastructure and Transport (국토교통부) via VWorld.
  Source shapefiles (`data/raw/buildings/<region>/`, 기준일 2026-10-09)
  are labelled CC BY / 공공누리 제1유형 (attribution). VWorld:
  <https://www.vworld.kr>.

Derived files under `data/build/` mix these sources: OSM-derived geometry
remains ODbL-covered, and register-derived building attributes require the
register attribution above. When the simulator displays a map or scene, show
“© OpenStreetMap contributors · GIS건물통합정보 (국토교통부/VWorld)” with a
link to this file or the sources above.
