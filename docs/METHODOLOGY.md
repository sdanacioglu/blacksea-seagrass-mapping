# Methodology — Black Sea Seagrass Mapping

Step-by-step description of the processing pipeline (EN/TR summary). Section numbers refer to the manuscript.

---

## 1. Study area (Section 2.1)

- **Geographic extent**: Western Black Sea coast of Türkiye, between Beğendik/İğneada (41.996°N) and Karaburun (41.342°N)
- **Longitudinal extent**: 27.977°–28.785°E
- **Total area**: ~1,133.51 km² (coastline length ~130 km)
- **Tiles**: four Sentinel-2 MGRS tiles — T35TNF/T35TNG (west, 62 images) and T35TPF/T35TPG (east, 93 images)
- **Water class**: Case-2 (optically complex), Case-3 in river plume zones

## 2. Data sources (Section 2.2)

| Source | Use | Resolution |
|---|---|---|
| Sentinel-2 L2A SR_HARMONIZED | Surface reflectance | 10 m analysis grid (B1 60 m and B5/B11 20 m resampled by GEE default nearest neighbour) |
| JRC Global Surface Water | Land mask for the coastal-distance mask | ~30 m |
| User-drawn training polygons | Seagrass / sand / deep water | Vector ([`data/training_polygons.geojson`](../data/training_polygons.geojson)) |

No bathymetric dataset is used: the ETOPO1/GEBCO depth mask of earlier versions was removed in v9.

## 3. Pre-processing (Section 2.3.1) — six sequential steps

1. **Cloud masking** — scene-level pre-filter (cloud cover < 20%), then pixel-level QA60 bits 10/11
2. **Sun glint correction** (Hedley et al., 2005) — per image and per tile half; deep water pixels = MNDWI > 0.5; NIR reference = 5th percentile; images with fewer than 100 deep water pixels are left uncorrected
3. **25th percentile seasonal composite** — 1 Jul – 15 Sep 2025
4. **Linear radiometric normalisation** — western composite matched to the eastern composite (mean / standard deviation in the overlap zone; Schott et al., 1988; Yang & Lo, 2000)
5. **Turbidity mask** — TI = ρ_RED / ρ_GREEN < 1.5 (Lacaux et al., 2006)
6. **Water mask** — MNDWI > 0 (Xu, 2006)

## 4. Feature stack — 11 features (Section 2.3.2)

| Category | Features |
|---|---|
| Spectral bands | B1, B2, B3, B4, B5 |
| Aquatic vegetation index | NDAVI |
| Water / masking | MNDWI |
| Water quality | TI |
| Bathymetry | SDB (Stumpf et al., 2003 log-ratio, uncalibrated) |
| Dimensionality reduction | TB1, TB2 (principal components over B1–B5) |

**Excluded**: the Depth Invariant Index (DII), which does not improve classification in turbid Case-2 waters (Kuhwald et al., 2021; Mederos-Barrera et al., 2022).

## 5. Training data (Section 2.3.3)

- **174 polygons** from visual interpretation (no field data): 71 seagrass, 51 sand, 52 deep water
- **Interpretation sources**: Esri World Imagery basemap (Vantor Vivid, WorldView-2/3, 0.3–0.5 m), Sentinel-2 composite band combinations, NDAVI (visual aid only, no threshold) and the field-verified *Zostera* polygons of the adjacent Bulgarian coast (Berov et al., 2022) as an interpretation key
- **5 m negative buffer** on polygons (mixed-pixel filter; implementation detail of the script)
- **Three latitudinal blocks** for spatial cross-validation (polygons assigned by centroid latitude; script codes in brackets):
  - **Block N** [K] (north of 41.780°N): Beğendik, İğneada
  - **Block C** [O] (41.561°–41.780°N): Kıyıköy
  - **Block S** [G] (south of 41.561°N): Yalıköy, Karaburun
- **Z-score normalisation** and **per-block 1:1 undersampling** with a coordinate-based key → **2,460 balanced pixels** (1,230 seagrass + 1,230 non-seagrass; N 203 + 203, C 608 + 608, S 419 + 419)
- Classification is **binary** (seagrass / non-seagrass); sand and deep water are merged at the classification stage

## 6. Classification (Section 2.3.4)

| Classifier | Parameters |
|---|---|
| Random Forest | 100 trees, √11 ≈ 3 variables per split, seed = 42 |
| SVM (RBF) | Grid search 5 × 5 = 25 combinations: C ∈ {0.1, 1, 10, 100, 1000}, γ ∈ {0.0001, 0.001, 0.01, 0.1, 1}; **best: C\* = 10, γ\* = 0.1** |

