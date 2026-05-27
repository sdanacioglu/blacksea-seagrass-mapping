"""
Figure 6: Fold-level performance comparison (RF/SVM/GBM × G/O/K × OA/Kappa).
Two panels: (a) Overall Accuracy, (b) Cohen's Kappa.
Output: figure_6_fold_comparison.png (300 DPI)

Kappa panel includes Landis & Koch (1977) interpretation reference lines.
"""
import matplotlib.pyplot as plt
import numpy as np

folds = ['Block G\n(South — Yalıköy/Karaburun)',
         'Block O\n(Middle — Kıyıköy)',
         'Block K\n(North — Beğendik/İğneada)']

# v8 polygons + linear matching
oa_rf  = [0.690, 0.823, 0.968]
oa_svm = [0.705, 0.898, 0.973]
oa_gbm = [0.681, 0.836, 0.975]

k_rf  = [0.377, 0.688, 0.936]
k_svm = [0.411, 0.796, 0.940]
k_gbm = [0.363, 0.671, 0.916]

x = np.arange(len(folds))
width = 0.27

colors = {'RF': '#1f77b4', 'SVM': '#d62728', 'GBM': '#2ca02c'}

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(13, 5.2), dpi=300)

# Panel (a) — Overall Accuracy
for i, (vals, lbl) in enumerate([(oa_rf, 'RF'), (oa_svm, 'SVM'), (oa_gbm, 'GBM')]):
    bars = ax1.bar(x + (i-1)*width, vals, width, label=lbl,
                    color=colors[lbl], edgecolor='black', linewidth=0.5)
    for bar in bars:
        h = bar.get_height()
        ax1.text(bar.get_x() + bar.get_width()/2, h + 0.013,
                 f'{h:.2f}', ha='center', va='bottom',
                 fontsize=8.5, family='Cambria')

ax1.set_ylabel('Overall Accuracy (OA)', fontsize=11.5, family='Cambria')
ax1.set_xticks(x)
ax1.set_xticklabels(folds, fontsize=10, family='Cambria')
ax1.set_ylim(0, 1.13)
ax1.set_title('(a) Overall Accuracy', fontsize=11.5, family='Cambria', pad=8)
ax1.legend(loc='lower right', frameon=True, fontsize=10, prop={'family':'Cambria'})
ax1.grid(axis='y', linestyle='--', alpha=0.4)
ax1.set_axisbelow(True)
ax1.spines['top'].set_visible(False)
ax1.spines['right'].set_visible(False)

# Panel (b) — Kappa
for i, (vals, lbl) in enumerate([(k_rf, 'RF'), (k_svm, 'SVM'), (k_gbm, 'GBM')]):
    bars = ax2.bar(x + (i-1)*width, vals, width, label=lbl,
                    color=colors[lbl], edgecolor='black', linewidth=0.5)
    for bar in bars:
        h = bar.get_height()
        ax2.text(bar.get_x() + bar.get_width()/2, h + 0.013,
                 f'{h:.2f}', ha='center', va='bottom',
                 fontsize=8.5, family='Cambria')

ax2.set_ylabel('Cohen\'s Kappa (κ)', fontsize=11.5, family='Cambria')
ax2.set_xticks(x)
ax2.set_xticklabels(folds, fontsize=10, family='Cambria')
ax2.set_ylim(0, 1.13)
ax2.set_title('(b) Cohen\'s Kappa', fontsize=11.5, family='Cambria', pad=8)
ax2.legend(loc='lower right', frameon=True, fontsize=10, prop={'family':'Cambria'})
ax2.grid(axis='y', linestyle='--', alpha=0.4)
ax2.set_axisbelow(True)
ax2.spines['top'].set_visible(False)
ax2.spines['right'].set_visible(False)

# Landis & Koch (1977) reference lines on Kappa panel
for y_val, lab in [(0.41, 'Moderate'), (0.61, 'Substantial'), (0.81, 'Almost perfect')]:
    ax2.axhline(y=y_val, color='gray', linestyle=':', linewidth=0.8, alpha=0.65)
    ax2.text(2.50, y_val + 0.013, lab, fontsize=7.5,
             color='gray', family='Cambria', ha='right', style='italic')

plt.tight_layout()
plt.savefig('figure_6_fold_comparison.png', dpi=300, bbox_inches='tight', facecolor='white')
plt.close()
print('Figure 6 saved: figure_6_fold_comparison.png')
