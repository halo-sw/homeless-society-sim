"""Area data pipeline: OSM extract -> parse -> join -> graph -> area files.

Stage 1 of the housing life simulator. Reads the national OSM extract and
the GIS building register (see ``briefs/01-data-pipeline.md``) and writes
self-contained area files under ``data/build/<area>/``.

Entry point: ``.venv/bin/python -m pipeline build --area pangyo``.
"""

__version__ = "0.1.0"

__all__ = ["areas", "extract", "osm_parse", "building_join", "graph",
           "area_build", "validate", "cli"]
