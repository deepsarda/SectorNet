
# SectorNet Build and Deployment Guide

## Prerequisites

*   [Node.js](https://nodejs.org/) (v16.x or later)
*   [DFINITY Canister SDK](https://internetcomputer.org/docs/current/developer-docs/setup/install) (dfx)
*   [Rust](https://www.rust-lang.org/) and the `wasm32-unknown-unknown` target.

## Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/deepsarda/SectorNet
    cd SectorNet
    ```

2.  **Install frontend dependencies:**
    This command also installs the necessary `dev` dependencies for the project to work correctly.
    ```bash
    npm install
    ```

3.  **Add the Wasm32 Rust target:**
    If you haven't already, ensure the wasm32 target is installed for Rust.
    ```bash
    rustup target add wasm32-unknown-unknown
    ```

## Local Development & Deployment

This is a multi-canister application where canisters have dependencies on each other. For example, the `governance_canister` needs to know the `user_canister`'s ID when it's created. Because canister IDs are only generated upon creation, we cannot deploy everything with a single `dfx deploy` command.

The deployment must be done in stages: deploy foundational canisters, then deploy dependent canisters, and finally "wire" them together by calling configuration functions.

We can perform this process using two methods: the recommended automated script or by running the commands manually.
 
Note: The whole process does the build step multiple times and that is the expected behaviour and I do not have the time to fix it.
---

### Option 1: Automated Deployment (Recommended)

For convenience, an automated script `deploy.sh` is included in the project root to handle the entire deployment and configuration process.

1.  **Start the local replica:**
    Ensure you start with a clean state to avoid issues.
    ```bash
    dfx start --background --clean
    ```

2.  **Make the script executable (only needs to be done once):**
    ```bash
    chmod +x deploy.sh
    ```

3.  **Run the script:**
    ```bash
    ./deploy.sh
    ```

The script will build the canisters, deploy them in the correct order, configure their dependencies, and deploy the frontend. Upon completion, it will print the URL for the frontend.

---

### Option 2: Manual Step-by-Step Deployment

This method is useful for understanding the inner workings of the deployment process.

1.  **Start the local replica and build the project:**
    ```bash
    dfx start --background --clean
    cargo build --target wasm32-unknown-unknown --release
    ```

2.  **Get your Principal ID:**
    This will be set as the owner of the canisters.
    ```bash
    export MY_PRINCIPAL=$(dfx identity get-principal)
    echo "Your Principal is: $MY_PRINCIPAL"
    ```

3.  **Deploy Foundational Canisters:**
    ```bash
    dfx deploy user_canister --argument "(principal \"$MY_PRINCIPAL\")"
    dfx deploy global_feed_canister --argument "(principal \"$MY_PRINCIPAL\")"
    dfx deploy sector_factory_canister --argument "(principal \"$MY_PRINCIPAL\")"
    ```

4.  **Deploy Dependent Canisters:**
    ```bash
    # Get the IDs of the foundational canisters
    export USER_ID=$(dfx canister id user_canister)
    export GLOBAL_FEED_ID=$(dfx canister id global_feed_canister)
    export FACTORY_ID=$(dfx canister id sector_factory_canister)

    # Deploy canisters that depend on the ones above
    dfx deploy governance_canister --argument "(principal \"$MY_PRINCIPAL\", principal \"$USER_ID\", principal \"$GLOBAL_FEED_ID\")"
    dfx deploy sector_registry_canister --argument "(principal \"$MY_PRINCIPAL\", principal \"$FACTORY_ID\")"
    dfx deploy invite_canister --argument "(principal \"$MY_PRINCIPAL\", principal \"$FACTORY_ID\")"
    ```

5.  **Configure ("Wire") the Canisters:**
    ```bash
    # Get IDs of newly deployed canisters
    export REGISTRY_ID=$(dfx canister id sector_registry_canister)
    export INVITE_ID=$(dfx canister id invite_canister)
    export GOVERNANCE_ID=$(dfx canister id governance_canister)

    # Link factory to other canisters
    dfx canister call sector_factory_canister set_registry_canister "(principal \"$REGISTRY_ID\")"
    dfx canister call sector_factory_canister set_invite_canister "(principal \"$INVITE_ID\")"

    # Link global feed to governance
    dfx canister call global_feed_canister set_governance_canister "(principal \"$GOVERNANCE_ID\")"
    ```

6.  **Deploy the Frontend:**
    ```bash
    dfx deploy frontend
    ```

---

## Running the Frontend Development Server

After deploying the canisters using either method above, you can start the Vite development server for a better frontend development experience with hot-reloading.

```bash
npm run dev
```The application will be available at `http://localhost:5173`.

## Production Deployment

The process for deploying to the IC mainnet is the same, but you must add the `--network ic` flag to the `dfx deploy` or `dfx canister call` commands and ensure your wallet has cycles.

If using the automated script, you would need to modify it to include the `--network ic` flag for all `dfx` commands. For a manual mainnet deployment, an example command would look like:

```bash
dfx deploy user_canister --network ic --argument "(principal \"$MY_PRINCIPAL\")"
```