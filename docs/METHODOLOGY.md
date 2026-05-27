# Methodology — Black Sea Seagrass Mapping

Step-by-step description of the processing pipeline (TR/EN summary).

---

## 1. Study area

- **Geographic extent**: Western Black Sea, between İğneada (41.996°N) and Karaburun (41.342°N)
- **Longitudinal extent**: 27.977°–28.785°E
- **Total area**: ~1,133.51 km² (coastal length ~130 km)
- **Tiles**: Sentinel-2 MGRS T35TLG (west) + T35TMG (east)
- **Water class**: Case-2 (optically complex, moderate-to-high turbidity)

## 2. Data sources

| Source | Use | Resolution |
|---|---|---|
| Sentinel-2 L2A SR_HARMONIZED | Surface reflectance | 10 m |
| GEBCO 2023 (via ETOPO1) | Bathymetry mask | ~1.8 km |
| JRC Global Surface Water | Land/water mask | ~30 m |
| User-drawn training polygons | Seagrass/Sand/Deepwater | Vector |

## 3. Preprocessing pipeline (Section 2.3.1)

1. **Cloud masking** — QA60 bits 10/11
2. **Hedley sunglint correction** — per-image, per-tile reference geometry
3. **Tile isolation** — Longitude-based split at ~28.30°E
4. **Linear radiometric matching** — Schott 1988 / Yang & Lo 2000 mean-std matching
5. **25th percentile seasonal composite** — 1 Jul – 15 Sep 2025, cloud < 20%
6. **Turbidity mask** — TI = ρ_RED/ρ_GREEN < 1.5 (Lacaux et al. 2006)
7. **Water mask** — MNDWI > 0 (Xu 2006)

## 4. Feature stack — 13 features (Section 2.3.2)

| Category | Features |
|---|---|
| Spectral bands | B1, B2, B3, B4, B5 |
| Aquatic vegetation indices | NDAVI, WAVI |
| Water/masking | MNDWI, TI |
| Bathymetry | SDB (Stumpf 2003 log-ratio) |
| Dimensionality reduction | TB1, TB2 (PCA components) |
| Red-edge | NDRE (B8−B5)/(B8+B5) |

**Note**: DII (Depth Invariant Index) was excluded after literature review (Kuhwald 2021; Mederos-Barrera 2022 showed it does not improve performance in turbid Case-2 waters).

## 5. Training data (Section 2.3.3)

- **174 polygons** (visually interpreted in ArcGIS Pro)
  - 71 Seagrass
  - 51 Sand
  - 52 Deep water
- **5 m negative buffer** (Schütt 2025 mixed-pixel filter)
- **3 latitudinal blocks** for spatial CV:
  - **Block K** (North, 41.778°–41.996°): Beğendik, İğneada
  - **Block O** (Middle, 41.560°–41.778°): Kıyıköy
  - **Block G** (South, 41.342°–41.560°): Yalıköy, Karaburun
- **Z-score normalization** + per-block 1:1 undersampling → 2,460 balanced training pixels

## 6. Classification (Section 2.3.4)

Three classifiers compared with the same training set:

| Classifier | Parameters |
|---|---|
| Random Forest | 100 trees, √13 ≈ 4 vars/split, seed=42 |
| SVM (RBF) | Grid search 5×5: C ∈ {0.1, 1, 10, 100, 1000}, γ ∈ {0.0001, 0.001, 0.01, 0.1, 1}; best: C=1, γ=0.1 |
| GBM | 150 trees, shrinkage=0.05, samplingRate=0.7, maxNodes=30, seed=42 |

## 7. Accuracy assessment (Section 2.3.5)

- **3-fold spatial CV** (validation block rotation: G/O/K)
- **Metrics**: Overall Accuracy (OA), Cohen's Kappa (κ), Producer's/User's Accuracy
- **Variable Importance Measure** (RF, Gini decrease)

## 8. Post-classification (Section 2.3.6)

1. **Minimum mapping unit filter** — 4 pixels (≥ 400 m²) connected pixel filter
2. **Biophysical mask**:
   - GEBCO depth ≤ 15 m (Traganos & Reinartz 2018)
   - JRC-based coastal distance ≤ 3 km (Roelfsema et al. 2018)
3. **Majority consensus map** — pixels classified as seagrass by ≥ 2 out of 3 models (Kuncheva 2004)

---

For full code see [`code/gee/seagrass_mapping_v7.js`](../code/gee/seagrass_mapping_v7.js).
