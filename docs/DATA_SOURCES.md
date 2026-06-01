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

## Bathymetry

### GEBCO 2023 (community asset)
- **GEE community asset**: GEBCO 2023 grid via Sat-IO community datasets ([awesome-gee-community-datasets](https://samapriya.github.io/awesome-gee-community-datasets/))
- **Provider**: General Bathymetric Chart of the Oceans (GEBCO)
- **Resolution**: ~450 m (15 arc-seconds)
- **Use**: Coastal depth mask (≤ 15 m) for biophysical filtering
- **Reference**: GEBCO Compilation Group (2023)

*Alternative*: NOAA ETOPO1 (`NOAA/NGDC/ETOPO1`) at ~1.8 km resolution may be used if GEBCO community asset is unavailable, but GEBCO is preferred for coastal applications.

---

## Land/water reference

### JRC Global Surface Water
- **GEE asset**: `JRC/GSW1_4/GlobalSurfaceWater`
- **Provider**: European Commission, Joint Research Centre
- **Resolution**: ~30 m
- **Use**: Permanent water extraction → land mask → coastal distance (≤ 3 km)
- **Reference**: Pekel et al. (2016), *Nature*, 540(7633)
- **License**: CC-BY 4.0

---

## Training data

### User-drawn polygons (not included in repository)
- **174 polygons** (71 seagrass + 51 sand + 52 deep water)
- **Source**: Visual interpretation in ArcGIS Pro using high-resolution basemaps + Sentinel-2 RGB/false-color composites + NDAVI imagery
- **Quality control**: 5 m negative buffer + multi-iteration triage (band-value verification + spectral profile inspection)
- **License (when published)**: CC-BY 4.0
- **Sharing**: Training polygons will be released as a Zenodo dataset upon journal publication

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
- GEBCO Compilation Group (2023)
- JRC Global Surface Water (Pekel et al., 2016)
