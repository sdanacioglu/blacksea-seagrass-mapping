"""
Figure 5: Confusion matrices for RF, SVM, GBM (3-fold spatial CV combined).
3 side-by-side panels, normalized heatmap.
Output: figure_5_confusion_matrices.png (300 DPI)

Replace `cm_*` matrices with your own confusion matrices from GEE console.
"""
import matplotlib.pyplot as plt
import numpy as np

# Combined CV confusion matrices (sum of G + O + K fold matrices)
# Rows: true class | Cols: predicted | 0 = Non-seagrass, 1 = Seagrass
cm_rf  = np.array([[1019, 211], [300, 930]])
cm_svm = np.array([[1145,  85], [303, 927]])
cm_gbm = np.array([[1065, 165], [306, 924]])

def normalize_cm(cm):
    return cm.astype(float) / cm.sum(axis=1, keepdims=True) * 100

cm_rf_n, cm_svm_n, cm_gbm_n = map(normalize_cm, [cm_rf, cm_svm, cm_gbm])

labels = ['Non-seagrass', 'Seagrass']

fig, axes = plt.subplots(1, 3, figsize=(15, 5.2), dpi=300)

titles = [
    '(a) Random Forest (RF)\nκ = 0.665   OA = 83.3%',
    '(b) Support Vector Machine (SVM)\nκ = 0.717   OA = 85.9%',
    '(c) Gradient Boosting (GBM)\nκ = 0.662   OA = 83.1%'
]

for ax, cm, cm_n, title in zip(
    axes, [cm_rf, cm_svm, cm_gbm], [cm_rf_n, cm_svm_n, cm_gbm_n], titles
):
    im = ax.imshow(cm_n, cmap='Blues', vmin=0, vmax=100)

    for i in range(2):
        for j in range(2):
            text = f'{int(cm[i,j])}\n({cm_n[i,j]:.1f}%)'
            color = 'white' if cm_n[i,j] > 55 else 'black'
            ax.text(j, i, text, ha='center', va='center',
                    fontsize=12, color=color, family='Cambria', fontweight='bold')

    ax.set_xticks([0, 1])
    ax.set_yticks([0, 1])
    ax.set_xticklabels(labels, fontsize=10, family='Cambria')
    ax.set_yticklabels(labels, fontsize=10, family='Cambria')
    ax.set_xlabel('Predicted class', fontsize=11, family='Cambria')
    if ax == axes[0]:
        ax.set_ylabel('True class', fontsize=11, family='Cambria')
    ax.set_title(title, fontsize=10.5, family='Cambria', pad=10)

    for spine in ax.spines.values():
        spine.set_visible(True)
        spine.set_linewidth(0.8)

cbar_ax = fig.add_axes([0.92, 0.18, 0.012, 0.62])
cbar = fig.colorbar(im, cax=cbar_ax)
cbar.set_label('Class accuracy (%)', fontsize=10, family='Cambria')

plt.subplots_adjust(left=0.06, right=0.90, top=0.88, bottom=0.12, wspace=0.25)
plt.savefig('figure_5_confusion_matrices.png', dpi=300, bbox_inches='tight', facecolor='white')
plt.close()
print('Figure 5 saved: figure_5_confusion_matrices.png')
