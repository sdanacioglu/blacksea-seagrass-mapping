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
| GEBCO 2023 (community asset) | Bathymetry mask | ~450 m |
| JRC Global Surface Water | Land/water mask | ~30 m |
| User-drawn training polygons | Seagrass/Sand/Deepwater | Vector |

## 3. Preprocessing pipeline (Section 2.3.1) — five sequential steps

1. **Cloud masking** — QA60 bits 10/11
2. **Hedley sunglint correction** — per-image, per-tile reference geometry
3. **Tile isolation** — Longitude-based split at ~28.30°E; per-tile Hedley + linear radiometric matching (Schott 1988 / Yang & Lo 2000 mean-std)
4. **25th percentile seasonal composite** — 1 Jul – 15 Sep 2025, cloud < 20%
5. **Turbidity mask** — TI = ρ_RED/ρ_GREEN < 1.5 (Lacaux et al. 2006)
6. **Water mask** — MNDWI > 0 (Xu 2006)

## 4. Feature stack — 11 features (Section 2.3.2)

| Category | Features |
|---|---|
| Spectral bands | B1, B2, B3, B4, B5 |
| Aquatic vegetation index | NDAVI |
| Water / masking | MNDWI, TI |
| Bathymetry | SDB (Stumpf 2003 log-ratio) |
| Dimensionality reduction | TB1, TB2 (PCA components) |

**Excluded features** (after iterative testing):
- **DII** — excluded after literature review (Kuhwald 2021; Mederos-Barrera 2022 showed it does not improve performance in turbid Case-2 waters)
- **WAVI** — correlation r ≈ 1.00 with NDAVI; redundant
- **NDRE** — lowest VIM contribution; B5 already captured spectrally; red-edge weakly penetrates the water column

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
- **Z-score normalization** + **deterministic per-block 1:1 undersampling** (coordinate-based hash key — no stochastic `bestEffort` dependency) → 2,460 balanced training pixels

## 6. Classification (Section 2.3.4)

Two classifiers compared with the same training set:

| Classifier | Parameters |
|---|---|
| Random Forest | 100 trees, √11 ≈ 3 vars/split, seed=42 |
| SVM (RBF) | Grid search 5×5 = 25 combinations: C ∈ {0.1, 1, 10, 100, 1000}, γ ∈ {0.0001, 0.001, 0.01, 0.1, 1}; **best: C\*=10, γ\*=0.1** |

## 7. Accuracy assessment (Section 2.3.5)

- **3-fold spatial CV** (validation block rotation: G/O/K)
- **Metrics**: Overall Accuracy (OA), Cohen's Kappa (κ), Producer's/User's Accuracy
- **Variable Importance Measure** (RF, Gini decrease)
- **Landis & Koch (1977) interpretive bands** for κ

## 8. Post-classification (Section 2.3.6)

1. **Minimum mapping unit filter** — 4 pixels (≥ 400 m²) connected pixel filter
2. **Biophysical mask**:
   - GEBCO depth ≤ 15 m (Traganos & Reinartz 2018)
   - JRC-based coastal distance ≤ 3 km (Roelfsema et al. 2014)
3. **RF ∩ SVM intersection map** — high-confidence product: pixels classified as seagrass by **both** classifiers; primary thematic map = SVM

---

# Metodoloji — Karadeniz Deniz Çayırı Haritalama

İşlem hattının adım adım açıklaması.

---

## 1. Çalışma alanı

- **Coğrafi kapsam**: Batı Karadeniz, İğneada (41,996°K) ile Karaburun (41,342°K) arasında
- **Boylamsal kapsam**: 27,977°–28,785°D
- **Toplam alan**: ~1.133,51 km² (kıyı uzunluğu ~130 km)
- **Paftalar**: Sentinel-2 MGRS T35TLG (batı) + T35TMG (doğu)
- **Su sınıfı**: Durum-2 (optik olarak karmaşık, orta-yüksek bulanıklık)

## 2. Veri kaynakları

| Kaynak | Kullanım | Çözünürlük |
|---|---|---|
| Sentinel-2 L2A SR_HARMONIZED | Yüzey yansıtımı | 10 m |
| GEBCO 2023 (topluluk varlığı) | Batimetri maskesi | ~450 m |
| JRC Küresel Yüzey Suyu | Kara/su maskesi | ~30 m |
| Kullanıcı tarafından çizilen eğitim poligonları | Deniz çayırı/Kum/Derin su | Vektör |

## 3. Ön işleme hattı — altı ardışık adım

