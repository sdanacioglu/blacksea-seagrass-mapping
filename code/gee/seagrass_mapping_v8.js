// ==============================================================================
// BATI KARADENİZ (İĞNEADA-KIYIKÖY) KIYILARINDA DENİZ ÇAYIRI HARİTALAMA
// v8.0 - NDRE + WAVI + GBM KALDIRILDI; RF/SVM İKİLİ KARŞILAŞTIRMA
// ------------------------------------------------------------------------------
// v7'den v8'e temel değişiklikler:
//   (1) GBM (Gradient Boosting Machine) sınıflandırıcısı KALDIRILDI.
//       → Çalışma RF (RO) ve SVM (DVM) ikili karşılaştırmasına indirgendi.
//   (2) NDRE öznitelik setinden KALDIRILDI (ön analizde en düşük katkı; B5'in
//       Case-2 sularda sınırlı nüfuzu + NDAVI ile yüksek korelasyon).
//   (3) WAVI öznitelik setinden KALDIRILDI (NDAVI ile r≈1,00 fonksiyonel özdeşlik;
//       L=0,5 ayarlama terimi sığ deniz koşullarında pratik fark üretmiyor).
//       → 13 → 11 öznitelik. RF variablesPerSplit: √11 ≈ 3.
//   (4) Çoğunluk uzlaşması (3-model) yerine 2-model KESİŞİM (yüksek-güven)
//       haritası: yalnızca RF ve SVM birlikte deniz çayırı dediğinde işaretlenir.
//   (5) DII öznitelikleri v7'de zaten kaldırılmıştı (Yol B kararı — korunuyor).
//   * Tile izolasyonu (Hedley güneş parlaması, tile-bağımsız) v7'den korunuyor.
// ------------------------------------------------------------------------------
// Çalışma alanı sınırları (STUDY_AREA_ASSET'inden):
//   Kuzey: 41,996°K  (İğneada, Kırklareli)
//   Güney: 41,342°K  (Karaburun-Yeniköy, Arnavutköy/İstanbul)
//   Batı:  27,977°D
//   Doğu:  28,785°D
//   Toplam alan: 1.133,51 km² (kıyı uzunluğu ~130 km)
// ==============================================================================

[FILE_TOO_LARGE_TO_INLINE_SEE_BELOW]