# Black Sea Seagrass Mapping — Sentinel-2 + Machine Learning

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Google Earth Engine](https://img.shields.io/badge/GEE-JavaScript-orange.svg)](https://earthengine.google.com/)
[![Status: pre-publication](https://img.shields.io/badge/status-pre--publication-lightgrey.svg)]()
[![Web App](https://img.shields.io/badge/GEE_App-Live_Demo-blue.svg)](https://sdanacioglu.projects.earthengine.app/view/blacksea-seagrass-mapping)

Reproducible seagrass habitat mapping pipeline for the **Western Black Sea coast** (İğneada–Karaburun, Türkiye) using Sentinel-2 multispectral imagery and two machine learning classifiers (Random Forest, Support Vector Machines) on Google Earth Engine.

---

## Overview

This repository contains the core code base and methodology documentation for the study:

> **Danacıoğlu, Ş.** (2026). *Batı Karadeniz (İğneada–Karaburun) Kıyılarında Sentinel-2 ile Deniz Çayırı Haritalama* [Sentinel-2 based seagrass mapping in the Western Black Sea]. *Turkish Journal of Remote Sensing (TJRS)* (under preparation).

### Key features

- Sentinel-2 L2A preprocessing with **tile-aware Hedley sunglint correction**
- **Linear radiometric normalization** between MGRS tiles (Schott 1988; Yang & Lo 2000) for tile-seam removal
- **11-feature stacked image** (B1–B5, NDAVI, MNDWI, TI, SDB, TB1, TB2)
- **Two-classifier comparison**: Random Forest (RF) and Support Vector Machines (SVM, RBF with grid search)
- **3-fold spatial cross-validation** (latitudinal blocks)
- **Biophysical masking** (JRC coastal distance ≤ 3 km)
- **RF ∩ SVM intersection map** (high-confidence agreement product)
- **Deterministic reproducibility**: coordinate-based block undersampling — no `bestEffort` stochasticity
- **Interactive web application** with layer toggles, point inspector, time series, and area calculator

### Performance summary (v9 deterministic results)

| Classifier | Overall Accuracy | Cohen's κ |
|---|---|---|
| Random Forest (100 trees, √11 ≈ 3) | 0.832 | 0.663 |
| **SVM (RBF, C\*=10, γ\*=0.1)** | **0.861** | **0.722** |

κ = 0.722 falls within Landis & Koch (1977) **"substantial agreement"** band; represents a strong performance for Case-2 (optically complex) coastal waters.

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
│   │   ├── seagrass_mapping_v9.js     ← Main GEE analysis pipeline (current)
│   │   ├── seagrass_webapp.js         ← Interactive web application (v3)
│   │   └── seagrass_mapping_v8.js     ← Previous version (archived)
│   └── arcgis/
│       ├── extract_pixels.py          ← Per-pixel feature extraction
│       └── polygon_triage.py          ← Training-polygon quality control
│
└── docs/
    ├── METHODOLOGY.md     ← Step-by-step methodological description
    ├── REPRODUCIBILITY.md ← How to reproduce the published results
    └── DATA_SOURCES.md    ← Sentinel-2, GEBCO, JRC references
```

---

## Quick start

### Prerequisites

- [Google Earth Engine account](https://earthengine.google.com/signup/)
- ArcGIS Pro 3.x (optional — for polygon-level analysis and pixel extraction)

### 1. GEE workflow

Open [`code/gee/seagrass_mapping_v9.js`](code/gee/seagrass_mapping_v9.js) in the [GEE Code Editor](https://code.earthengine.google.com/).

**Live demo:** [sdanacioglu.projects.earthengine.app/view/blacksea-seagrass-mapping](https://sdanacioglu.projects.earthengine.app/view/blacksea-seagrass-mapping)

Replace the following placeholders with your own GEE project paths:

```js
var STUDY_AREA_ASSET = 'projects/YOUR_GEE_PROJECT/assets/STUDY_AREA_ASSET';
var TRAINING_ASSET   = 'projects/YOUR_GEE_PROJECT/assets/TRAINING_POLYGONS_ASSET';
var OUTPUT_ASSET_PATH= 'projects/YOUR_GEE_PROJECT/assets/OUTPUT_FOLDER';
// Drive folder for exports:
folder: 'YOUR_DRIVE_FOLDER'
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
- [Data sources](docs/DATA_SOURCES.md) — Sentinel-2, JRC, ESA references

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