1. **Bulut maskeleme** — QA60 bit 10/11
2. **Hedley güneş parıltısı düzeltmesi** — görüntü ve pafta bazında referans geometrisi
3. **Pafta ayrımı** — ~28,30°D boylamında bölme; pafta bazında Hedley + doğrusal radyometrik eşleştirme (Schott 1988 / Yang ve Lo 2000 ortalama-standart sapma)
4. **%25 persentil mevsimsel bileşik** — 1 Temmuz – 15 Eylül 2025, bulut < %20
5. **Bulanıklık maskesi** — TI = ρ_KIRMIZI/ρ_YEŞİL < 1,5 (Lacaux vd., 2006)
6. **Su maskesi** — MNDWI > 0 (Xu, 2006)

## 4. Öznitelik yığını — 11 öznitelik

| Kategori | Öznitelikler |
|---|---|
| Spektral bantlar | B1, B2, B3, B4, B5 |
| Su bitki örtüsü indeksi | NDAVI |
| Su / maskeleme | MNDWI, TI |
| Batimetri | SDB (Stumpf 2003 log-oran) |
| Boyut indirgeme | TB1, TB2 (TBA bileşenleri) |

**Çıkarılan öznitelikler** (yinelemeli test sonrası):
- **DII** — literatür incelemesi sonrası çıkarılmıştır (Kuhwald 2021; Mederos-Barrera 2022: bulanık Durum-2 sularında performansı artırmadığı belirlenmiştir)
- **WAVI** — NDAVI ile korelasyon r ≈ 1,00; gereksiz
- **NDRE** — en düşük değişken önem katkısı; B5 spektral olarak zaten mevcut; kırmızı kenar su kolonuna zayıf nüfuz etmektedir

## 5. Eğitim verisi

- **174 poligon** (ArcGIS Pro'da görsel yorumlama ile oluşturulmuştur)
  - 71 Deniz çayırı
  - 51 Kum
  - 52 Derin su
- **5 m negatif tampon** (Schütt 2025 karışık piksel filtresi)
- Mekânsal çapraz doğrulama için **3 enlemsel blok**:
  - **Blok K** (Kuzey, 41,778°–41,996°K): Beğendik, İğneada
  - **Blok O** (Orta, 41,560°–41,778°K): Kıyıköy
  - **Blok G** (Güney, 41,342°–41,560°K): Yalıköy, Karaburun
- **Z-skoru normalizasyonu** + **deterministik blok bazlı 1:1 alt örnekleme** (koordinat tabanlı anahtar — stokastik `bestEffort` bağımlılığı bulunmamaktadır) → 2.460 dengeli eğitim pikseli

## 6. Sınıflandırma

Aynı eğitim seti ile iki sınıflandırıcı karşılaştırılmıştır:

| Sınıflandırıcı | Parametreler |
|---|---|
| Rastgele Orman (RO) | 100 ağaç, √11 ≈ 3 değişken/bölünme, seed=42 |
| DVM (RBF) | Izgara araması 5×5 = 25 kombinasyon: C ∈ {0,1; 1; 10; 100; 1000}, γ ∈ {0,0001; 0,001; 0,01; 0,1; 1}; **en iyi: C\*=10, γ\*=0,1** |

## 7. Doğruluk değerlendirmesi

- **3 katlı mekânsal çapraz doğrulama** (doğrulama bloğu rotasyonu: G/O/K)
- **Metrikler**: Genel Doğruluk (GD), Cohen's Kappa (κ), Üretici Doğruluğu (ÜD) / Kullanıcı Doğruluğu (KD)
- **Değişken Önem Ölçüsü** (RO, Gini azalması)
- κ için **Landis ve Koch (1977) yorumlama bantları**

## 8. Sınıflandırma sonrası

1. **Minimum haritalama birimi filtresi** — 4 piksel (≥ 400 m²) bağlantılı piksel filtresi
2. **Biyofiziksel maske**:
   - GEBCO derinlik ≤ 15 m (Traganos ve Reinartz, 2018)
   - JRC tabanlı kıyı mesafesi ≤ 3 km (Roelfsema vd., 2014)
3. **RO ∩ DVM kesişim haritası** — yüksek güvenilirlikli ürün: her iki sınıflandırıcı tarafından da deniz çayırı olarak sınıflandırılan pikseller; birincil tematik harita = DVM

---

For full code see [`code/gee/seagrass_mapping_v9.js`](../code/gee/seagrass_mapping_v9.js).
