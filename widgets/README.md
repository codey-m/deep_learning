# Deep Learning widgets

The interactive widgets in the Deep Learning courses on MIT Learn. The courses load each widget from
this folder through GitHub Pages, so every link below opens the exact page learners see inside
the lesson.

## 6.7960.1x Deep Learning: Foundations

| Widget | Where | What it shows |
| --- | --- | --- |
| [Recycling Day](https://codey-m.github.io/deep_learning/widgets/widget-fit-by-hand.html) | Unit 1 overview | Sorting twelve items with a divider built from pieces |
| [Rover Route](https://codey-m.github.io/deep_learning/widgets/widget-fit-what-you-see.html) | Unit 2 overview | Plan a rover's route through nine measurements by placing up to four bends |
| [Universal approximation with ReLU units](https://codey-m.github.io/deep_learning/widgets/widget-universal-approx.html) | Unit 2, Lec. 3: Approximation, Generalization, Regularization |  |

## 6.7960.2x Deep Learning: Training, Inference & Evaluation

| Widget | Where | What it shows |
| --- | --- | --- |
| [How far a signal travels](https://codey-m.github.io/deep_learning/widgets/widget-signal-through-layers.html) | Unit 1 overview | Signal strength across a stack of layers |
| [Downhill Racer](https://codey-m.github.io/deep_learning/widgets/widget-gradient-descent.html) | Unit 1, Lec. 1: How to Train a Neural Net 1 | Gradient descent and momentum |
| [How many examples do you need?](https://codey-m.github.io/deep_learning/widgets/widget-how-many-examples.html) | Unit 2 overview | Accuracy at telling birds apart against number of labelled photos, training from scratch versus reusing a model trained on something else |
| [Photo Finish](https://codey-m.github.io/deep_learning/widgets/widget-threshold-metrics.html) | Unit 2, Lec. 5: Evaluation: IID & OOD | Moving the decision threshold |

## 6.7960.3x Deep Learning: Architectures

| Widget | Where | What it shows |
| --- | --- | --- |
| [Find the beak](https://codey-m.github.io/deep_learning/widgets/widget-find-the-beak.html) | Unit 1 overview | A small window slides across a picture of a bird to find its beak, using either a separate window for every spot or one window reused everywhere |
| [Lookout Tower](https://codey-m.github.io/deep_learning/widgets/widget-conv.html) | Unit 1, Lec. 1: Convolutional Networks for Grids | Lookout Tower: convolution and the receptive field |
| [How far can a link reach?](https://codey-m.github.io/deep_learning/widgets/widget-how-far-a-link-reaches.html) | Unit 2 overview | The link between two words in a sentence as the gap between them grows |
| [Scaled dot-product attention](https://codey-m.github.io/deep_learning/widgets/widget-attention.html) | Unit 2, Lec. 2: Transformers for Sets/Sequences |  |

## 6.7960.4x Deep Learning: Representations

| Widget | Where | What it shows |
| --- | --- | --- |
| [What the network was never told](https://codey-m.github.io/deep_learning/widgets/widget-read-what-it-knows.html) | Unit 1 overview | Ninety birds placed by each layer of a trained network, with a straight line placed to separate wings up from wings down and scored on ninety new birds |
| [Frozen probes and controls](https://codey-m.github.io/deep_learning/widgets/bridge-probe-controls.html) | Unit 1, Lec. 1: Internal Representations in Deep Nets | Computational bridge: a frozen probe with controls |
| [Echo Dancer](https://codey-m.github.io/deep_learning/widgets/widget-pca.html) | Unit 1, Lec. 2: Reconstruction-based Methods | PCA, keeping the most variance in two numbers per frame |
| [Masked reconstruction metrics](https://codey-m.github.io/deep_learning/widgets/bridge-masked-reconstruction.html) | Unit 1, Lec. 2: Reconstruction-based Methods | Computational bridge: masked reconstruction without shortcut copying |
| [Pull together, push apart](https://codey-m.github.io/deep_learning/widgets/widget-pull-and-push.html) | Unit 2 overview | Forty-five birds of three kinds pulled into flocks by forces you control |
| [Contrastive neighborhood evaluation](https://codey-m.github.io/deep_learning/widgets/bridge-contrastive-evaluation.html) | Unit 2, Lec. 3: Similarity-based Methods | Computational bridge: inspect contrastive neighborhoods |
| [Weight symmetries: the same function, different weights](https://codey-m.github.io/deep_learning/widgets/widget-weight-symmetry.html) | Unit 2, Lec. 4: Weight-space Geometry | Weight symmetries and averaging |

## 6.7960.5x Deep Learning: Generative Models

| Widget | Where | What it shows |
| --- | --- | --- |
| [Where would a new one go?](https://codey-m.github.io/deep_learning/widgets/widget-where-would-a-new-one-go.html) | Unit 1 overview | A curved flock of real birds, a round blob fitted over them, and new birds drawn from it |
| [VAE objective diagnostic practice](https://codey-m.github.io/deep_learning/widgets/practice-vae-diagnostics.html) | Unit 1, Lec. 2: VAEs/GANs | Diagnose a VAE objective |
| [GAN coverage diagnostic practice](https://codey-m.github.io/deep_learning/widgets/practice-gan-diagnostics.html) | Unit 1, Lec. 2: VAEs/GANs | Diagnose GAN coverage |
| [Next Note](https://codey-m.github.io/deep_learning/widgets/widget-one-piece-at-a-time.html) | Unit 2 overview | A sentence generated one word at a time, showing the chance of each word that could come next |
| [The diffusion forward process](https://codey-m.github.io/deep_learning/widgets/widget-diffusion.html) | Unit 2, Lec. 3: Flows and Diffusion models |  |
| [Diffusion schedule diagnostic practice](https://codey-m.github.io/deep_learning/widgets/practice-diffusion-diagnostics.html) | Unit 2, Lec. 3: Flows and Diffusion models | Audit a diffusion sampler |
| [Where does the budget go?](https://codey-m.github.io/deep_learning/widgets/widget-where-does-the-budget-go.html) | Unit 2, Lec. 5: Large Language Models | Splitting a fixed compute budget between model size and training data, with the previous budget shown for comparison |

## Review tips

- Each widget is one self-contained HTML file. It makes no network requests, so a downloaded copy works too.
- In the course each widget sits in a column about 880 pixels wide. Narrow the browser window to that width to see the layout learners get.

## How this folder works

Nothing here is edited by hand. Each widget is developed in the course repository, and that
repository's `docs/publish_widgets.py` copies it here and rewrites this README. A push to `main`
updates the live widget a minute or two later, with no course import. The repository name is part
of every widget address, so it must never change.
