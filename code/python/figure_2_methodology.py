"""
Figure 2: Methodology flow diagram (matplotlib).
4 main stages + sub-boxes + arrows.
Output: figure_2_methodology.png (300 DPI, PNG)
"""
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

# Page setup
fig, ax = plt.subplots(figsize=(16, 11), dpi=300)
ax.set_xlim(0, 100)
ax.set_ylim(0, 100)
ax.axis('off')

# Colors
COL_HEADER = '#1f4e79'
COL_BOX    = '#dae3f3'
COL_DATA   = '#fff2cc'
COL_OUTPUT = '#c5e0b4'
COL_TEXT   = '#000000'
COL_BORDER = '#2e75b6'
FONT = 'Cambria'

def main_header(x, y, w, h, label):
    box = FancyBboxPatch((x, y), w, h,
                          boxstyle="round,pad=0.15,rounding_size=0.6",
                          linewidth=1.5, edgecolor=COL_HEADER, facecolor=COL_HEADER)
    ax.add_patch(box)
    ax.text(x + w/2, y + h/2, label, ha='center', va='center',
            fontsize=11, fontweight='bold', color='white', family=FONT)

def sub_box(x, y, w, h, label, color=COL_BOX):
    box = FancyBboxPatch((x, y), w, h,
                          boxstyle="round,pad=0.1,rounding_size=0.4",
                          linewidth=1, edgecolor=COL_BORDER, facecolor=color)
    ax.add_patch(box)
    ax.text(x + w/2, y + h/2, label, ha='center', va='center',
            fontsize=8.5, color=COL_TEXT, family=FONT, wrap=True)

def arrow_v(x, y1, y2, color=COL_HEADER):
    a = FancyArrowPatch((x, y1), (x, y2), arrowstyle='-|>',
                         mutation_scale=15, linewidth=1.3, color=color)
    ax.add_patch(a)

def arrow_h(x1, x2, y, color=COL_HEADER):
    a = FancyArrowPatch((x1, y), (x2, y), arrowstyle='-|>',
                         mutation_scale=15, linewidth=1.3, color=color)
    ax.add_patch(a)

# Input
sub_box(35, 91, 30, 5,
        'Sentinel-2 L2A Collection\n(1 Jul - 15 Sep 2025, cloud < 20%, ~93 images)',
        color=COL_DATA)
arrow_v(50, 91, 87)

# Stage 1 - Preprocessing
main_header(5, 82, 90, 5, '1. PREPROCESSING')
sub_box(7,  73, 16, 6, 'Cloud Mask\n(QA60 bits 10/11)')
sub_box(25, 73, 16, 6, 'Sunglint Correction\n(Hedley, per-tile)')
sub_box(43, 73, 16, 6, 'Linear Radiometric\nMatching (Schott-Yang)')
sub_box(61, 73, 16, 6, '25th Percentile\nSeasonal Composite')
sub_box(79, 73, 16, 6, 'Water + Turbidity\n(MNDWI>0, TI<1.5)')
for x in [23, 41, 59, 77]:
    arrow_h(x, x + 2, 76)
arrow_v(50, 73, 68)

# Stage 2 - Feature stack
main_header(5, 62, 90, 5, '2. FEATURE STACK (13 features)')
sub_box(7,  53, 20, 7, 'Spectral Bands\nB1, B2, B3, B4, B5')
sub_box(29, 53, 20, 7, 'Aquatic Vegetation\nNDAVI, WAVI, NDRE')
sub_box(51, 53, 20, 7, 'Water & Turbidity\nMNDWI, TI')
sub_box(73, 53, 22, 7, 'Bathymetry + PCA\nSDB, TB1, TB2')
sub_box(35, 45, 30, 5, '13 features (Table 2)', color=COL_DATA)
arrow_v(17, 53, 50); arrow_v(39, 53, 50)
arrow_v(61, 53, 50); arrow_v(84, 53, 50)
arrow_v(50, 45, 41)

# Stage 3 - Training + Classification
main_header(5, 35, 90, 5, '3. TRAINING DATA & CLASSIFICATION')
sub_box(7, 25, 30, 8,
        'Visual Interpretation\nPolygon Samples\n(seagrass / sand / deep water)')
sub_box(7, 18, 30, 6, '-5 m Negative Buffer\n(mixed-pixel filter)')
arrow_v(22, 25, 24)
sub_box(40, 25, 17, 8,
        'Random Forest\n100 trees, vps=4', color=COL_BOX)
sub_box(59, 25, 17, 8,
        'SVM (RBF)\nC, gamma grid 5x5', color=COL_BOX)
sub_box(78, 25, 17, 8,
        'GBM\n150 trees, sh=0.05', color=COL_BOX)
arrow_h(37, 40, 29); arrow_h(57, 59, 29); arrow_h(76, 78, 29)
arrow_v(50, 18, 14)

# Stage 4 - Accuracy + Post
main_header(5, 8, 90, 5, '4. ACCURACY ASSESSMENT & POST-PROCESSING')
sub_box(5,   0.5, 22, 6, '3-fold Spatial CV\n(K / O / G blocks)')
sub_box(28,  0.5, 22, 6, 'Confusion Matrix:\nOA, Kappa, F1')
sub_box(51,  0.5, 22, 6, 'Biophysical Mask\n(GEBCO + JRC)')
sub_box(74,  0.5, 22, 6,
        'Final Seagrass Map\n+ Majority Consensus', color=COL_OUTPUT)
arrow_h(27, 28, 3.5); arrow_h(50, 51, 3.5); arrow_h(73, 74, 3.5)

# Caption
ax.text(2, 99,
        'Figure 2. Methodological workflow (preprocessing chain, feature engineering, '
        'classification, accuracy assessment).',
        fontsize=9, family=FONT, color='#444444', va='top')

plt.subplots_adjust(left=0.01, right=0.99, top=0.99, bottom=0.01)
plt.savefig('figure_2_methodology.png', dpi=300, bbox_inches='tight', facecolor='white')
plt.close()
print('Figure 2 saved: figure_2_methodology.png')
