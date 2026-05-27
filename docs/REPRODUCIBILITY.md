# Reproducibility Guide

Step-by-step instructions to reproduce the published classification results.

---

## Prerequisites

1. **Google Earth Engine account** ([free signup](https://earthengine.google.com/signup/))
2. **GEE Cloud Project** with assets and storage enabled
3. (Optional) **ArcGIS Pro 3.x** for polygon-level analysis and pixel extraction

---

## Step 1 — Asset preparation

Upload the following to your GEE Cloud Project as assets:

### (a) Study area boundary
- A polygon feature collection covering the area of interest
- Suggested: a coastal polygon with ~100 m landward buffer to include intertidal pixels
- Asset path: `projects/YOUR_GEE_PROJECT/assets/STUDY_AREA_ASSET`

### (b) Training polygons
- A polygon feature collection with one **`class_code`** integer attribute:
  - `1` = Seagrass
  - `2` = Sand / bare substrate
  - `3` = Deep water
- Recommended: ≥ 50 polygons per class, distributed across latitudinal extent
- Asset path: `projects/YOUR_GEE_PROJECT/assets/TRAINING_POLYGONS_ASSET`

### (c) Output folder
- Empty asset folder for classification output rasters
- Asset path: `projects/YOUR_GEE_PROJECT/assets/OUTPUT_FOLDER`

---

## Step 2 — Configure and run the GEE pipeline

1. Open [`code/gee/seagrass_mapping_v7.js`](../code/gee/seagrass_mapping_v7.js) in the [GEE Code Editor](https://code.earthengine.google.com/)
2. Replace placeholder asset paths with your own
3. (Optional) Adjust date range, cloud threshold, or tile split longitude in Section 4 if your study area differs
4. Click **Run** — pipeline outputs will appear in the console (~3–10 min)
5. Export tasks will be queued in the **Tasks** tab — click **Run** to start exports to Google Drive

### Expected console output

- Image counts per longitudinal half (e.g., 62 west, 93 east)
- Linear matching confirmation
- Composite pixel count (~150,000)
- Polygon counts per block (G/O/K)
- Balanced sample sizes (e.g., 2,460 pixels)
- 3-fold CV results for RF, SVM (with grid search), and GBM
- Variable importance scores for RF
- Masked seagrass area estimates (m²)

---

## Step 3 — ArcGIS analysis (optional)

For polygon-level quality control and per-pixel feature extraction, two ArcGIS Pro scripts are provided:

### Polygon triage
Validates training polygons against six spectral/index criteria per class.

```python
# In ArcGIS Pro Python Window
exec(open(r"path/to/code/arcgis/polygon_triage.py").read())
```

Output: CSV with per-polygon decision (`DEFINITE` / `SUSPECT` / `REJECT` / `MISSING`).

### Pixel extraction
Extracts per-pixel feature values within each training polygon for spectral analysis.

```python
exec(open(r"path/to/code/arcgis/extract_pixels.py").read())
```

Output: CSV with all 13 feature values per pixel, joined with class labels.

---

## Expected results

| Classifier | OA | κ |
|---|---|---|
| Random Forest | 0.833 | 0.665 |
| **SVM** (C\*=1, γ\*=0.1) | **0.859** | **0.717** |
| GBM | 0.831 | 0.651 |

**Note on stochastic variation**: Due to `bestEffort=true` in z-score normalization (Section 14b), repeated runs may produce κ variation of approximately ±0.01–0.03. This is normal and does not affect overall conclusions.

---

## Troubleshooting

| Symptom | Likely cause | Solution |
|---|---|---|
| `Earth Engine memory capacity exceeded` | Per-image clip() before composite | Already handled in v7 (clip only on final composite) |
| `Computation timed out` (area calc) | Scale too fine | Already using `scale: 30` and `bestEffort: true` |
| Tile seam visible in output | Linear matching skipped | Verify Section 4b ran without error |
| Open-sea false positives | Biophysical mask not applied | Verify GEBCO + JRC datasets accessible (check Section 20b) |