**RF sensitivity test**: 20 combinations of trees (50, 100, 200, 300, 500) × variables per split (2, 3, 4, 6) under the same 3-fold spatial CV gave mean OA 82.0–83.2% (κ 0.639–0.664); RF is largely insensitive to both parameters and the 100 / 3 configuration was retained.

## 7. Accuracy assessment (Section 2.3.5)

- **3-fold spatial cross-validation** (each block serves once as the validation set)
- **Metrics**: overall accuracy (OA), Cohen's kappa (κ), producer's / user's accuracy, F1
- **Variable importance** (RF, Gini decrease)

## 8. Post-classification (Section 2.3.5)

1. **Minimum mapping unit** — connected patches of fewer than 5 pixels removed (MMU = 5 pixels, 500 m²; Deeks et al., 2024)
2. **Biophysical mask** — coastal-distance mask from the JRC land mask, **effective distance ≈ 1 km** (see the note in the script, Section 19b). No depth mask.
3. **RF ∩ SVM agreement map** — pixels classified as seagrass by both classifiers. It expresses agreement between the models, not verified accuracy.

## 9. Results (Section 3)

| Product | Area |
|---|---|
| SVM | 3,634 ha |
| RF | 3,509 ha |
| RF ∩ SVM (agreement) | 2,991 ha |

In the absence of field validation these areas are **potential seagrass habitat and an upper-bound estimate**.

---

# Metodoloji — Karadeniz Deniz Çayırı Haritalama

İşlem hattının adım adım açıklaması. Bölüm numaraları makaleye göredir.

---

## 1. Çalışma alanı

- **Coğrafi kapsam**: Türkiye'nin batı Karadeniz kıyısı, Beğendik/İğneada (41,996°K) ile Karaburun (41,342°K) arası
- **Boylamsal kapsam**: 27,977°–28,785°D
- **Toplam alan**: ~1.133,51 km² (kıyı uzunluğu ~130 km)
- **Paftalar**: dört Sentinel-2 MGRS paftası — T35TNF/T35TNG (batı, 62 görüntü) ve T35TPF/T35TPG (doğu, 93 görüntü)
- **Su sınıfı**: Durum-2 (optik olarak karmaşık), akarsu ağızlarında Durum-3

## 2. Veri kaynakları

| Kaynak | Kullanım | Çözünürlük |
|---|---|---|
| Sentinel-2 L2A SR_HARMONIZED | Yüzey yansıtımı | 10 m analiz ızgarası (B1 60 m ve B5/B11 20 m, GEE varsayılan en yakın komşu yeniden örneklemesi) |
| JRC Küresel Yüzey Suyu | Kıyı mesafesi maskesi için kara maskesi | ~30 m |
| Eğitim poligonları | Deniz çayırı / kum / derin su | Vektör ([`data/training_polygons.geojson`](../data/training_polygons.geojson)) |

Batimetri verisi kullanılmamaktadır: önceki sürümlerdeki ETOPO1/GEBCO derinlik maskesi v9'da kaldırılmıştır.

## 3. Ön işleme — altı ardışık adım

1. **Bulut maskeleme** — sahne düzeyinde ön filtre (bulut < %20), ardından piksel düzeyinde QA60 bit 10/11
2. **Güneş parlaması düzeltmesi** (Hedley vd., 2005) — görüntü ve pafta yarısı bazında; derin su pikselleri = MNDWI > 0,5; NIR referansı = 5. persentil; 100'den az derin su pikseli içeren görüntüler düzeltilmeden bırakılır
3. **25. persentil mevsimsel kompozit** — 1 Temmuz – 15 Eylül 2025
4. **Doğrusal radyometrik normalizasyon** — batı kompoziti doğu kompozitine eşlenir (Schott vd., 1988; Yang ve Lo, 2000)
5. **Bulanıklık maskesi** — TI = ρ_KIRMIZI / ρ_YEŞİL < 1,5 (Lacaux vd., 2006)
6. **Su maskesi** — MNDWI > 0 (Xu, 2006)

## 4. Öznitelik yığını — 11 öznitelik

| Kategori | Öznitelikler |
|---|---|
| Spektral bantlar | B1, B2, B3, B4, B5 |
| Su bitki örtüsü indeksi | NDAVI |
| Su / maskeleme | MNDWI |
| Su kalitesi | TI |
| Batimetri | SDB (Stumpf vd., 2003 log-oran, kalibre edilmemiş) |
| Boyut indirgeme | TB1, TB2 (B1–B5 üzerinden temel bileşenler) |

