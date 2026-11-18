# Black Sea Seagrass Mapping — Sentinel-2 + Machine Learning

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Google Earth Engine](https://img.shields.io/badge/GEE-JavaScript-orange.svg)](https://earthengine.google.com/)
[![Status: pre-publication](https://img.shields.io/badge/status-pre--publication-lightgrey.svg)]()
[![Web App](https://img.shields.io/badge/GEE_App-Live_Demo-blue.svg)](https://sdanacioglu.projects.earthengine.app/view/blacksea-seagrass-mapping)

Reproducible seagrass habitat mapping pipeline for the **Western Black Sea coast** (İğneada–Karaburun, Türkiye) using Sentinel-2 multispectral imagery and two machine learning classifiers (Random Forest, Support Vector Machines) on Google Earth Engine.

---

## Overview

This repository contains the core code base and methodology documentation for the study:

> **Seagrass Mapping Along the Western Black Sea Coast of Türkiye Using Sentinel-2 and Google Earth Engine: A Comparison of Random Forest and Support Vector Machines Algorithms**

### Key features

- Sentinel-2 L2A pre-processing with **tile-aware Hedley sun glint correction**
- **Linear radiometric normalization** between MGRS tiles (Schott 1988; Yang & Lo 2000) for tile-seam removal
- **11-feature stacked image** (B1–B5, NDAVI, MNDWI, TI, SDB, TB1, TB2)
- **Two-classifier comparison**: Random Forest (RF) and Support Vector Machines (SVM, RBF with grid search)
- **3-fold spatial cross-validation** (latitudinal blocks)
- **Biophysical masking** (JRC-based coastal distance, effective ≈ 1 km)
- **RF ∩ SVM agreement map** (agreement between the two models, not verified accuracy)
- **Reproducible sampling**: coordinate-based per-block undersampling — no `bestEffort` stochasticity
- **Training polygons included** ([`data/training_polygons.geojson`](data/training_polygons.geojson)) with class and cross-validation block labels
- **Interactive web application** with layer toggles, point inspector, time series, and area calculator

### Performance summary

| Classifier | Overall Accuracy | Cohen's κ |
|---|---|---|
| Random Forest (100 trees, √11 ≈ 3) | 0.832 | 0.663 |
| **SVM (RBF, C\*=10, γ\*=0.1)** | **0.861** | **0.722** |

Mean values of 3-fold spatial cross-validation on latitudinal blocks. RF was also evaluated over 20 parameter combinations (50–500 trees × 2–6 variables per split): mean OA 0.820–0.832, κ 0.639–0.664.

| Product (after MMU filter and coastal mask) | Area |
|---|---|
| SVM | 3,634 ha |
| RF | 3,509 ha |
| RF ∩ SVM (agreement) | 2,991 ha |

**Important limitation**: training and validation data come from visual interpretation of high-resolution imagery; no field validation was carried out. The mapped areas should be regarded as **potential seagrass habitat and an upper-bound estimate**.

---

## Repository structure

```
blacksea-seagrass-mapping/
├── README.md              ← This file
├── LICENSE                ← MIT License
├── CITATION.cff           ← Citation metadata
├── .gitignore
│
├── code/
│   ├── gee/
│   │   ├── seagrass_mapping_v9.js     ← Main GEE analysis pipeline
│   │   └── seagrass_webapp.js         ← Interactive web application
│   └── arcgis/
│       ├── extract_pixels.py          ← Per-pixel feature extraction
│       └── polygon_triage.py          ← Training-polygon quality control
│
├── data/
│   └── training_polygons.geojson      ← 174 training polygons with class and CV-block labels
│
└── docs/
    ├── METHODOLOGY.md     ← Step-by-step methodological description
    ├── REPRODUCIBILITY.md ← How to reproduce the published results
    ├── DATA_SOURCES.md    ← Sentinel-2, JRC, training data
    └── REFERENCES.md      ← Complete reference list (APA 7)
```

---

## Quick start

### Prerequisites

- [Google Earth Engine account](https://earthengine.google.com/signup/)
- ArcGIS Pro 3.x (optional — for polygon-level analysis and pixel extraction)

### 1. GEE workflow

Open [`code/gee/seagrass_mapping_v9.js`](code/gee/seagrass_mapping_v9.js) in the [GEE Code Editor](https://code.earthengine.google.com/).

**Live demo:** [sdanacioglu.projects.earthengine.app/view/blacksea-seagrass-mapping](https://sdanacioglu.projects.earthengine.app/view/blacksea-seagrass-mapping)

The script points to the author's GEE assets. To run it yourself, upload the study area and the training polygons ([`data/training_polygons.geojson`](data/training_polygons.geojson)) as assets and replace these variables with your own paths:

```js
var STUDY_AREA_ASSET = '...';   // Section 1
var TRAINING_ASSET   = '...';   // Section 12
var OUTPUT_ASSET_PATH = '...';  // export section
// Drive folder for exports: folder: '...'
```

Then click **Run**.

### 2. ArcGIS analysis (optional)

In ArcGIS Pro's Python Window:
```python
exec(open(r"path/to/code/arcgis/extract_pixels.py").read())
```

---

## Documentation

- [Methodology](docs/METHODOLOGY.md) — Step-by-step methodological description (TR/EN)
- [Reproducibility guide](docs/REPRODUCIBILITY.md) — How to reproduce the results
- [Data sources](docs/DATA_SOURCES.md) — Sentinel-2, JRC, training data
- [References](docs/REFERENCES.md) — Complete reference list (APA 7th Edition)

---

## Citation

<!-- Citation will be added upon publication. -->

---

## License

- **Code**: [MIT License](LICENSE) — permissive, reuse welcome with attribution
- **Documentation**: [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/) — attribution required

---

## Contact

**Şevki Danacıoğlu** — sdanacioglu@gmail.com

---

**Status:** Pre-publication / active development. Repository will be made **public upon journal acceptance**.
