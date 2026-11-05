# PCA and autoencoder image-compression demo

An illustrative recitation demonstration for TAs, using eight selected dog, cat, apple, and orange photos. There are no student coding tasks. The main notebook has one collapsed launch cell and formulas for PCA projection, reconstruction, and the outer-product formulation.

## Open in your browser

[Open the live PCA vs. Autoencoder demo](https://codey-m.github.io/deep_learning/demos/pca_autoencoder/pca_autoencoder_demo.html). It runs directly in your browser, with no notebook runtime, installation, or download needed.

## Open in Colab

1. [Download the lightweight demo ZIP](https://raw.githubusercontent.com/codey-m/deep_learning/main/demos/pca_autoencoder/PCA_Autoencoder_Demo.zip).
2. [Open the notebook in Colab](https://colab.research.google.com/github/codey-m/deep_learning/blob/main/demos/pca_autoencoder/PCA_Autoencoder_Demo.ipynb).
3. Run **Open comparison**. If prompted, upload the downloaded ZIP so the notebook can load its companion HTML file.

The presentation uses saved model results. It needs no GPU, model download, or package installation in Colab. The setup cell is configured to collapse in Colab and JupyterLab; other notebook viewers may show it differently.

For local use, unzip the package, keep the notebook and HTML file together, and run the notebook. Or open `pca_autoencoder_demo.html` directly in a browser for the same offline comparison.

## Demonstration controls

Switch photos with the thumbnail buttons. The matched-byte-budget view pairs 64, 128, and 1,024 float32 PCA coefficients with 1,024 autoencoder values stored at 2, 4, and 32 bits. Both methods receive the same 256-, 512-, or 4,096-byte per-image payload.

The precision view keeps both representations at 1,024 values and changes both through 2, 4, and 32 bits. Compare four-bit storage with float32 before showing two-bit storage. The model's latent shapes and shared reconstruction costs are printed separately from the per-image payloads.

## Sources and scope

Photo credits and crop/resize notices are in [CREDITS.md](CREDITS.md) and in the comparison. All selected photos are recorded as CC BY 2.0 in Open Images metadata. TAESD model details and the pinned revision are in [provenance.json](provenance.json), with its [MIT license](TAESD_LICENSE.txt). [results.csv](results.csv) contains the underlying numerical results.

PCA was fitted on 2,048 separate Open Images photos; another 128 calibrated quantization ranges. The eight display source IDs were excluded from both collections. TAESD uses pretrained weights with a different training history. These are illustrative comparisons of these fitted models, rather than an experiment isolating architecture. Original TAESD training overlap with public images was not audited.

The notebook, control states, payload lengths, and numerical results passed local checks and independent review. A real Colab session, final visual rendering, and screen-reader behavior have not been verified. The larger model-code reference and fitted model assets are outside this lightweight TA delivery.