**Çıkarılan**: Derinlikten Bağımsız İndeks (DII); bulanık Durum-2 sularında sınıflandırmayı iyileştirmemektedir (Kuhwald vd., 2021; Mederos-Barrera vd., 2022).

## 5. Eğitim verisi

- Görsel yorumlamayla **174 poligon** (arazi verisi yoktur): 71 deniz çayırı, 51 kum, 52 derin su
- **Yorumlama kaynakları**: Esri World Imagery altlığı (Vantor Vivid, WorldView-2/3, 0,3–0,5 m), Sentinel-2 kompozit bant kombinasyonları, NDAVI (yalnızca görsel yardımcı, eşik uygulanmamıştır) ve yorumlama anahtarı olarak komşu Bulgaristan kıyısının arazi doğrulamalı *Zostera* poligonları (Berov vd., 2022)
- Poligonlara **5 m negatif tampon** (karışık piksel filtresi; betiğin uygulama ayrıntısı)
- Mekânsal çapraz doğrulama için **üç enlemsel blok** (poligonlar merkez enlemine göre atanır; betikteki kodlar köşeli parantezde):
  - **Blok N** [K] (41,780°K'nın kuzeyi): Beğendik, İğneada
  - **Blok C** [O] (41,561°–41,780°K): Kıyıköy
  - **Blok S** [G] (41,561°K'nın güneyi): Yalıköy, Karaburun
- **Z-skoru normalizasyonu** ve koordinat tabanlı anahtarla **blok bazlı 1:1 alt örnekleme** → **2.460 dengeli piksel** (1.230 deniz çayırı + 1.230 deniz çayırı dışı; N 203 + 203, C 608 + 608, S 419 + 419)
- Sınıflandırma **ikilidir** (deniz çayırı / deniz çayırı dışı); kum ve derin su sınıflandırma aşamasında birleştirilir

## 6. Sınıflandırma

| Sınıflandırıcı | Parametreler |
|---|---|
| Rastgele Orman (RO) | 100 ağaç, √11 ≈ 3 değişken/bölünme, seed = 42 |
| DVM (RBF) | Izgara araması 5 × 5 = 25 kombinasyon: C ∈ {0,1; 1; 10; 100; 1000}, γ ∈ {0,0001; 0,001; 0,01; 0,1; 1}; **en iyi: C\* = 10, γ\* = 0,1** |

**RO duyarlılık testi**: ağaç sayısı (50, 100, 200, 300, 500) × bölünme başına değişken (2, 3, 4, 6) için 20 kombinasyon aynı 3 katlı mekânsal çapraz doğrulamayla denenmiş, ortalama GD %82,0–83,2 (κ 0,639–0,664) bulunmuştur; RO her iki parametreye de büyük ölçüde duyarsızdır ve 100 / 3 ayarı korunmuştur.

## 7. Doğruluk değerlendirmesi

- **3 katlı mekânsal çapraz doğrulama** (her blok bir kez doğrulama kümesi olur)
- **Metrikler**: genel doğruluk (GD), Cohen's kappa (κ), üretici / kullanıcı doğruluğu, F1
- **Değişken önemi** (RO, Gini azalması)

## 8. Sınıflandırma sonrası

1. **Minimum haritalama birimi** — 5 pikselden küçük bağlantılı yamalar elenir (5 piksel, 500 m²; Deeks vd., 2024)
2. **Biyofiziksel maske** — JRC kara maskesinden kıyı mesafesi maskesi, **etkin mesafe ≈ 1 km** (betikte Bölüm 19b'deki nota bakınız). Derinlik maskesi yoktur.
3. **RO ∩ DVM uyum haritası** — her iki sınıflandırıcının da deniz çayırı olarak sınıflandırdığı pikseller. Modeller arası uyumu gösterir, doğrulanmış doğruluğu değil.

## 9. Sonuçlar

| Ürün | Alan |
|---|---|
| DVM | 3.634 ha |
| RO | 3.509 ha |
| RO ∩ DVM (uyum) | 2.991 ha |

Arazi doğrulaması bulunmadığından bu alanlar **olası deniz çayırı habitatı ve üst sınır tahmini** olarak değerlendirilmelidir.

---

For full code see [`code/gee/seagrass_mapping_v9.js`](../code/gee/seagrass_mapping_v9.js).
