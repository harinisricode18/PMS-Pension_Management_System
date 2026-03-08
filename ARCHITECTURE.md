# PMS System Architecture

The Pension Management System follows a modular service-oriented architecture.

The system separates:

- presentation layer
- API layer
- business logic engines
- data persistence

---

## High Level Architecture

Frontend (React + Vite)
|
v
FastAPI Backend
|
|--- Financial Signal Engine
|--- Emergency Shield
|--- Pension Projection Engine
|--- Pension Health Engine
|
v
MongoDB Database

---

## Frontend Layer

The frontend provides the user interface for workers.

Responsibilities:

- dashboard visualization
- income recording
- savings management
- retirement projections
- account management

Technologies:

- React
- Vite
- TailwindCSS

---

## Backend Layer

The backend is built using FastAPI and provides REST APIs for all system operations.

Responsibilities:

- authentication
- savings calculations
- financial analytics
- retirement projections
- database access

Key files:

app.py

Main FastAPI application.

---

## Services Layer

Business logic is implemented in the services layer.

Services include:

### Financial Signal Engine
Calculates safe daily savings targets using income history and volatility.

### Emergency Shield
Prevents excessive savings during unstable income periods.

### Pension Projection Engine
Estimates retirement income based on current savings trajectory.

### Pension Health Engine
Evaluates retirement preparedness.

---

## Financial Signal Engine

The core intelligence of the system.

Inputs:

- income history
- survival minimum
- past savings targets

Algorithm components:

- Exponential Moving Average smoothing
- volatility estimation
- survival buffer constraint

Formula:

Safe Savings Target = min(EMA Estimate, Income Today − Survival Minimum)


This ensures that workers never save money required for daily living.

---

## Data Layer

MongoDB stores:

- user profiles
- income history
- savings records
- pension balances
- recommendation history

Collections include:


users
income_records
transactions
pension_accounts


---

## Real-Time Layer

A WebSocket manager enables real-time updates for:

- dashboard changes
- transaction events
- savings updates

---

## Design Principles

The system follows these principles:

Survival-first financial planning  
Savings recommendations must not compromise daily living needs.

Income volatility awareness  
Recommendations adapt to fluctuating earnings.

Behavioral finance guidance  
Encourages consistent savings habits.

Modular service architecture  
Each financial component is implemented as an independent service.

---

## Scalability

The architecture allows additional modules to be added easily, such as:

- credit scoring
- insurance recommendation
- micro-investment integration