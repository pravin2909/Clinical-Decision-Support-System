# Clinical Decision Support Engine

A clinical decision support platform for patients and doctors. Patients can
submit a medical image, typed symptoms, or a spoken description and receive a
clear, plain-language report describing the likely condition, its typical
progression, and usual treatment. The platform also connects patients and
doctors with consent-based record sharing, prescriptions, appointments,
messaging, and an AI assistant tailored to each role.

The platform supports clinical decision-making; it does not diagnose. Image
results include a confidence score.

## Features

- **Multi-modal intake** — submit an image, type symptoms, or speak them (speech
  is transcribed automatically).
- **Plain-language reports** — generated for each case, with a confidence score
  on image results.
- **AI assistant** — a role-aware assistant for both patients and doctors (see
  [Technology](#technology)).
- **Accounts and roles** — token-based authentication with separate patient and
  doctor experiences.
- **Care connections and consent** — a patient connects to a doctor (request →
  accept) and shares data per scope (records, images, chat); either side can
  revoke access at any time.
- **Prescriptions** — doctors issue prescriptions to connected patients; patients
  can also upload external prescriptions, which are read by OCR and structured.
- **Appointments** — request, approve and schedule, complete, or decline.
- **Messaging** — direct patient–doctor threads with visit context.
- **Health tracker** — patient vitals and observations with trends.
- **Streaming responses** — reports and assistant replies stream in real time.

## Technology

**Deep learning.** Medical images are processed by a two-stage pipeline. A
MobileNet V2 router identifies the image domain (eye, dental, or skin), then a
domain-specific Vision Transformer (ViT) classifies the condition. Each ViT is
trained for its domain using Shifted Patch Tokenization and Locality
Self-Attention, techniques suited to training transformers on smaller datasets.
A language model turns the classifier output — or the patient's typed/spoken
symptoms — into the final report.

| Domain | Conditions |
|---|---|
| Eye | Normal, Cataract, Diabetic Retinopathy, Glaucoma |
| Dental | Caries, Calculus, Gingivitis, Hypodontia, Tooth Discoloration, Mouth Ulcer, Ulcers |
| Skin | Melanoma, Eczema, Psoriasis, Basal Cell Carcinoma, Melanocytic Nevi, Benign Keratosis, Atopic Dermatitis, Seborrheic Keratoses, Tinea/Ringworm, Warts/Molluscum |

**Agentic AI.** The assistant is a tool-calling agent built on LangGraph. Two
role-specific agents share the same structure but differ in their prompt and
available tools. The patient agent reads only the signed-in patient's own data
and offers triage guidance, lifestyle advice, prescription parsing, and a
patient knowledge base. The doctor agent retrieves patient summaries and trends,
searches medical literature (Europe PMC and Semantic Scholar), checks drug
interactions (openFDA), builds case briefs, and drafts prescriptions. All
patient-data access is consent-gated on the server, and doctor responses include
inline citations to their sources.

Training and evaluation scripts for the models are in [`ml/`](ml/).

## Setup

**Prerequisites:** Python 3.11, Node 18+, PostgreSQL, and a local
OpenAI-compatible LLM (e.g. LM Studio or Ollama). Trained model weights (`.pth`)
go in `backend/Models/`.

```bash
# Backend (API on http://localhost:8000, docs at /docs)
cd backend
python -m venv ../.venv && source ../.venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # set DATABASE_URL, LLM_BASE_URL, ...
alembic upgrade head          # create the database schema
python main.py

# Frontend (http://localhost:5173)
cd frontend && npm install && npm run dev
```

## Project structure

```
backend/   FastAPI service, model pipeline, and LangGraph agents
ml/        model training & evaluation (MobileNet router + domain ViTs)
frontend/  React + TypeScript web app (patient & doctor dashboards)
docs/      technical write-up & design notes
infra/     local services (Docker)
```

The backend is FastAPI with token authentication and a PostgreSQL database
(schema managed by Alembic migrations); Docker runs the supporting services.

## Datasets

Training data is public.

| Domain | Source dataset |
|---|---|
| Eye | `gunavenkatdoddi/eye-diseases-classification` |
| Dental | `salmansajid05/oral-diseases` |
| Skin | `ismailpromus/skin-diseases-image-dataset` |

## Data and safety

The platform handles sensitive health-related content. This is a portfolio
project — use only synthetic or properly licensed images in demos, never real
patient data. Treat all output as input to professional care, not a diagnosis.
