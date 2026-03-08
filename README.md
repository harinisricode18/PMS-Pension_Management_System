# Pension Management System (PMS)

An AI-assisted pension planning system designed for gig workers and daily income earners.

The Pension Management System (PMS) helps users convert unpredictable daily income into long-term financial security by recommending safe savings targets, managing emergency funds, and projecting retirement outcomes.

This system combines behavioral finance principles with real-time financial analytics to guide workers toward sustainable retirement planning.

---

## Problem

Many gig workers and informal sector earners do not have access to structured retirement planning.

Their income is:

- Irregular
- Unpredictable
- Often consumed by daily survival needs

Traditional financial planning tools assume stable salaries and therefore fail to support these workers.

PMS addresses this gap.

---

## Solution

PMS introduces a **financial signal engine** that dynamically determines how much a worker can safely save each day based on:

- today's income
- income volatility
- survival expenses
- past income history

The system ensures that **savings never compromise daily survival**.

---

## Core Features

### Daily Income Logging
Workers can record daily earnings from different sources.

### Safe Savings Recommendation
A financial signal engine calculates how much money can be safely saved without affecting survival needs.

### Pension Vault
Savings allocated for long-term retirement.

### Liquid Vault
Emergency funds that can be accessed instantly.

### Retirement Projection
Projects estimated monthly retirement income at age 60 based on current savings.

### Pension Health Score
Evaluates the user's retirement preparedness using a scoring system.

### Emergency Shield
Protects workers from over-saving during financially unstable periods.

---

## Financial Signal Engine

The system uses a **risk-aware savings recommendation model**.

Key components:

- Exponential Moving Average (EMA) smoothing
- Income volatility analysis
- Survival cost constraint

Final safe savings formula:

```bash
Safe Target = min(EMA Estimate, Income Today − Survival Minimum)
```

This ensures savings recommendations are **stable and safe**.

---

## Tech Stack

Frontend
- React
- Vite
- TailwindCSS

Backend
- FastAPI
- Python

Database
- MongoDB

Other Components
- WebSocket manager for live updates
- Financial signal engine for savings recommendations

---

## Project Structure
```
pms
│
├── frontend/ # React + Vite frontend
│
├── database/ # MongoDB access layer
├── models/ # Data models
├── routes/ # API routes
├── services/ # Business logic engines
│
├── app.py # FastAPI application entry
├── api_models.py # API request models
├── auth_utils.py # Authentication helpers
├── ws_manager.py # WebSocket manager
│
├── requirements.txt
└── .env.example
```
---

## Running the Project

The UI is deployed on Vercel. The backend is running locally for development.

### Backend

```
pip install -r requirements.txt
uvicorn app:app --reload
```
Backend runs on:
```
http://localhost:8000
```
---

### Frontend
```
cd frontend
npm install
npm run dev
```
Frontend runs on:
```
http://localhost:5173
```

---

## Target Impact

PMS aims to empower workers to:

- build consistent savings habits
- avoid financial instability
- achieve retirement security

The system transforms **irregular daily income into structured long-term financial planning**.

---

## Hackathon Project

This project was developed as part of a fintech innovation hackathon focused on improving financial resilience for gig economy workers.
