# Building register (GIS건물통합정보) DBF field mapping

Source file inspected: `data/raw/buildings/seoul/AL_D010_11_20261009.*`
(695,753 polygons, DBF encoding cp949, CRS Korea_2000_Central_Belt_2010 /
EPSG:5186). Field names are anonymised (`A0`…`A28`); the mapping below was
derived from value inspection (random samples of 1,500–6,000 records) and is
used by `pipeline/building_join.py` (only A1, A4, A5, A8, A9, A11, A12, A13,
A16, A24, A25, A26, A27 are consumed; the rest is documented for later stages).

| field | DBF type | meaning | confidence | evidence |
|---|---|---|---|---|
| A0 | N(9,0) | row serial number | medium | near-unique integers, range 29–162680 in a 3k sample |
| A1 | C(28) | building management id, unique per record | high | 3000/3000 unique; used as stable register id |
| A2 | C(19) | parcel id (PNU: 법정동코드 + 지번) | medium-high | `1111017500107040000` matches A3 + A5 pattern |
| A3 | C(10) | 10-digit 법정동 code | high | `1111017500` for 종로구 숭인동 |
| A4 | C(254) | 법정동 address (`서울특별시 종로구 숭인동`) | high | full address strings |
| A5 | C(10) | lot number (번지), e.g. `56-24` | high | matches 번지 format |
| A6/A7 | C(1)/C(254) | lot-type code/label: `1`/일반 vs `2`/산 | high | paired values (1470/30 split) |
| A8/A9 | C(5)/C(254) | use code/name, e.g. `01000`/단독주택 | high | stable code↔name pairs (see table) |
| A10/A11 | C(2)/C(254) | structure code/name, e.g. `11`/벽돌구조 | high | stable pairs; `21`/철근콘크리트구조 most common |
| A12 | N(18,15) | footprint area, m² (건축면적) | high | A12/A15 equals A17 exactly (see below) |
| A13 | C(10) | approval date (사용승인일), `YYYY-MM-DD` | high | dates track building age (1962…2018) |
| A14 | N(18,15) | gross floor area, m² (연면적) | high | scales with floors × footprint |
| A15 | N(18,15) | site area, m² (대지면적) | high | A12/A15 == A17 verified on samples |
| A16 | N(18,15) | building height, m | high | 20 floors→59.5, 23→97.6, 3→9.1; 0.0 when unknown |
| A17 | N(18,15) | coverage %, 건폐율 | high | arithmetic verified (e.g. 1677.13/2796.8 = 59.96) |
| A18 | N(18,15) | floor-area ratio %, 용적률 | medium | plausible range, arithmetic not verified |
| A19 | C(28) | unknown numeric, often empty | low | values like `25600`, `965`, or long ids |
| A20 | C(2) | unknown flag (`N`/`Y`/empty) | low | no correlation found |
| A21 | C(17) | auxiliary building id (`B001…`), sometimes empty | medium | near-unique, not usable as key |
| A22 | D(8) | base date (기준일 `2026-10-06`) | high | constant |
| A23 | C(5) | 5-digit 시군구 code, e.g. `11110` 종로구 | high | matches known codes |
| A24 | C(254) | building name, e.g. `목동현대1차아파트` | high | present on named buildings (~15%) |
| A25 | C(254) | sub-unit (동), e.g. `101동` | high | apartment/office wings |
| A26 | N(9,0) | above-ground floors (지상층수) | high | consistent with A16 (≈3 m/floor) |
| A27 | N(9,0) | basement floors (지하층수) | high | 0–6, pairs with A26 |
| A28 | C(10) | data change date, `YYYY-MM-DD` | medium | year spread 2011–2026, mode 2017 |

Observed use codes (A8→A9): `01000` 단독주택, `02000` 공동주택,
`03000` 제1종근린생활시설, `04000` 제2종근린생활시설, `06000` 종교시설,
`10000` 교육연구시설, `11000` 노유자시설, `14000` 업무시설, `15000` 숙박시설,
`17000` 공장, `18000` 창고시설, `Z3000` 근린생활시설 (empty = unclassified).

Known data quirks: A16/A14–A18 are `0.0` (or NULL) when unknown rather than
empty; A8–A11 can be empty together (~22% of records); A24/A25 are empty for
most small houses.

## Sample rows (public buildings, mapped fields)

1. 대치힐하우스 (공동주택, 강남구 대치동 987-2): A16 height 15.9 m, A26/A27
   4/1 floors, A10/A11 `21`/철근콘크리트구조, A12/A14/A15 126.89/608.9/238.4 m²,
   A13 approval 2003-02-07.
2. 대풍오피스텔 (업무시설, 양천구 목동 783-9): 17.6 m, 6/0 floors,
   철근콘크리트구조, 102.36/513.9/171.6 m², approval 2004-05-18.
3. 가양도시개발공사아파트2단지 유치원 (교육연구시설, 강서구 가양동 1461):
   height unknown (0.0 → floors fallback), 2/1 floors, 273.45/751.23/546.9 m²,
   approval 1992-11-30.
4. 옥산주택 (단독주택, 강북구 수유동 312-28): 8.9 m, 3/1 floors,
   52.92/190.68/96.43 m², approval 2018-06-05.
5. 래미안월곡아파트 106동 (공동주택): 55.0 m, 20/0 floors (tall-building check).
