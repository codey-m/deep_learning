# Deep Learning coding activities

Labs, coding practices, and final-project notebooks for the five Deep Learning courses on MIT Learn, `6.7960.1x` through `6.7960.5x`.

The labs combine implementation with controlled experiments. Short practices focus on one procedure or diagnostic. The final project asks you to design an intervention and test the evidence for it. For the course's interactive games, visual experiments, and glossaries, see the [widget catalog](widgets/README.md).

## Open a notebook

Use a notebook's **Colab** link below, then choose **File → Save a copy in Drive** to keep your own editable copy. Follow its setup cells and runtime instructions. The labs and final projects recommend a GPU runtime; the short practices use small CPU examples. Course pages contain the associated assessment and submission instructions.

Some short practices also have a **Browser** link. It runs the same task with Python in your browser, with no account or setup, and shows what your functions return. Your code stays in that page; use **Download Python** to keep a copy.

## 6.7960.1x Deep Learning: Foundations

| Activity | What you do | Run |
| --- | --- | --- |
| Lab 1: [Neural Network Foundations](M1_neural_network_foundations.ipynb) | Build a PyTorch hidden-layer stack and aggregate batch metrics, then compare network capacity and a generalization intervention on CIFAR-10. | [Colab](https://colab.research.google.com/github/codey-m/deep_learning/blob/main/M1_neural_network_foundations.ipynb) |

## 6.7960.2x Deep Learning: Training, Inference & Evaluation

| Activity | What you do | Run |
| --- | --- | --- |
| Lab 2: [Training & Transfer](M2_training_transfer.ipynb) | Implement momentum SGD, batch normalization, and a frozen-backbone transfer model. Design a classifier head to a parameter budget and compare a fine-tuning intervention. | [Colab](https://colab.research.google.com/github/codey-m/deep_learning/blob/main/M2_training_transfer.ipynb) |
| Practice: [Backprop through a tiny network](practice/m2_backprop.ipynb) | Compute a gradient through a small network, check it against finite differences and autograd, and examine a case with an inactive ReLU. | [Colab](https://colab.research.google.com/github/codey-m/deep_learning/blob/main/practice/m2_backprop.ipynb) |
| Practice: [Audit a deployment budget](practice/m2_deployment_budget.ipynb) | Calculate model storage, check storage, latency, and accuracy constraints, and make a recommendation among four model versions. | [Colab](https://colab.research.google.com/github/codey-m/deep_learning/blob/main/practice/m2_deployment_budget.ipynb) |
| Practice: [Audit calibration under shift](practice/m2_ood_audit.ipynb) | Compare calibration on two sets of predictions and choose a decision threshold that meets a recall constraint at a new site. | [Colab](https://colab.research.google.com/github/codey-m/deep_learning/blob/main/practice/m2_ood_audit.ipynb) |

## 6.7960.3x Deep Learning: Architectures

| Activity | What you do | Run |
| --- | --- | --- |
| Lab 3: [Architectures in Practice](M3_architectures_in_practice.ipynb) | Implement image patchification, scaled dot-product attention, and convolution output sizing. Compare a small CNN and Vision Transformer, then test an architectural change. | [Colab](https://colab.research.google.com/github/codey-m/deep_learning/blob/main/M3_architectures_in_practice.ipynb) |
| Practice: [Compare message-passing rules](practice/m3_message_passing.ipynb) | Implement one neighbor-aggregation step on a graph, then compare sum, mean, and including a node's own feature. The browser activity displays your returned values in the graph and includes an independent reference run. | [Browser](https://codey-m.github.io/deep_learning/practice/message_passing/) · [Colab](https://colab.research.google.com/github/codey-m/deep_learning/blob/main/practice/m3_message_passing.ipynb) |
| Practice: [Trace and diagnose RNN gradients](practice/m3_rnn_gradient.ipynb) | Trace how a change propagates through a linear recurrence and compare gradient decay and growth as its weight and sequence length change. | [Colab](https://colab.research.google.com/github/codey-m/deep_learning/blob/main/practice/m3_rnn_gradient.ipynb) |

## 6.7960.4x Deep Learning: Representations

| Activity | What you do | Run |
| --- | --- | --- |
| Lab 4: [Representation Learning](M4_representation_learning.ipynb) | Implement contrastive loss, a kNN probe, and reconstruction error. Compare autoencoder and contrastive representations, then test an augmentation choice. | [Colab](https://colab.research.google.com/github/codey-m/deep_learning/blob/main/M4_representation_learning.ipynb) |

## 6.7960.5x Deep Learning: Generative Models

| Activity | What you do | Run |
| --- | --- | --- |
| Lab 5: [Generative Modeling](M5_generative_tuning.ipynb) | Implement a beta-VAE objective, forward diffusion, and a DDIM sampling step. Compare KL-weight settings and two diffusion sampling budgets. | [Colab](https://colab.research.google.com/github/codey-m/deep_learning/blob/main/M5_generative_tuning.ipynb) |
| Practice: [Interpolate and regress a flow](practice/m5_flow_matching.ipynb) | Construct interpolated points and velocity targets for flow matching, then compare noise-to-data and related-data pairings. | [Colab](https://colab.research.google.com/github/codey-m/deep_learning/blob/main/practice/m5_flow_matching.ipynb) |
| Practice: [Stable and masked autoregressive NLL](practice/m5_ar_nll.ipynb) | Compute sequence negative log-likelihood without multiplying tiny probabilities, then average a padded batch's loss over valid target tokens. | [Colab](https://colab.research.google.com/github/codey-m/deep_learning/blob/main/practice/m5_ar_nll.ipynb) |
| Practice: [Which tokens instruction tuning supervises](practice/m5_instruction_masking.ipynb) | Build an assistant-target supervision mask, account for the next-token shift, and compare the losses produced by different masks. The browser activity lines your returned mask up under the token each position predicts and includes an independent reference run. | [Browser](https://codey-m.github.io/deep_learning/practice/instruction_masking/) · [Colab](https://colab.research.google.com/github/codey-m/deep_learning/blob/main/practice/m5_instruction_masking.ipynb) |

## Final project: choose one path

Each path supplies a model and data. You design the intervention, declare a hypothesis and a meaningful effect size before measuring, compare conditions across paired seeds, and report a claim with its evidence and limitations.

| Path | What you design and investigate | Run |
| --- | --- | --- |
| [Which labels should you audit?](final_project/FP_label_debugging.ipynb) | Rank training examples for review under a fixed audit budget. Measure both the wrong labels found and the performance of the model trained after corrections. Builds on Module 2. | [Colab](https://colab.research.google.com/github/codey-m/deep_learning/blob/main/final_project/FP_label_debugging.ipynb) |
| [When should a model decline to answer?](final_project/FP_abstention.ipynb) | Design a confidence-threshold calibration policy and test whether its promised coverage holds on unseen image corruptions. Builds on Modules 2 and 4. | [Colab](https://colab.research.google.com/github/codey-m/deep_learning/blob/main/final_project/FP_abstention.ipynb) |
| [Who gets the deep network?](final_project/FP_early_exit.ipynb) | Design an early-exit routing score under a fixed average compute budget. Compare accuracy and examine whether counted savings also appear in measured runtime. Builds on Module 3. | [Colab](https://colab.research.google.com/github/codey-m/deep_learning/blob/main/final_project/FP_early_exit.ipynb) |
| [Does generation order matter?](final_project/FP_factorization_order.ipynb) | Design a pixel ordering for an autoregressive image model and compare held-out likelihood while keeping model size fixed. Builds on Module 5. | [Colab](https://colab.research.google.com/github/codey-m/deep_learning/blob/main/final_project/FP_factorization_order.ipynb) |

## Supporting demonstration

[What survives image compression?](demos/pca_autoencoder/README.md) compares PCA and autoencoder reconstructions at matched per-image storage budgets. Its [notebook](demos/pca_autoencoder/PCA_Autoencoder_Demo.ipynb) presents the comparison and formulas using saved model results. The linked demo guide provides browser and Colab launch instructions.
