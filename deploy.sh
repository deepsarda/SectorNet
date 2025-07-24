#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# Preamble and Instructions
echo -e "\033[1;32mStarting SectorNet Automated Deployment Script...\033[0m"
echo "This script will deploy and configure all backend canisters in the correct order."
echo "Make sure your local replica is running with 'dfx start --background --clean'"
echo "--------------------------------------------------------------------"

# Initial Build and Principal Fetch
echo -e "\n\033[1;33mStep 0: Performing initial build and fetching your Principal ID...\033[0m"

cargo build --package sector_canister --target wasm32-unknown-unknown --release

# Build all rust canisters first to ensure the .wasm files are available
cargo build --target wasm32-unknown-unknown --release

dfx generate user_canister
dfx generate sector_factory_canister
dfx generate sector_registry_canister
dfx generate invite_canister
dfx generate sector_canister
dfx generate global_feed_canister
dfx generate governance_canister

echo "✅ Type declarations & Wasm Modules generated successfully."

# Get the principal of the currently selected identity
export MY_PRINCIPAL=$(dfx identity get-principal)
echo "✅ Deploying as owner: $MY_PRINCIPAL"

# Deploy Core, Independent Canisters 
echo -e "\n\033[1;33mStep 1: Deploying foundational canisters...\033[0m"

dfx deploy user_canister --argument "(principal \"$MY_PRINCIPAL\")"
dfx deploy global_feed_canister --argument "(principal \"$MY_PRINCIPAL\")"
dfx deploy sector_factory_canister --argument "(principal \"$MY_PRINCIPAL\")"

echo "✅ Foundational canisters deployed."

# Deploy Dependent Canisters
echo -e "\n\033[1;33mStep 2: Deploying canisters with dependencies...\033[0m"

# Get the canister IDs of the foundational services
export USER_ID=$(dfx canister id user_canister)
export GLOBAL_FEED_ID=$(dfx canister id global_feed_canister)
export FACTORY_ID=$(dfx canister id sector_factory_canister)

echo "  > User Canister ID: $USER_ID"
echo "  > Global Feed Canister ID: $GLOBAL_FEED_ID"
echo "  > Factory Canister ID: $FACTORY_ID"

dfx deploy governance_canister --argument "(principal \"$MY_PRINCIPAL\", principal \"$USER_ID\", principal \"$GLOBAL_FEED_ID\")"
dfx deploy sector_registry_canister --argument "(principal \"$MY_PRINCIPAL\", principal \"$FACTORY_ID\")"
dfx deploy invite_canister --argument "(principal \"$MY_PRINCIPAL\", principal \"$FACTORY_ID\")"

echo "✅ Dependent canisters deployed."

# Configure and "Wire" Canisters
echo -e "\n\033[1;33mStep 3: Configuring canisters and setting dependencies...\033[0m"

# Get the IDs of the newly deployed canisters
export REGISTRY_ID=$(dfx canister id sector_registry_canister)
export INVITE_ID=$(dfx canister id invite_canister)
export GOVERNANCE_ID=$(dfx canister id governance_canister)

echo "  > Registry Canister ID: $REGISTRY_ID"
echo "  > Invite Canister ID: $INVITE_ID"
echo "  > Governance Canister ID: $GOVERNANCE_ID"
# Tell the factory where the registry and invite canisters are
echo "  > Linking factory to registry and invite canisters..."
dfx canister call sector_factory_canister set_registry_canister "(principal \"$REGISTRY_ID\")"
dfx canister call sector_factory_canister set_invite_canister "(principal \"$INVITE_ID\")"

# Tell the global feed canister where the governance canister is
echo "  > Linking global feed to governance canister..."
dfx canister call global_feed_canister set_governance_canister "(principal \"$GOVERNANCE_ID\")"

echo "✅ Canister wiring complete."

echo "Adding Cycles to registry"
dfx ledger fabricate-cycles $REGISTRY_ID
echo "✅ Added Cycles complete."
# Deploy the Frontend
echo -e "\n\033[1;33mStep 4: Deploying the frontend canister...\033[0m"

# This command will use the generated .env file from the previous deployments
dfx deploy frontend

echo "✅ Frontend deployed."

# Completion
echo -e "\n\033[1;32m🎉 SectorNet Deployment Complete! 🎉\033[0m"
echo "--------------------------------------------------------------------"
echo "You can now access the frontend at:"
dfx canister id frontend | xargs -I {} echo "http://127.0.0.1:4943/?canisterId={}"
echo "--------------------------------------------------------------------"