# Data Sources

All datasets used in this study are publicly available via Google Earth Engine or open repositories.

---

## Satellite imagery

### Sentinel-2 Level-2A (Surface Reflectance, Harmonized)
- **GEE collection**: `COPERNICUS/S2_SR_HARMONIZED`
- **Provider**: European Space Agency (Copernicus Programme)
- **Spatial resolution**: 10 m (B2, B3, B4, B8), 20 m (B5, B11), 60 m (B1)
- **Temporal coverage**: 2017–present (this study: 1 Jul – 15 Sep 2025)
- **License**: Free and open (Copernicus Data and Information Policy)
- **Reference**: ESA Sentinel-2 User Handbook

---

## Land/water reference

### JRC Global Surface Water
- **GEE asset**: `JRC/GSW1_4/GlobalSurfaceWater`
- **Provider**: European Commission, Joint Research Centre
- **Resolution**: ~30 m
- **Use**: Permanent water extraction → land mask → coastal-distance mask (effective distance ≈ 1 km)
- **Reference**: Pekel et al. (2016), *Nature*, 540(7633)
- **License**: CC-BY 4.0

---

## Training data

### User-drawn polygons ([`data/training_polygons.geojson`](../data/training_polygons.geojson))
- **174 polygons** (71 seagrass + 51 sand + 52 deep water)
- **Format**: GeoJSON, WGS 84 (EPSG:4326). Attributes: `class` (1 = seagrass, 0 = non-seagrass), `class_name`, `class_sub` (seagrass / sand / deep_water), `block` (N / C / S, as used in the paper) and `block_code` (K / O / G, as used in the GEE script)
- **Spatial cross-validation blocks**: polygons are assigned by centroid latitude; block boundaries lie at 41.56055°N (S/C) and 41.77995°N (C/N). Polygons per block: N 59 (21 seagrass), C 51 (22 seagrass), S 64 (28 seagrass)
- **Source**: Visual interpretation in ArcGIS Pro (no field data) using the Esri World Imagery basemap (Vantor Vivid mosaics of WorldView-2/3 imagery, 0.3–0.5 m), Sentinel-2 composite band combinations, NDAVI (visual aid only, no threshold) and the field-verified *Zostera* polygons of the adjacent Bulgarian coast (Berov et al., 2022; https://doi.org/10.17882/79590) as an interpretation key
- **Quality control**: 5 m negative buffer + multi-iteration triage (band-value verification + spectral profile inspection)
- **License**: CC-BY 4.0

---

## Software

| Tool | Version | Use |
|---|---|---|
| Google Earth Engine | Code Editor (web) | Main processing pipeline |
| ArcGIS Pro | 3.x | Polygon digitization + pixel extraction |
| Python | 3.11+ | Figure generation (not part of public release) |
| matplotlib | ≥ 3.7 | Plotting |
| pandas | ≥ 2.0 | Data handling |
| numpy | ≥ 1.24 | Numerical operations |
| python-docx | ≥ 1.1 | (Optional) Word document automation |

---

## Citation of data sources

When using this code in a publication, please cite the relevant data providers:

- ESA Sentinel-2 mission
- JRC Global Surface Water (Pekel et al., 2016)
