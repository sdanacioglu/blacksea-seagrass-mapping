# Black Sea Seagrass Mapping — Sentinel-2 + Machine Learning

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/)
[![Google Earth Engine](https://img.shields.io/badge/GEE-JavaScript-orange.svg)](https://earthengine.google.com/)
[![Status: pre-publication](https://img.shields.io/badge/status-pre--publication-lightgrey.svg)]()

Reproducible seagrass habitat mapping pipeline for the **Western Black Sea coast** (İğneada–Karaburun, Türkiye) using Sentinel-2 multispectral imagery and three machine learning classifiers (Random Forest, Support Vector Machines, Gradient Boosting Machine) on Google Earth Engine.

---

## Overview

This repository contains the complete code base and methodology documentation for the study:

> **Danacıoğlu, Ş.** (2026). *Batı Karadeniz (İğneada–Karaburun) Kıyılarında Sentinel-2 ile Deniz Çayırı Haritalama* [Sentinel-2 based seagrass mapping in the Western Black Sea]. *Geomatik Dergisi* (under preparation).

### Key features

- Sentinel-2 L2A preprocessing with **tile-aware Hedley sunglint correction**
- **Linear radiometric normalization** between MGRS tiles (Schott 1988; Yang & Lo 2000) for tile-seam removal
- **13-feature stacked image** (B1–B5, NDAVI, WAVI, MNDWI, TI, SDB, TB1, TB2, NDRE)
- **Three-classifier comparison**: RF, SVM (RBF with grid search), GBM
- **3-fold spatial cross-validation** (latitudinal blocks)
- **Biophysical masking** (GEBCO depth ≤ 15 m + JRC coastal distance ≤ 3 km)
- **Majority-consensus map product** (≥2 out of 3 classifiers agreement)

### Performance summary

| Classifier | Overall Accuracy | Cohen's κ |
|---|---|---|
| Random Forest (100 trees) | 0.833 | 0.665 |
| **SVM (RBF, C\*=1, γ\*=0.1)** | **0.859** | **0.717** |
| GBM (150 trees) | 0.831 | 0.651 |

κ = 0.717 falls within Landis & Koch (1977) **"substantial agreement"** upper range; represents an upper-bound performance for Case-2 (optically complex) coastal waters.

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
│   │   └── seagrass_mapping_v7.js     ← Main Google Earth Engine pipeline
│   ├── arcgis/                          ← ArcGIS Pro Python (added later)
│   └── python/                          ← Figure generation (added later)
│       └── requirements.txt
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
- Python 3.11+
- ArcGIS Pro 3.x (optional — for polygon-level analysis)

### 1. GEE workflow

Open [`code/gee/seagrass_mapping_v7.js`](code/gee/seagrass_mapping_v7.js) in the [GEE Code Editor](https://code.earthengine.google.com/).

Replace the following placeholders with your own GEE project paths:

```js
var STUDY_AREA_ASSET = 'projects/YOUR_GEE_PROJECT/assets/STUDY_AREA_ASSET';
var TRAINING_ASSET   = 'projects/YOUR_GEE_PROJECT/assets/TRAINING_POLYGONS_ASSET';
var OUTPUT_ASSET_PATH= 'projects/YOUR_GEE_PROJECT/assets/OUTPUT_FOLDER';
// Drive folder for exports:
folder: 'YOUR_DRIVE_FOLDER'
```

Then click **Run**.

### 2. Python figures (optional)

```bash
cd code/python
pip install -r requirements.txt
```

### 3. ArcGIS analysis (optional)

In ArcGIS Pro's Python Window:
```python
exec(open(r"path/to/code/arcgis/extract_pixels.py").read())
```

---

## Documentation

- [Methodology](docs/METHODOLOGY.md) — Step-by-step methodological description (TR/EN)
- [Reproducibility guide](docs/REPRODUCIBILITY.md) — How to reproduce the results
- [Data sources](docs/DATA_SOURCES.md) — Sentinel-2, GEBCO, JRC, ESA references

---

## Citation

If you use this code or methodology, please cite:

```bibtex
@article{Danacioglu2026,
  title={Batı Karadeniz (İğneada–Karaburun) Kıyılarında Sentinel-2 ile Deniz Çayırı Haritalama},
  author={Danacıoğlu, Şevki},
  journal={Geomatik Dergisi},
  year={2026},
  note={under preparation}
}
```

GitHub also provides a **"Cite this repository"** button (powered by `CITATION.cff`).

---

## License

- **Code**: [MIT License](LICENSE) — permissive, reuse welcome with attribution
- **Documentation & figures**: [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/) — attribution required

---

## Contact

**Şevki Danacıoğlu** — sdanacioglu@gmail.com

---

**Status:** Pre-publication / active development. Repository will be made **public upon journal acceptance**.
