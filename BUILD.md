# SectorNet Build Guide

## Prerequisites

*   [Node.js](https://nodejs.org/) (v16.x or later)
*   [DFINITY Canister SDK](https://internetcomputer.org/docs/current/developer-docs/setup/install) (dfx)
*   [Rust](https://www.rust-lang.org/)

## Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/deepsarda/SectorNet
    cd sectornet
    ```

2.  **Install frontend dependencies:**
    ```bash
    npm install
    ```

## Local Development

1.  **Start the local replica:**
    ```bash
    dfx start --background --clean
    ```

2.  **Deploy the canisters:**
    ```bash
    dfx deploy
    ```

3.  **Start the frontend development server:**
    ```bash
    npm run dev
    ```

The application will be available at `http://localhost:5173`.

## Production Build

1.  **Build the frontend:**
    ```bash
    npm run build
    ```

2.  **Deploy to the IC:**
    ```bash
    dfx deploy --network ic
    ```